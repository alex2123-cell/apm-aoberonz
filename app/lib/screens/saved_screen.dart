import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../models/post.dart';
import '../services/auth_service.dart';

class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});
  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> {
  Future<List<Post>>? _future;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    if (!Get.find<AuthService>().loggedIn) return;
    _future = Api.instance.get('/me/saved').then(
          (r) => (r['items'] as List).map((e) => Post.fromJson(e as Map<String, dynamic>)).toList(),
        );
  }

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    return Scaffold(
      appBar: AppBar(title: const Text('Saved')),
      body: Obx(() {
        if (!auth.loggedIn) {
          return Center(
            child: FilledButton(onPressed: () => Get.toNamed('/auth'), child: const Text('Log in to see saved posts')),
          );
        }
        if (_future == null) _reload(); // logged in after this screen opened
        return RefreshIndicator(
          onRefresh: () async => setState(_reload),
          child: FutureBuilder<List<Post>>(
            future: _future,
            builder: (_, snap) {
              if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              final items = snap.data ?? const [];
              if (items.isEmpty) {
                return ListView(children: const [
                  SizedBox(height: 200),
                  Center(child: Text('Tap the bookmark on any update to keep it here.')),
                ]);
              }
              return GridView.builder(
                padding: const EdgeInsets.all(8),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 220, childAspectRatio: 0.7, mainAxisSpacing: 8, crossAxisSpacing: 8),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final p = items[i];
                  return InkWell(
                    onTap: () => Get.toNamed('/p/${p.id}'),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Stack(fit: StackFit.expand, children: [
                        if (p.mediaUrl != null)
                          CachedNetworkImage(imageUrl: p.mediaUrl!, fit: BoxFit.cover)
                        else
                          Container(color: Colors.white10, child: Icon(industryIcons[p.industry], size: 48)),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [Colors.transparent, Colors.black87]),
                          ),
                        ),
                        Positioned(
                          left: 8,
                          right: 8,
                          bottom: 8,
                          child: Text(p.headline, maxLines: 3, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                      ]),
                    ),
                  );
                },
              );
            },
          ),
        );
      }),
    );
  }
}
