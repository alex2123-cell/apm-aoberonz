import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import '../controllers/feed_controller.dart';
import '../services/tracker.dart';
import 'post_card.dart';

/// Vertical swipe feed: one card per screen, pull down on the first card to refresh,
/// keyboard arrows on web/desktop, dwell tracking on every card.
class SwipeFeed extends StatefulWidget {
  const SwipeFeed({super.key, required this.controller, this.emptyText = 'Nothing here yet. Pull down to refresh.'});
  final FeedController controller;
  final String emptyText;

  @override
  State<SwipeFeed> createState() => SwipeFeedState();
}

class SwipeFeedState extends State<SwipeFeed> {
  final _page = PageController();
  final _focus = FocusNode();
  Tracker get _tracker => Get.find<Tracker>();

  @override
  void dispose() {
    _tracker.pause();
    _page.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> scrollToTopAndRefresh() async {
    if (_page.hasClients) await _page.animateToPage(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    await widget.controller.refreshFeed();
  }

  void _key(KeyEvent e) {
    if (e is! KeyDownEvent || !_page.hasClients) return;
    if (e.logicalKey == LogicalKeyboardKey.arrowDown || e.logicalKey == LogicalKeyboardKey.keyJ) {
      _page.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else if (e.logicalKey == LogicalKeyboardKey.arrowUp || e.logicalKey == LogicalKeyboardKey.keyK) {
      _page.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Obx(() {
      if (c.items.isEmpty && c.loading.value) {
        return const Center(child: CircularProgressIndicator());
      }
      if (c.items.isEmpty) {
        return RefreshIndicator(
          onRefresh: c.refreshFeed,
          child: ListView(children: [
            SizedBox(height: MediaQuery.of(context).size.height * 0.35),
            Icon(c.error.value != null ? Icons.wifi_off : Icons.inbox, size: 48, color: Colors.white38),
            const SizedBox(height: 12),
            Center(child: Text(c.error.value ?? widget.emptyText, style: const TextStyle(color: Colors.white60))),
          ]),
        );
      }
      // first visible card starts its dwell timer
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (c.index.value < c.items.length) _tracker.show(c.items[c.index.value].id);
      });
      return KeyboardListener(
        focusNode: _focus,
        autofocus: true,
        onKeyEvent: _key,
        child: RefreshIndicator(
          onRefresh: c.refreshFeed,
          edgeOffset: 90,
          child: PageView.builder(
            controller: _page,
            scrollDirection: Axis.vertical,
            physics: const AlwaysScrollableScrollPhysics(parent: PageScrollPhysics()),
            itemCount: c.items.length + (c.hasMore.value ? 1 : 0),
            onPageChanged: (i) {
              c.onPageChanged(i);
              if (i < c.items.length) _tracker.show(c.items[i].id);
            },
            itemBuilder: (_, i) {
              if (i >= c.items.length) return const Center(child: CircularProgressIndicator());
              return PostCard(key: ValueKey(c.items[i].id), post: c.items[i], controller: c);
            },
          ),
        ),
      );
    });
  }
}
