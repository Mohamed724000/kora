import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'navigation/app_router.dart';
import 'theme/kora_theme.dart';

class KoraApp extends ConsumerWidget {
  const KoraApp({super.key, this.theme});

  final ThemeData? theme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'KORA+',
      debugShowCheckedModeBanner: false,
      theme: theme ?? KoraTheme.dark,
      routerConfig: ref.watch(appRouterProvider),
    );
  }
}
