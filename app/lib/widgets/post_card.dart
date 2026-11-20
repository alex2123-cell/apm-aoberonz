import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../controllers/feed_controller.dart';
import '../core/theme.dart';
import '../models/post.dart';

/// Full-screen card. Double-tap to like, tap the summary to expand, action rail on the right.
class PostCard extends StatefulWidget {
  const PostCard({super.key, required this.post, required this.controller});
  final Post post;
  final FeedController controller;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> with SingleTickerProviderStateMixin {
  bool _expanded = false;
  bool _following = false;
  late final AnimationController _heart =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 700));

  @override
  void dispose() {
    _heart.dispose();
    super.dispose();
  }

  void _doubleTapLike() {
    if (!widget.post.liked) widget.controller.toggleLike(widget.post);
    _heart.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.post;
    final c = widget.controller;
    return GestureDetector(
      onDoubleTap: _doubleTapLike,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _background(p),
          // readability gradient
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black54, Colors.transparent, Colors.transparent, Colors.black87, Colors.black],
                stops: [0, 0.18, 0.45, 0.8, 1],
              ),
            ),
          ),
          // text block
          Positioned(
            left: 16,
            right: 84,
            bottom: 24,
            child: SafeArea(
              top: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _companyRow(p),
                  const SizedBox(height: 10),
                  Text(
                    p.headline,
                    style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700, height: 1.25),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: AnimatedSize(
                      duration: const Duration(milliseconds: 200),
                      child: Text(
                        p.summary,
                        maxLines: _expanded ? 30 : 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.white70),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    _pill(industryIcons[p.industry] ?? Icons.factory, titleCase(p.industry)),
                    if (p.county != null) _pill(Icons.place, p.county!),
                    _pill(Icons.schedule, p.age),
                    if (p.aiGenerated) _pill(Icons.auto_awesome, 'AI-assisted'),
                  ]),
                ],
              ),
            ),
          ),
          // action rail
          Positioned(
            right: 8,
            bottom: 40,
            child: SafeArea(
              top: false,
              child: Column(children: [
                _action(p.liked ? Icons.favorite : Icons.favorite_border, compact(p.likeCount),
                    () => c.toggleLike(p), color: p.liked ? Colors.redAccent : null),
                _action(p.saved ? Icons.bookmark : Icons.bookmark_border, p.saved ? 'Saved' : 'Save',
                    () => c.toggleSave(p), color: p.saved ? AppTheme.accent : null),
                _action(Icons.share, compact(p.shareCount), () => c.share(p)),
                _action(Icons.more_horiz, '', () => _reportSheet(p)),
              ]),
            ),
          ),
          // double-tap heart burst
          Center(
            child: AnimatedBuilder(
              animation: _heart,
              builder: (_, __) {
                final t = _heart.value;
                if (t == 0 || t == 1) return const SizedBox.shrink();
                final scale = t < 0.3 ? t / 0.3 * 1.2 : 1.2 - (t - 0.3) * 0.3;
                return Opacity(
                  opacity: t < 0.7 ? 1 : (1 - t) / 0.3,
                  child: Transform.scale(scale: scale, child: const Icon(Icons.favorite, size: 110, color: Colors.white)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _reportSheet(Post p) {
    const reasons = ['Wrong or misleading', 'Shows a person who could be identified', 'Harmful or unsafe', 'Spam'];
    Get.bottomSheet(
      SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ListTile(title: Text('Report this update', style: TextStyle(fontWeight: FontWeight.w700))),
          for (final r in reasons)
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(r),
              onTap: () {
                Get.back();
                widget.controller.report(p, r);
              },
            ),
        ]),
      ),
      backgroundColor: const Color(0xFF12171E),
    );
  }

  Widget _background(Post p) {
    if (p.mediaUrl != null && p.mediaType != 'audio') {
      return CachedNetworkImage(
        imageUrl: p.mediaUrl!,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 150),
        placeholder: (_, __) => _fallback(p),
        errorWidget: (_, __, ___) => _fallback(p),
      );
    }
    return _fallback(p);
  }

  Widget _fallback(Post p) => Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppTheme.accent.withValues(alpha: 0.35), AppTheme.ink],
          ),
        ),
        child: Icon(industryIcons[p.industry] ?? Icons.factory, size: 160, color: Colors.white10),
      );

  Widget _companyRow(Post p) => Row(children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: Colors.white24,
          child: Text(p.company.name.characters.first, style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: GestureDetector(
            onTap: () => Get.toNamed('/company/${p.company.slug}'),
            child: Text(p.company.name,
                overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          ),
        ),
        if (p.company.verified) ...[
          const SizedBox(width: 4),
          const Icon(Icons.verified, size: 16, color: AppTheme.accent),
        ],
        const SizedBox(width: 10),
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            visualDensity: VisualDensity.compact,
            side: const BorderSide(color: Colors.white54),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          onPressed: () async {
            final on = await widget.controller.toggleFollow(p);
            if (mounted) setState(() => _following = on);
          },
          child: Text(_following ? 'Following' : 'Follow'),
        ),
      ]);

  Widget _pill(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: Colors.white70),
          const SizedBox(width: 4),
          Text(text, style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ]),
      );

  Widget _action(IconData icon, String label, VoidCallback onTap, {Color? color}) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: InkResponse(
          onTap: onTap,
          radius: 28,
          child: Column(children: [
            Icon(icon, size: 32, color: color ?? Colors.white),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
      );
}
