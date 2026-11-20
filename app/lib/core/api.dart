import 'package:dio/dio.dart';
import 'config.dart';

/// One shared HTTP client. The auth token is attached to every request.
class Api {
  Api._();
  static final Api instance = Api._();

  String? token;

  late final Dio dio = Dio(
    BaseOptions(
      baseUrl: '${AppConfig.apiUrl}/api',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'content-type': 'application/json'},
    ),
  )..interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (token != null) options.headers['authorization'] = 'Bearer $token';
          handler.next(options);
        },
      ),
    );

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async {
    final res = await dio.get<Map<String, dynamic>>(path, queryParameters: query);
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> post(String path, [Object? body]) async {
    final res = await dio.post<Map<String, dynamic>>(path, data: body);
    return res.data ?? {};
  }

  Future<Map<String, dynamic>> put(String path, [Object? body]) async {
    final res = await dio.put<Map<String, dynamic>>(path, data: body);
    return res.data ?? {};
  }

  Future<void> delete(String path) async {
    await dio.delete<void>(path);
  }

  /// Turns any Dio error into a short message for a snackbar.
  static String message(Object e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] is String) return data['error'] as String;
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
        return 'No connection. Check your internet.';
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
