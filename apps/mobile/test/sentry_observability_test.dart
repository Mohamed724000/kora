import 'package:flutter_test/flutter_test.dart';
import 'package:kora_plus/src/observability/sentry_observability.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  test('ne démarre aucun SDK sans DSN', () async {
    var appRuns = 0;
    var initializations = 0;

    await runWithObservability(
      appRunner: () {
        appRuns += 1;
      },
      dsn: '',
      environment: 'test',
      release: '',
      initializeSentry:
          (FlutterOptionsConfiguration _, {AppRunner? appRunner}) async {
            initializations += 1;
          },
    );

    expect(appRuns, 1);
    expect(initializations, 0);
  });

  test('verrouille PII et télémétrie de performance avec DSN', () async {
    late SentryFlutterOptions configured;
    var appRuns = 0;

    await runWithObservability(
      appRunner: () {
        appRuns += 1;
      },
      dsn: 'https://public-key@sentry.example.test/42',
      environment: 'test',
      release: 's0.5-test.1',
      initializeSentry:
          (
            FlutterOptionsConfiguration configure, {
            AppRunner? appRunner,
          }) async {
            configured = SentryFlutterOptions();
            await configure(configured);
            await appRunner?.call();
          },
    );

    expect(appRuns, 1);
    expect(configured.sendDefaultPii, isFalse);
    expect(configured.tracesSampleRate, 0);
    expect(configured.enableAutoPerformanceTracing, isFalse);
    expect(configured.attachScreenshot, isFalse);
    expect(configured.environment, 'test');
    expect(configured.release, 's0.5-test.1');
  });

  test('supprime utilisateur et requête puis masque les secrets', () {
    final event = SentryEvent(
      message: SentryMessage(
        'Bearer private-credential email=private@example.test phone=+22370000000',
      ),
      request: SentryRequest(url: 'https://example.test/?token=private'),
      user: SentryUser(id: 'private-user', email: 'private@example.test'),
      tags: <String, String>{'token': 'private-token'},
      // ignore: deprecated_member_use
      extra: <String, dynamic>{'password': 'private-password'},
    );

    final sanitized = sanitizeSentryEvent(event, Hint());
    final serialized = sanitized.toJson().toString();

    expect(sanitized.user, isNull);
    expect(sanitized.request, isNull);
    expect(serialized, contains(redactedValue));
    expect(serialized, isNot(contains('private')));
    expect(serialized, isNot(contains('22370000000')));
  });
}
