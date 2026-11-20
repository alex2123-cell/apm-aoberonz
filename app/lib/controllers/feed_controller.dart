import 'package:get/get.dart';
import 'package:share_plus/share_plus.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../models/post.dart';
import '../services/auth_service.dart';

/// One controller per feed (For You, Following, Latest, or an industry filter).
/// Infinite: loads the next page before the user reaches the end, never repeats a card.
class FeedController extends GetxController {
  FeedController({required this.tab, this.industry});
  final String tab; // foryou | following | latest
  final String? industry;

  final items = <Post>[].obs;
  final loading = false.obs;
  final error = RxnString();
  final hasMore = true.obs;
  final index = 0.obs;
  String? _cursor;
  final _shown = <String>{};

  @override
  void onInit() {
    super.onInit();
    refreshFeed();
  }

  Future<void> refreshFeed() async {
    _cursor = null;
    _shown.clear();
    hasMore.value = true;
    await _load(reset: true);
  }

  Future<void> loadMore() async {
    if (loading.value || !hasMore.value) return;
    await _load(reset: false);
  }

  void onPageChanged(int i) {
    index.value = i;
    if (i >= items.length - AppConfig.prefetchDistance) loadMore();
  }

  Future<void> _load({required bool reset}) async {
    loading.value = true;
    error.value = null;
    try {
      final q = <String, dynamic>{'tab': tab, 'limit': AppConfig.pageSize};
      if (industry != null) q['industry'] = industry;
      if (tab == 'foryou' && _shown.isNotEmpty) q['exclude'] = _shown.take(200).join(',');
      if (tab != 'foryou' && _cursor != null) q['cursor'] = _cursor;
      final res = await Api.instance.get('/feed', query: q);
      final page = (res['items'] as List).map((e) => Post.fromJson(e as Map<String, dynamic>)).toList()
        ..removeWhere((p) => _shown.contains(p.id));
      _shown.addAll(page.map((p) => p.id));
      _cursor = res['nextCursor'] as String?;
      hasMore.value = _cursor != null && page.isNotEmpty;
      if (reset) {
        items.assignAll(page);
        index.value = 0;
      } else {
        items.addAll(page);
      }
    } catch (e) {
      error.value = Api.message(e);
    } finally {
      loading.value = false;
    }
  }

  bool _needLogin() {
    if (Get.find<AuthService>().loggedIn) return false;
    Get.toNamed('/auth');
    return true;
  }

  /// Optimistic: the heart fills at once, and rolls back if the server fails.
  Future<void> toggleLike(Post p) async {
    if (_needLogin()) return;
    p.liked = !p.liked;
    p.likeCount += p.liked ? 1 : -1;
    items.refresh();
    try {
      final r = await Api.instance.post('/posts/${p.id}/like');
      p.liked = r['liked'] == true;
    } catch (e) {
      p.liked = !p.liked;
      p.likeCount += p.liked ? 1 : -1;
      Get.snackbar('Aoberonz', Api.message(e));
    }
    items.refresh();
  }

  Future<void> toggleSave(Post p) async {
    if (_needLogin()) return;
    p.saved = !p.saved;
    items.refresh();
    try {
      final r = await Api.instance.post('/posts/${p.id}/save');
      p.saved = r['saved'] == true;
    } catch (e) {
      p.saved = !p.saved;
      Get.snackbar('Aoberonz', Api.message(e));
    }
    items.refresh();
  }

  Future<void> share(Post p) async {
    try {
      final r = await Api.instance.post('/posts/${p.id}/share');
      p.shareCount++;
      items.refresh();
      await Share.share('${p.headline}\n${r['url'] ?? '${AppConfig.webUrl}/p/${p.id}'}');
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    }
  }

  Future<void> report(Post p, String reason) async {
    if (_needLogin()) return;
    try {
      await Api.instance.post('/posts/${p.id}/report', {'reason': reason});
      items.remove(p);
      Get.snackbar('Aoberonz', 'Thanks. Our editors will check it.', duration: const Duration(seconds: 2));
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    }
  }

  Future<bool> toggleFollow(Post p) async {
    if (_needLogin()) return false;
    try {
      final r = await Api.instance.post('/companies/${p.company.id}/follow');
      final on = r['following'] == true;
      Get.snackbar('Aoberonz', on ? 'Following ${p.company.name}' : 'Unfollowed ${p.company.name}',
          duration: const Duration(seconds: 2));
      return on;
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
      return false;
    }
  }
}
