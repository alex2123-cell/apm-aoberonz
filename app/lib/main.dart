import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:get/get.dart';
import 'core/theme.dart';
import 'screens/auth_screen.dart';
import 'screens/company_and_post_screens.dart';
import 'screens/home_shell.dart';
import 'screens/onboarding_screen.dart';
import 'screens/review_screen.dart';
import 'services/auth_service.dart';
import 'services/realtime_service.dart';
import 'services/tracker.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy(); // aoberonz.com/p/<id> instead of /#/p/<id> on web
  final auth = await Get.putAsync(() => AuthService().init());
  Get.put(RealtimeService().init(), permanent: true);
  Get.put(Tracker().init(), permanent: true);
  runApp(AoberonzApp(startOnboarding: !auth.onboarded.value));
}

class AoberonzApp extends StatelessWidget {
  const AoberonzApp({super.key, required this.startOnboarding});
  final bool startOnboarding;

  @override
  Widget build(BuildContext context) {
    return GetMaterialApp(
      title: 'Aoberonz',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      initialRoute: startOnboarding ? '/welcome' : '/',
      getPages: [
        GetPage(name: '/', page: () => const HomeShell()),
        GetPage(name: '/welcome', page: () => const OnboardingScreen()),
        GetPage(name: '/auth', page: () => const AuthScreen(), fullscreenDialog: true),
        GetPage(name: '/review', page: () => const ReviewScreen()),
        GetPage(name: '/company/:slug', page: () => const CompanyScreen()),
        GetPage(name: '/p/:id', page: () => const PostScreen()),
      ],
      unknownRoute: GetPage(name: '/404', page: () => const HomeShell()),
    );
  }
}
