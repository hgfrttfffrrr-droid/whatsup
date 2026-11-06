import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fpdart/fpdart.dart';
import 'package:logger/logger.dart';

import 'package:whatsup/common/models/user.dart';
import 'package:whatsup/common/repositories/backend_api.dart';
import 'package:whatsup/common/util/logger.dart';

final authRepositoryProvider = Provider((ref) {
  return AuthRepository(
    api: ref.watch(backendApiProvider),
  );
});

class AuthRepository {
  final Logger logger =
      AppLogger.getLogger((AuthRepository).toString());

  final BackendApi _api;

  UserModel? _currentUser;

  AuthRepository({
    required BackendApi api,
  }) : _api = api;

  Option<UserModel> get currentUser {
    if (_currentUser == null) {
      return const Option.none();
    }

    return Option.of(_currentUser!);
  }

  Future<void> sendOTP({
    required String phoneNumber,
    required VoidCallback onSuccess,
    required Function(String verificationId) onCodeSent,
    required Function(String err) onError,
  }) async {
    try {
      final result = await _api.post(
        '/auth/request-otp',
        {
          'phone': phoneNumber,
        },
      );

      logger.i('OTP request submitted successfully');

      onCodeSent(
        result['phone']?.toString() ?? phoneNumber,
      );

      onSuccess();
    } catch (e) {
      logger.e('OTP request failed: $e');
      onError(_errorMessage(e));
    }
  }

  Future<void> verifyOTP({
    required BuildContext context,
    required String idSent,
    required String inputCode,
    required VoidCallback onSuccess,
    required Function(String err) onError,
  }) async {
    try {
      final result = await _api.post(
        '/auth/verify-otp',
        {
          'phone': idSent,
          'code': inputCode,
        },
      );

      final token = result['token']?.toString();

      if (token == null || token.isEmpty) {
        throw Exception('توکن ورود از سرور دریافت نشد.');
      }

      final userData = result['user'];

      if (userData is! Map<String, dynamic>) {
        throw Exception('اطلاعات کاربر از سرور معتبر نیست.');
      }

      await _api.saveToken(token);

      _currentUser = UserModel(
        uid: userData['id'].toString(),
        name: userData['name']?.toString() ?? '',
        profileImage:
            userData['profileImage']?.toString() ?? '',
        phoneNumber: userData['phone']?.toString() ?? idSent,
        isOnline: true,
      );

      logger.i('OTP verified successfully');

      onSuccess();
    } catch (e) {
      logger.e('OTP verification failed: $e');
      onError(_errorMessage(e));
    }
  }

  String _errorMessage(Object error) {
    final message = error.toString();

    if (message.startsWith('Exception: ')) {
      return message.substring('Exception: '.length);
    }

    return 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
  }

  Future<void> signOut() async {
    logger.d('Signing out user...');

    await _api.deleteToken();

    _currentUser = null;
  }
}
