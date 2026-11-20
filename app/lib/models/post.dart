class CompanyRef {
  final String id;
  final String name;
  final String slug;
  final bool verified;
  final String? logoUrl;

  CompanyRef({required this.id, required this.name, required this.slug, required this.verified, this.logoUrl});

  factory CompanyRef.fromJson(Map<String, dynamic> j) => CompanyRef(
        id: j['id'] as String,
        name: j['name'] as String,
        slug: j['slug'] as String,
        verified: (j['verified'] as bool?) ?? false,
        logoUrl: j['logoUrl'] as String?,
      );
}

class Post {
  final String id;
  final String headline;
  final String summary;
  final String industry;
  final String? county;
  final String? mediaUrl;
  final String? mediaType;
  final List<String> tags;
  final bool aiGenerated;
  final double confidence;
  final DateTime? publishedAt;
  final CompanyRef company;
  int likeCount;
  int saveCount;
  int shareCount;
  bool liked;
  bool saved;

  Post({
    required this.id,
    required this.headline,
    required this.summary,
    required this.industry,
    required this.company,
    this.county,
    this.mediaUrl,
    this.mediaType,
    this.tags = const [],
    this.aiGenerated = true,
    this.confidence = 1,
    this.publishedAt,
    this.likeCount = 0,
    this.saveCount = 0,
    this.shareCount = 0,
    this.liked = false,
    this.saved = false,
  });

  factory Post.fromJson(Map<String, dynamic> j) => Post(
        id: j['id'] as String,
        headline: j['headline'] as String,
        summary: j['summary'] as String,
        industry: j['industry'] as String,
        county: j['county'] as String?,
        mediaUrl: j['mediaUrl'] as String?,
        mediaType: j['mediaType'] as String?,
        tags: ((j['tags'] as List?) ?? const []).map((e) => e.toString()).toList(),
        aiGenerated: (j['aiGenerated'] as bool?) ?? true,
        confidence: ((j['confidence'] as num?) ?? 1).toDouble(),
        publishedAt: j['publishedAt'] == null ? null : DateTime.parse(j['publishedAt'] as String).toLocal(),
        company: CompanyRef.fromJson(j['company'] as Map<String, dynamic>),
        likeCount: (j['likeCount'] as int?) ?? 0,
        saveCount: (j['saveCount'] as int?) ?? 0,
        shareCount: (j['shareCount'] as int?) ?? 0,
        liked: (j['liked'] as bool?) ?? false,
        saved: (j['saved'] as bool?) ?? false,
      );

  /// "3 min ago", "5 h ago", "2 d ago"
  String get age {
    if (publishedAt == null) return '';
    final d = DateTime.now().difference(publishedAt!);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) return '${d.inHours} h ago';
    return '${d.inDays} d ago';
  }
}

String compact(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return '$n';
}
