import 'package:get/get.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../core/config.dart';

/// Listens for "post:new" from the server and counts unseen updates.
/// The feed shows a "N new updates" pill; tapping it refreshes.
class RealtimeService extends GetxService {
  final newCount = 0.obs;
  final latestHeadline = ''.obs;
  final connected = false.obs;
  io.Socket? _socket;

  RealtimeService init() {
    _socket = io.io(
      AppConfig.apiUrl,
      io.OptionBuilder().setTransports(['websocket']).enableReconnection().disableAutoConnect().build(),
    );
    _socket!
      ..onConnect((_) => connected.value = true)
      ..onDisconnect((_) => connected.value = false)
      ..on('post:new', (data) {
        newCount.value++;
        if (data is Map && data['headline'] is String) latestHeadline.value = data['headline'] as String;
      })
      ..connect();
    return this;
  }

  void subscribe(List<String> industries) {
    _socket?.emit('subscribe', industries.map((i) => 'industry:$i').toList());
  }

  void clear() {
    newCount.value = 0;
    latestHeadline.value = '';
  }

  @override
  void onClose() {
    _socket?.dispose();
    super.onClose();
  }
}
