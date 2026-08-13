import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/observability/sentry_observability.dart';

Future<void> main() async {
  await runWithObservability(
    dsn: const String.fromEnvironment('SENTRY_DSN'),
    environment: const String.fromEnvironment(
      'SENTRY_ENVIRONMENT',
      defaultValue: 'development',
    ),
    release: const String.fromEnvironment('SENTRY_RELEASE'),
    appRunner: () {
      runApp(const ProviderScope(child: KoraApp()));
    },
  );
}
