import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../core/api.dart';
import '../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _register = true;
  bool _busy = false;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _form = GlobalKey<FormState>();

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final auth = Get.find<AuthService>();
    try {
      if (_register) {
        await auth.register(_name.text.trim(), _email.text.trim(), _password.text);
      } else {
        await auth.login(_email.text.trim(), _password.text);
      }
      Get.back();
    } catch (e) {
      Get.snackbar('Aoberonz', Api.message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_register ? 'Create account' : 'Log in')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Form(
            key: _form,
            child: ListView(padding: const EdgeInsets.all(24), shrinkWrap: true, children: [
              if (_register)
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Name'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
                ),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Email'),
                validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
              ),
              TextFormField(
                controller: _password,
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                decoration: const InputDecoration(labelText: 'Password'),
                validator: (v) => (v == null || v.length < 8) ? 'At least 8 characters' : null,
                onFieldSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_register ? 'Create account' : 'Log in'),
              ),
              TextButton(
                onPressed: () => setState(() => _register = !_register),
                child: Text(_register ? 'I already have an account' : 'New here? Create an account'),
              ),
              const SizedBox(height: 8),
              const Text(
                'By continuing you agree to the Terms and Privacy Policy. We never identify people in footage.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.white54),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
