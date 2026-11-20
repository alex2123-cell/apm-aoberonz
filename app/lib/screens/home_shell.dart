import 'package:flutter/material.dart';
import '../core/theme.dart';
import 'explore_screen.dart';
import 'feed_screen.dart';
import 'profile_screen.dart';
import 'saved_screen.dart';

/// Bottom navigation on phones, side rail on wide screens (web/tablet).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  static const _pages = [FeedScreen(), ExploreScreen(), SavedScreen(), ProfileScreen()];
  static const _dest = [
    (Icons.home_outlined, Icons.home, 'Feed'),
    (Icons.explore_outlined, Icons.explore, 'Explore'),
    (Icons.bookmark_border, Icons.bookmark, 'Saved'),
    (Icons.person_outline, Icons.person, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.of(context).size.width >= 900;
    final body = IndexedStack(index: _tab, children: _pages);
    if (wide) {
      return Scaffold(
        body: Row(children: [
          NavigationRail(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            labelType: NavigationRailLabelType.all,
            backgroundColor: AppTheme.ink,
            leading: const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('AOBERONZ', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2)),
            ),
            destinations: [
              for (final d in _dest)
                NavigationRailDestination(icon: Icon(d.$1), selectedIcon: Icon(d.$2), label: Text(d.$3)),
            ],
          ),
          // phone-shaped column in the middle keeps the swipe feel on desktop browsers
          Expanded(child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: body))),
        ]),
      );
    }
    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        height: 62,
        destinations: [
          for (final d in _dest) NavigationDestination(icon: Icon(d.$1), selectedIcon: Icon(d.$2), label: d.$3),
        ],
      ),
    );
  }
}
