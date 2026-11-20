import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../services/auth_service.dart';
import 'onboarding_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Obx(() {
        final u = auth.user.value;
        return ListView(padding: const EdgeInsets.all(16), children: [
          if (u == null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.person_outline),
                title: const Text('Log in to like, save and follow'),
                subtitle: const Text('Your For You feed gets smarter when you do'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Get.toNamed('/auth'),
              ),
            )
          else
            ListTile(
              leading: CircleAvatar(child: Text(u.name.characters.first)),
              title: Text(u.name),
              subtitle: Text(u.email),
            ),
          const SizedBox(height: 16),
          const Text('Your interests', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            ...auth.interests.map((i) => Chip(avatar: Icon(industryIcons[i], size: 16), label: Text(titleCase(i)))),
            ActionChip(
              avatar: const Icon(Icons.edit, size: 16),
              label: const Text('Edit'),
              onPressed: () => Get.to(() => const OnboardingScreen(editing: true)),
            ),
          ]),
          const Divider(height: 32),
          SwitchListTile(
            value: auth.breakReminder.value,
            onChanged: auth.setBreakReminder,
            title: const Text('Break reminders'),
            subtitle: const Text('A gentle nudge after 30 minutes of scrolling'),
          ),
          if (u?.canReview == true)
            ListTile(
              leading: const Icon(Icons.fact_check),
              title: const Text('Review queue'),
              subtitle: const Text('Approve or reject drafts held by the risk gate'),
              onTap: () => Get.toNamed('/review'),
            ),
          if (u != null) ...[
            ListTile(leading: const Icon(Icons.logout), title: const Text('Log out'), onTap: auth.logout),
            ListTile(
              leading: const Icon(Icons.delete_forever, color: Colors.redAccent),
              title: const Text('Delete my account and data'),
              onTap: () => Get.defaultDialog(
                title: 'Delete account?',
                middleText: 'This removes your account, likes, saves and history. It cannot be undone.',
                textConfirm: 'Delete',
                textCancel: 'Cancel',
                onConfirm: () async {
                  Get.back();
                  try {
                    await auth.deleteAccount();
                  } catch (e) {
                    Get.snackbar('Aoberonz', Api.message(e));
                  }
                },
              ),
            ),
          ],
          const SizedBox(height: 24),
          const Center(child: Text('Aoberonz 1.0.0', style: TextStyle(color: Colors.white38, fontSize: 12))),
        ]);
      }),
    );
  }
}
