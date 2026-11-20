import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../core/theme.dart';
import '../services/auth_service.dart';

/// First launch: pick at least 3 industries so For You is personal from the first swipe.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, this.editing = false});
  final bool editing;
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  late final Set<String> _picked = {...Get.find<AuthService>().interests};

  Future<void> _done() async {
    await Get.find<AuthService>().saveInterests(_picked.toList());
    if (widget.editing) {
      Get.back();
    } else {
      Get.offAllNamed('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final enough = _picked.length >= 3;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const SizedBox(height: 24),
                const Text('What do you want to follow?', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                const Text('Pick 3 or more. Your feed learns from every swipe after that.',
                    style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: industryIcons.entries.map((e) {
                    final on = _picked.contains(e.key);
                    return FilterChip(
                      selected: on,
                      showCheckmark: false,
                      avatar: Icon(e.value, size: 18, color: on ? AppTheme.accent : Colors.white70),
                      label: Text(titleCase(e.key)),
                      onSelected: (v) => setState(() => v ? _picked.add(e.key) : _picked.remove(e.key)),
                    );
                  }).toList(),
                ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: enough ? _done : null,
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                    child: Text(enough ? 'Start swiping' : 'Pick ${3 - _picked.length} more'),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
