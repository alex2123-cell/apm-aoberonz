import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api.dart';

class AppUser {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? companyId;
  AppUser({required this.id, required this.name, required this.email, required this.role, this.companyId});

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as String,
        name: j['name'] as String,
        email: j['email'] as String,
        role: j['role'] as String,
        companyId: j['companyId'] as String?,
      );

  bool get canReview => role == 'EDITOR' || role == 'ADMIN' || role == 'COMPANY_ADMIN';
}

/// Holds the logged-in user. Token is kept in local storage so the session survives restarts.
class AuthService extends GetxService {
  final user = Rxn<AppUser>();
  final interests = <String>[].obs;
  final onboarded = false.obs;
  final breakReminder = true.obs;
  late SharedPreferences _prefs;

  bool get loggedIn => user.value != null;

  Future<AuthService> init() async {
    _prefs = await SharedPreferences.getInstance();
    onboarded.value = _prefs.getBool('onboarded') ?? false;
    breakReminder.value = _prefs.getBool('breakReminder') ?? true;
    interests.assignAll(_prefs.getStringList('interests') ?? const []);
    final token = _prefs.getString('token');
    if (token != null) {
      Api.instance.token = token;
      try {
        final me = await Api.instance.get('/me');
        user.value = AppUser.fromJson(me);
        final list = (me['interests'] as List? ?? const []).map((e) => (e as Map)['industry'].toString()).toList();
        if (list.isNotEmpty) interests.assignAll(list);
      } catch (_) {
        await logout(); // expired token
      }
    }
    return this;
  }

  Future<void> _store(Map<String, dynamic> res) async {
    final token = res['token'] as String;
    Api.instance.token = token;
    await _prefs.setString('token', token);
    user.value = AppUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> login(String email, String password) async {
    await _store(await Api.instance.post('/auth/login', {'email': email, 'password': password}));
    final me = await Api.instance.get('/me');
    final list = (me['interests'] as List? ?? const []).map((e) => (e as Map)['industry'].toString()).toList();
    if (list.isNotEmpty) await saveInterests(list, syncRemote: false);
  }

  Future<void> register(String name, String email, String password) async {
    await _store(await Api.instance.post('/auth/register', {
      'name': name,
      'email': email,
      'password': password,
      'interests': interests.toList(),
    }));
  }

  Future<void> logout() async {
    Api.instance.token = null;
    user.value = null;
    await _prefs.remove('token');
  }

  Future<void> deleteAccount() async {
    await Api.instance.delete('/me');
    await logout();
  }

  Future<void> saveInterests(List<String> list, {bool syncRemote = true}) async {
    interests.assignAll(list);
    await _prefs.setStringList('interests', list);
    await _prefs.setBool('onboarded', true);
    onboarded.value = true;
    if (syncRemote && loggedIn) await Api.instance.put('/me/interests', {'industries': list});
  }

  Future<void> setBreakReminder(bool on) async {
    breakReminder.value = on;
    await _prefs.setBool('breakReminder', on);
  }
}
