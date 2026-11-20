import 'dart:async';
import 'package:get/get.dart';
import '../core/api.dart';
import 'auth_service.dart';

/// Measures how long each card stays on screen and sends it in batches.
/// The server uses this to learn interests: quick swipe-away = less of that, long read = more.
class Tracker extends GetxService {
  final _pending = <Map<String, dynamic>>[];
  String? _currentId;
  DateTime? _since;
  Timer? _timer;

  Tracker init() {
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => flush());
    return this;
  }

  /// Call when a new card becomes the visible one.
  void show(String postId) {
    _close();
    _currentId = postId;
    _since = DateTime.now();
  }

  void pause() => _close();

  void _close() {
    if (_currentId != null && _since != null) {
      _pending.add({'postId': _currentId, 'dwellMs': DateTime.now().difference(_since!).inMilliseconds});
    }
    _currentId = null;
    _since = null;
    if (_pending.length >= 10) flush();
  }

  Future<void> flush() async {
    if (_pending.isEmpty || !Get.find<AuthService>().loggedIn) {
      if (!Get.find<AuthService>().loggedIn) _pending.clear();
      return;
    }
    final batch = List<Map<String, dynamic>>.from(_pending);
    _pending.clear();
    try {
      await Api.instance.post('/posts/interactions/batch', {'events': batch});
    } catch (_) {
      // offline: keep the most recent ones for the next try
      _pending.insertAll(0, batch.take(40));
    }
  }

  @override
  void onClose() {
    _timer?.cancel();
    super.onClose();
  }
}
