import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/feed_controller.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../models/post.dart';
import '../widgets/post_card.dart';

/// /company/:slug — company header + its latest updates.
class CompanyScreen extends StatefulWidget {
  const CompanyScreen({super.key});
  @override
  State<CompanyScreen> createState() => _CompanyScreenState();
}

class _CompanyScreenState extends State<CompanyScreen> {
  Map<String, dynamic>? _company;

  @override
  void initState() {
    super.initState();
    Api.instance.get('/companies/${Get.parameters['slug']}').then((c) {
      if (mounted) setState(() => _company = c);
    }).catchError((e) {
      Get.snackbar('Aoberonz', Api.message(e));
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = _company;
    return Scaffold(
      appBar: AppBar(title: Text(c?['name'] as String? ?? '')),
      body: c == null
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  CircleAvatar(radius: 28, child: Icon(industryIcons[c['industry']] ?? Icons.factory)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Flexible(child: Text(c['name'] as String, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
                        if (c['verified'] == true)
                          const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified, color: AppTheme.accent, size: 18)),
                      ]),
                      Text('${titleCase(c['industry'] as String)} · ${c['county'] ?? 'Kenya'}',
                          style: const TextStyle(color: Colors.white60)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 12),
                Text('${(c['_count'] as Map)['followers']} followers · ${(c['_count'] as Map)['posts']} updates'),
              ]),
            ),
    );
  }
}

/// /p/:id — a single shared post (deep links from social media land here).
class PostScreen extends StatefulWidget {
  const PostScreen({super.key});
  @override
  State<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends State<PostScreen> {
  Post? _post;
  final _controller = Get.put(FeedController(tab: 'latest'), tag: 'single-post');

  @override
  void initState() {
    super.initState();
    Api.instance.get('/posts/${Get.parameters['id']}').then((j) {
      if (mounted) setState(() => _post = Post.fromJson(j));
    }).catchError((e) {
      Get.snackbar('Aoberonz', Api.message(e));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        actions: [TextButton(onPressed: () => Get.offAllNamed('/'), child: const Text('Open feed'))],
      ),
      body: _post == null
          ? const Center(child: CircularProgressIndicator())
          : PostCard(post: _post!, controller: _controller),
    );
  }
}
