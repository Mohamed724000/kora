import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../foundation/presentation/foundation_section_screen.dart';
import '../foundation/presentation/kora_shell.dart';
import 'app_section.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: AppSection.home.route,
    routes: <RouteBase>[
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return KoraShell(navigationShell: navigationShell);
        },
        branches: AppSection.values
            .map(
              (section) => StatefulShellBranch(
                routes: <RouteBase>[
                  GoRoute(
                    path: section.route,
                    pageBuilder: (context, state) => NoTransitionPage<void>(
                      child: FoundationSectionScreen(section: section),
                    ),
                  ),
                ],
              ),
            )
            .toList(growable: false),
      ),
    ],
  );

  ref.onDispose(router.dispose);
  return router;
});
