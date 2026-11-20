import 'package:flutter/material.dart';

class AppTheme {
  static const accent = Color(0xFF00C2A8); // teal "live" accent
  static const ink = Color(0xFF0B0F14);

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(seedColor: accent, brightness: Brightness.dark).copyWith(
      primary: accent,
      surface: const Color(0xFF12171E),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: ink,
      appBarTheme: const AppBarTheme(backgroundColor: Colors.transparent, elevation: 0, centerTitle: true),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white10,
        selectedColor: accent.withValues(alpha: 0.25),
        labelStyle: const TextStyle(color: Colors.white),
        shape: const StadiumBorder(),
        side: BorderSide.none,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: ink,
        indicatorColor: accent.withValues(alpha: 0.2),
        labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12)),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}

/// One icon per industry, used across the app.
const industryIcons = <String, IconData>{
  'manufacturing': Icons.precision_manufacturing,
  'energy': Icons.bolt,
  'mining': Icons.landscape,
  'agriculture': Icons.agriculture,
  'construction': Icons.construction,
  'logistics': Icons.local_shipping,
  'finance': Icons.account_balance,
  'telecoms': Icons.cell_tower,
  'health': Icons.local_hospital,
  'retail': Icons.storefront,
  'utilities': Icons.water_drop,
};

String titleCase(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
