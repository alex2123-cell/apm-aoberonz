/// Build-time settings. Pass with --dart-define, for example:
///   flutter run -d chrome --dart-define=API_URL=http://localhost:4000
///   flutter build appbundle --dart-define=API_URL=https://api.aoberonz.com
class AppConfig {
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:4000');
  static const webUrl = String.fromEnvironment('WEB_URL', defaultValue: 'https://aoberonz.com');

  /// Load the next page when the user is this many cards from the end.
  static const prefetchDistance = 3;
  static const pageSize = 10;

  /// Gentle "take a break" reminder (users can switch it off in Profile).
  static const breakReminderMinutes = 30;
}
