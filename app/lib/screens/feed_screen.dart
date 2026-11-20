import 'dart:async';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/feed_controller.dart';
import '../core/config.dart';
import '../core/theme.dart';
import '../services/auth_service.dart';
import '../services/realtime_service.dart';
import '../widgets/swipe_feed.dart';

/// Home: For You / Following / Latest, swiped vertically, with a live "new updates" pill.
class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});
  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  final _keys = [GlobalKey<SwipeFeedState>(), GlobalKey<SwipeFeedState>(), GlobalKey<SwipeFeedState>()];
  final _controllers = [
    Get.put(FeedController(tab: 'foryou'), tag: 'foryou'),
    Get.put(FeedController(tab: 'following'), tag: 'following'),
    Get.put(FeedController(tab: 'latest'), tag: 'latest'),
  ];
  Timer? _breakTimer;

  @override
  void initState() {
    super.initState();
    final auth = Get.find<AuthService>();
    Get.find<RealtimeService>().subscribe(auth.interests);
    _breakTimer = Timer.periodic(const Duration(minutes: AppConfig.breakReminderMinutes), (_) {
      if (auth.breakReminder.value && mounted) {
        Get.snackbar('Time check', "You've been catching up for ${AppConfig.breakReminderMinutes} minutes. "
            'Fresh updates will be waiting.', duration: const Duration(seconds: 5));
      }
    });
  }

  @override
  void dispose() {
    _breakTimer?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _showNew() async {
    Get.find<RealtimeService>().clear();
    _tabs.animateTo(0);
    await _keys[0].currentState?.scrollToTopAndRefresh();
  }

  @override
  Widget build(BuildContext context) {
    final rt = Get.find<RealtimeService>();
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        toolbarHeight: 44,
        title: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.center,
          dividerColor: Colors.transparent,
          indicatorColor: Colors.white,
          labelStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          unselectedLabelColor: Colors.white60,
          tabs: const [Tab(text: 'For You'), Tab(text: 'Following'), Tab(text: 'Latest')],
        ),
      ),
      body: Stack(children: [
        TabBarView(
          controller: _tabs,
          physics: const NeverScrollableScrollPhysics(), // vertical swipes only, tabs by tap
          children: [
            SwipeFeed(key: _keys[0], controller: _controllers[0]),
            SwipeFeed(key: _keys[1], controller: _controllers[1],
                emptyText: 'Follow companies to fill this tab.'),
            SwipeFeed(key: _keys[2], controller: _controllers[2]),
          ],
        ),
        Positioned(
          top: MediaQuery.of(context).padding.top + 52,
          left: 0,
          right: 0,
          child: Obx(() {
            final n = rt.newCount.value;
            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: n == 0
                  ? const SizedBox.shrink()
                  : Center(
                      key: ValueKey(n),
                      child: ActionChip(
                        backgroundColor: AppTheme.accent,
                        avatar: const Icon(Icons.arrow_upward, size: 16, color: Colors.black),
                        label: Text('$n new ${n == 1 ? 'update' : 'updates'}',
                            style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w700)),
                        onPressed: _showNew,
                      ),
                    ),
            );
          }),
        ),
      ]),
    );
  }
}
