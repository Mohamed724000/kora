import 'dart:async';

import 'package:sentry_flutter/sentry_flutter.dart';

const redactedValue = '[REDACTED]';

typedef KoraSentryInitializer =
    Future<void> Function(
      FlutterOptionsConfiguration optionsConfiguration, {
      AppRunner? appRunner,
    });

final RegExp _sensitiveField = RegExp(
  r'^(authorization|cookie|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|otp|dsn|email|phone|telephone|tel|user|username|ip(_address|address)?|device[_-]?id|card|payment)$',
  caseSensitive: false,
);
final List<RegExp> _sensitiveText = <RegExp>[
  RegExp(r'\bbearer\s+[^\s,;]+', caseSensitive: false),
  RegExp(
    r'\b(authorization|cookie|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|otp|dsn|email|phone|telephone|tel)(\s*(=|:)\s*|\s+)("[^"]*"|\x27[^\x27]*\x27|[^\s,;]+)',
    caseSensitive: false,
  ),
  RegExp(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', caseSensitive: false),
  RegExp(r'\+\d[\d .()-]{6,}\d'),
];

String sanitizeSentryText(String value) {
  var sanitized = value;
  for (final pattern in _sensitiveText) {
    sanitized = sanitized.replaceAll(pattern, redactedValue);
  }
  return sanitized;
}

dynamic _sanitizeValue(dynamic value, [String field = '']) {
  if (_sensitiveField.hasMatch(field)) {
    return redactedValue;
  }
  if (value is String) {
    return sanitizeSentryText(value);
  }
  if (value is List<dynamic>) {
    return value.map<dynamic>(_sanitizeValue).toList(growable: false);
  }
  if (value is Map<String, dynamic>) {
    return value.map<String, dynamic>(
      (key, entry) =>
          MapEntry<String, dynamic>(key, _sanitizeValue(entry, key)),
    );
  }
  return value;
}

SentryEvent sanitizeSentryEvent(SentryEvent event, Hint _) {
  event.user = null;
  event.request = null;
  event.breadcrumbs = null;
  if (event.message case final message?) {
    message.formatted = sanitizeSentryText(message.formatted);
    if (message.template case final template?) {
      message.template = sanitizeSentryText(template);
    }
    message.params = message.params
        ?.map<dynamic>((value) => _sanitizeValue(value))
        .toList(growable: false);
  }
  for (final exception in event.exceptions ?? const <SentryException>[]) {
    if (exception.value case final value?) {
      exception.value = sanitizeSentryText(value);
    }
  }
  event.tags = event.tags?.map<String, String>(
    (key, value) =>
        MapEntry<String, String>(key, _sanitizeValue(value, key) as String),
  );
  // Additional data is deprecated by Sentry but can still be added by integrations.
  // ignore: deprecated_member_use
  event.extra = _sanitizeValue(event.extra) as Map<String, dynamic>?;
  return event;
}

bool _validDsn(String dsn) {
  final uri = Uri.tryParse(dsn);
  return uri != null &&
      uri.scheme == 'https' &&
      uri.userInfo.isNotEmpty &&
      uri.host.isNotEmpty &&
      uri.pathSegments.isNotEmpty;
}

Future<void> runWithObservability({
  required AppRunner appRunner,
  required String dsn,
  required String environment,
  required String release,
  KoraSentryInitializer initializeSentry = SentryFlutter.init,
}) async {
  if (dsn.isEmpty) {
    await appRunner();
    return;
  }
  if (!_validDsn(dsn)) {
    throw ArgumentError('Invalid Sentry DSN');
  }
  if (!RegExp(r'^[A-Za-z0-9._-]{1,64}$').hasMatch(environment)) {
    throw ArgumentError('Invalid Sentry environment');
  }
  if (release.isNotEmpty &&
      !RegExp(r'^[A-Za-z0-9._-]{1,128}$').hasMatch(release)) {
    throw ArgumentError('Invalid Sentry release');
  }

  await initializeSentry((options) {
    options
      ..dsn = dsn
      ..environment = environment
      ..sendDefaultPii = false
      ..tracesSampleRate = 0
      ..enableAutoPerformanceTracing = false
      ..enableUserInteractionTracing = false
      ..enableUserInteractionBreadcrumbs = false
      ..enablePrintBreadcrumbs = false
      ..recordHttpBreadcrumbs = false
      ..captureFailedRequests = false
      ..attachScreenshot = false
      ..reportViewHierarchyIdentifiers = false
      ..beforeSend = sanitizeSentryEvent;
    if (release.isNotEmpty) {
      options.release = release;
    }
  }, appRunner: appRunner);
}
