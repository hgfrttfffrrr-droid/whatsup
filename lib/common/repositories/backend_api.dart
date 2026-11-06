
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const String backendBaseUrl = 'https://YOUR_BACKEND_HOST';

final backendApiProvider = Provider<BackendApi>((ref) {
  final api = BackendApi();

  ref.onDispose(api.dispose);

  return api;
});

class BackendApi {
  final http.Client _client;
  final FlutterSecureStorage _storage;

  BackendApi({
    http.Client? client,
    FlutterSecureStorage? storage,
  })  : _client = client ?? http.Client(),
        _storage = storage ?? const FlutterSecureStorage();

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _client.post(
      Uri.parse('$backendBaseUrl$path'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: jsonEncode(body),
    );

    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> put(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await getToken();

    final response = await _client.put(
      Uri.parse('$backendBaseUrl$path'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: jsonEncode(body),
    );

    return _handleResponse(response);
  }

  Future<Map<String, dynamic>> get(String path) async {
    final token = await getToken();

    final response = await _client.get(
      Uri.parse('$backendBaseUrl$path'),
      headers: {
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );

    return _handleResponse(response);
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final dynamic decoded;

    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل خواندن نیست.');
    }

    if (decoded is! Map<String, dynamic>) {
      throw Exception('ساختار پاسخ سرور نامعتبر است.');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        decoded['error']?.toString() ?? 'خطا در ارتباط با سرور.',
      );
    }

    return decoded;
  }

  Future<void> saveToken(String token) async {
    await _storage.write(
      key: 'gaprom_access_token',
      value: token,
    );
  }

  Future<String?> getToken() async {
    return _storage.read(key: 'gaprom_access_token');
  }

  Future<void> deleteToken() async {
    await _storage.delete(key: 'gaprom_access_token');
  }

  void dispose() {
    _client.close();
  }
}
