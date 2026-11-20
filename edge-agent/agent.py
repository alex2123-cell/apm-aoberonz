"""
Aoberonz edge agent.

Runs at the company site (Raspberry Pi, Jetson, mini PC or any laptop) next to the devices.
It watches a source, decides when something worth reporting happened, and sends a small
event (labels + confidence, never continuous raw footage) to the Aoberonz API.

Sources:
  camera  - RTSP/HTTP CCTV stream, USB webcam index, or HDMI capture card (shows up as a webcam)
  radio   - internet radio / TV audio stream (via FFmpeg) -> speech-to-text with Whisper
  sensor  - MQTT topic with JSON readings (IoT)

Examples:
  python agent.py camera --source rtsp://user:pass@192.168.1.20:554/stream1 --location "Main gate"
  python agent.py camera --source 0                       # first USB camera / HDMI capture
  python agent.py radio  --source https://stream.example.com/live.mp3 --chunk 30
  python agent.py sensor --broker localhost --topic plant/line1/# --field temperature --max 85

Config comes from environment variables (or a .env file):
  AOBERONZ_API_URL=https://api.aoberonz.com
  AOBERONZ_DEVICE_KEY=aob_...            (shown once when the device is registered)
"""
from __future__ import annotations

import argparse
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

API_URL = os.environ.get("AOBERONZ_API_URL", "http://localhost:4000").rstrip("/")
DEVICE_KEY = os.environ.get("AOBERONZ_DEVICE_KEY", "")
BUFFER_FILE = Path(os.environ.get("AOBERONZ_BUFFER", "aoberonz_buffer.jsonl"))


# ---------------------------------------------------------------- sending, with offline buffer
class Sender:
    """Sends events; if the site is offline, keeps them on disk and retries in order."""

    def __init__(self) -> None:
        self.q: "queue.Queue[dict]" = queue.Queue()
        threading.Thread(target=self._loop, daemon=True).start()
        threading.Thread(target=self._heartbeat, daemon=True).start()

    def send(self, event: dict) -> None:
        event.setdefault("capturedAt", datetime.now(timezone.utc).isoformat())
        self.q.put(event)

    def _post(self, path: str, body: dict) -> bool:
        try:
            r = requests.post(
                f"{API_URL}/api/ingest/{path}",
                json=body,
                headers={"x-device-key": DEVICE_KEY},
                timeout=10,
            )
            if r.status_code in (200, 202):
                return True
            if r.status_code in (400, 401):
                print(f"[agent] rejected ({r.status_code}): {r.text[:200]}", file=sys.stderr)
                return True  # don't retry bad data or a bad key forever
            return False
        except requests.RequestException:
            return False

    def _flush_buffer(self) -> None:
        if not BUFFER_FILE.exists():
            return
        lines = BUFFER_FILE.read_text().splitlines()
        remaining = []
        for i, line in enumerate(lines):
            if not self._post("events", json.loads(line)):
                remaining = lines[i:]
                break
        BUFFER_FILE.write_text("\n".join(remaining) + ("\n" if remaining else ""))

    def _loop(self) -> None:
        while True:
            event = self.q.get()
            self._flush_buffer()
            if self._post("events", event):
                print(f"[agent] sent {event['kind']} ({event['confidence']:.2f})")
            else:
                with BUFFER_FILE.open("a") as f:
                    f.write(json.dumps(event) + "\n")
                print("[agent] offline, buffered event")

    def _heartbeat(self) -> None:
        while True:
            self._post("heartbeat", {})
            time.sleep(60)


# ---------------------------------------------------------------- camera / HDMI
def run_camera(args: argparse.Namespace, sender: Sender) -> None:
    import cv2  # opencv-python

    source = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        sys.exit(f"Cannot open video source {args.source}")

    detector = None
    if args.model:
        from ultralytics import YOLO  # optional: pip install ultralytics

        detector = YOLO(args.model)

    face = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    backsub = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=32, detectShadows=False)
    last_sent = 0.0
    frame_no = 0
    print(f"[agent] watching {args.source}")

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(2)
            cap.release()
            cap = cv2.VideoCapture(source)  # camera dropped: reconnect
            continue
        frame_no += 1
        if frame_no % args.every != 0:
            continue

        small = cv2.resize(frame, (640, 360))
        mask = backsub.apply(small)
        moving = float((mask > 0).mean())
        if moving < args.motion or time.time() - last_sent < args.cooldown:
            continue  # idle scene, or we reported recently

        labels: list[str] = []
        confidence = min(0.95, 0.6 + moving * 2)
        kind = "motion"
        if detector is not None:
            result = detector(small, verbose=False)[0]
            names = [result.names[int(c)] for c in result.boxes.cls.tolist()]
            confs = result.boxes.conf.tolist()
            labels = sorted(set(names))
            if confs:
                confidence = float(max(confs))
            trucks = names.count("truck") + names.count("bus")
            if trucks >= 3:
                kind = "vehicle_convoy"
            elif "truck" in names:
                kind = "truck_departure"
            elif names.count("person") >= 15:
                kind = "crowd"
            elif not labels:
                continue  # movement but nothing recognisable

        event = {"kind": kind, "labels": labels, "confidence": round(confidence, 3)}

        # Privacy by design: blur faces before anything leaves the site.
        if args.snapshot_dir:
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            for (x, y, w, h) in face.detectMultiScale(gray, 1.2, 5):
                small[y : y + h, x : x + w] = cv2.GaussianBlur(small[y : y + h, x : x + w], (51, 51), 30)
            name = f"{int(time.time())}.jpg"
            cv2.imwrite(str(Path(args.snapshot_dir) / name), small)
            if args.snapshot_base_url:
                event["mediaUrl"] = f"{args.snapshot_base_url.rstrip('/')}/{name}"

        sender.send(event)
        last_sent = time.time()


# ---------------------------------------------------------------- radio / TV audio
def run_radio(args: argparse.Namespace, sender: Sender) -> None:
    import whisper  # pip install openai-whisper  (needs ffmpeg installed)

    model = whisper.load_model(args.whisper_model)
    keywords = [k.strip().lower() for k in args.keywords.split(",") if k.strip()]
    print(f"[agent] listening to {args.source}, keywords={keywords or 'any'}")
    while True:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = tmp.name
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", args.source, "-t", str(args.chunk), "-ac", "1", "-ar", "16000", path]
        if subprocess.run(cmd).returncode != 0:
            time.sleep(5)
            continue
        result = model.transcribe(path, language=args.language or None, fp16=False)
        os.unlink(path)
        text = (result.get("text") or "").strip()
        if len(text) < 40:
            continue
        hits = [k for k in keywords if k in text.lower()]
        if keywords and not hits:
            continue
        sender.send({"kind": "speech", "labels": hits[:10], "confidence": 0.8, "transcript": text[:4900]})


# ---------------------------------------------------------------- IoT sensors over MQTT
def run_sensor(args: argparse.Namespace, sender: Sender) -> None:
    import paho.mqtt.client as mqtt  # pip install paho-mqtt

    last: dict[str, float] = {}

    def on_message(_client, _userdata, msg):
        try:
            data = json.loads(msg.payload)
            value = float(data[args.field])
        except (ValueError, KeyError, TypeError):
            return
        out_of_range = (args.max is not None and value > args.max) or (args.min is not None and value < args.min)
        if out_of_range and time.time() - last.get(msg.topic, 0) > args.cooldown:
            last[msg.topic] = time.time()
            sender.send({
                "kind": "sensor_threshold",
                "labels": [args.field, msg.topic.split("/")[-1]],
                "confidence": 0.99,
                "reading": {args.field: value, "topic": msg.topic},
            })

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect(args.broker, args.port)
    client.subscribe(args.topic)
    print(f"[agent] subscribed to {args.topic} on {args.broker}")
    client.loop_forever()


def main() -> None:
    p = argparse.ArgumentParser(description="Aoberonz edge agent")
    sub = p.add_subparsers(dest="mode", required=True)

    cam = sub.add_parser("camera")
    cam.add_argument("--source", required=True, help="RTSP/HTTP URL or webcam index")
    cam.add_argument("--model", default="", help="YOLO weights, e.g. yolov8n.pt (optional)")
    cam.add_argument("--every", type=int, default=10, help="analyse every Nth frame")
    cam.add_argument("--motion", type=float, default=0.04, help="share of pixels moving to count as activity")
    cam.add_argument("--cooldown", type=int, default=300, help="seconds between events")
    cam.add_argument("--snapshot-dir", default="", help="save face-blurred snapshots here")
    cam.add_argument("--snapshot-base-url", default="", help="public URL where snapshot-dir is served")

    radio = sub.add_parser("radio")
    radio.add_argument("--source", required=True, help="stream URL or audio device")
    radio.add_argument("--chunk", type=int, default=30, help="seconds per transcription chunk")
    radio.add_argument("--keywords", default="factory,launch,port,shipment,plant,tender,jobs,kiwanda,bandari")
    radio.add_argument("--language", default="", help="en, sw, or blank to auto-detect")
    radio.add_argument("--whisper-model", default="base")

    sensor = sub.add_parser("sensor")
    sensor.add_argument("--broker", default="localhost")
    sensor.add_argument("--port", type=int, default=1883)
    sensor.add_argument("--topic", required=True)
    sensor.add_argument("--field", required=True)
    sensor.add_argument("--max", type=float)
    sensor.add_argument("--min", type=float)
    sensor.add_argument("--cooldown", type=int, default=600)

    args = p.parse_args()
    if not DEVICE_KEY:
        sys.exit("Set AOBERONZ_DEVICE_KEY (shown once when you registered the device).")
    sender = Sender()
    {"camera": run_camera, "radio": run_radio, "sensor": run_sensor}[args.mode](args, sender)


if __name__ == "__main__":
    main()
