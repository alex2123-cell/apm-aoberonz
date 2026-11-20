import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/feed_controller.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/swipe_feed.dart';

/// Browse by industry, or find a company.
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  List<Map<String, dynamic>> _companies = [];
  String _query = '';

  @override
  void initState() {
    super.initState();
    Api.instance.get('/companies').then((r) {
      if (mounted) setState(() => _companies = (r['items'] as List).cast<Map<String, dynamic>>());
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _companies
        .where((c) => _query.isEmpty || (c['name'] as String).toLowerCase().contains(_query.toLowerCase()))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Explore')),
      body: CustomScrollView(slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          sliver: SliverGrid.count(
            crossAxisCount: MediaQuery.of(context).size.width > 700 ? 4 : 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.6,
            children: industryIcons.entries
                .map((e) => InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => Get.to(() => IndustryFeedScreen(industry: e.key)),
                      child: Ink(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          gradient: LinearGradient(colors: [AppTheme.accent.withValues(alpha: 0.25), Colors.white10]),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Icon(e.value, size: 28),
                            const Spacer(),
                            Text(titleCase(e.key), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          ]),
                        ),
                      ),
                    ))
                .toList(),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search companies'),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        ),
        SliverList.builder(
          itemCount: filtered.length,
          itemBuilder: (_, i) {
            final c = filtered[i];
            return ListTile(
              leading: Icon(industryIcons[c['industry']] ?? Icons.factory),
              title: Row(children: [
                Flexible(child: Text(c['name'] as String, overflow: TextOverflow.ellipsis)),
                if (c['verified'] == true) const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(Icons.verified, size: 16, color: AppTheme.accent),
                ),
              ]),
              subtitle: Text('${titleCase(c['industry'] as String)} · ${c['county'] ?? 'Kenya'}'),
              onTap: () => Get.toNamed('/company/${c['slug']}'),
            );
          },
        ),
      ]),
    );
  }
}

class IndustryFeedScreen extends StatelessWidget {
  const IndustryFeedScreen({super.key, required this.industry});
  final String industry;

  @override
  Widget build(BuildContext context) {
    final c = Get.put(FeedController(tab: 'foryou', industry: industry), tag: 'industry-$industry');
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(title: Text(titleCase(industry))),
      body: SwipeFeed(controller: c),
    );
  }
}
