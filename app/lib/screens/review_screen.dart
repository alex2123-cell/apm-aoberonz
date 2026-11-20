import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../core/api.dart';

/// For editors and company admins: drafts the risk gate held back.
class ReviewScreen extends StatefulWidget {
  const ReviewScreen({super.key});
  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final r = await Api.instance.get('/review/queue');
      _items = (r['items'] as List).cast<Map<String, dynamic>>();
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _approve(Map<String, dynamic> d) async {
    final headline = TextEditingController(text: d['headline'] as String);
    final summary = TextEditingController(text: d['summary'] as String);
    final ok = await Get.dialog<bool>(AlertDialog(
      title: const Text('Approve and publish'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: headline, decoration: const InputDecoration(labelText: 'Headline'), maxLines: 2),
          TextField(controller: summary, decoration: const InputDecoration(labelText: 'Summary'), maxLines: 8),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Get.back(result: false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Get.back(result: true), child: const Text('Publish')),
      ],
    ));
    if (ok != true) return;
    try {
      await Api.instance.post('/review/${d['id']}/approve', {'headline': headline.text, 'summary': summary.text});
      Get.snackbar('Aoberonz', 'Published');
      _load();
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    }
  }

  Future<void> _reject(Map<String, dynamic> d) async {
    try {
      await Api.instance.post('/review/${d['id']}/reject', {'note': 'Rejected in app'});
      _load();
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review queue')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _items.isEmpty
                  ? ListView(children: const [SizedBox(height: 200), Center(child: Text('Nothing waiting. Nice.'))])
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final d = _items[i];
                        final risk = d['risk'] as String;
                        final event = d['event'] as Map<String, dynamic>?;
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Chip(
                                  label: Text(risk),
                                  backgroundColor: risk == 'HIGH' ? Colors.red.withValues(alpha: 0.3) : Colors.orange.withValues(alpha: 0.3),
                                ),
                                const SizedBox(width: 8),
                                Expanded(child: Text((d['company'] as Map)['name'] as String)),
                                if (event != null)
                                  Text('${((event['confidence'] as num) * 100).round()}% sure',
                                      style: const TextStyle(color: Colors.white54)),
                              ]),
                              const SizedBox(height: 6),
                              Text(d['headline'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
                              const SizedBox(height: 4),
                              Text(d['summary'] as String, maxLines: 4, overflow: TextOverflow.ellipsis),
                              if (event != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text('Source event: ${event['kind']} · ${(event['labels'] as List).join(', ')}',
                                      style: const TextStyle(fontSize: 12, color: Colors.white54)),
                                ),
                              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                                TextButton(onPressed: () => _reject(d), child: const Text('Reject')),
                                FilledButton(onPressed: () => _approve(d), child: const Text('Review & publish')),
                              ]),
                            ]),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
