import 'package:flutter_test/flutter_test.dart';
import 'package:aoberonz/models/post.dart';

void main() {
  test('Post parses API JSON', () {
    final p = Post.fromJson({
      'id': 'p1',
      'headline': 'Convoy leaves terminal',
      'summary': 'Forty trucks left for Nairobi.',
      'industry': 'logistics',
      'county': 'Mombasa',
      'tags': ['logistics'],
      'publishedAt': DateTime.now().subtract(const Duration(minutes: 5)).toUtc().toIso8601String(),
      'likeCount': 1200,
      'company': {'id': 'c1', 'name': 'Coast Bulk', 'slug': 'coast-bulk', 'verified': true},
    });
    expect(p.company.verified, isTrue);
    expect(p.age, '5 min ago');
    expect(compact(p.likeCount), '1.2K');
  });
}
