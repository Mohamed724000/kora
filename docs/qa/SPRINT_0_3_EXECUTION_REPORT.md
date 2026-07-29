# Rapport d’exécution — Sprint 0.3

Statut produit : **Implemented — pending CTO review**

Verdict d’exécution : **SPRINT 0.3 BLOCKED**

Ce rapport décrit l’état exact produit sur la branche
`chore/s0-3-application-foundations` depuis le commit
`7f58b194c85757c0be93485aa4706242e8acd915`.

## Résultat

Les quatre fondations applicatives, les trois packages partagés et
l’orchestration racine sont implémentés sans comportement métier. Format, lint,
typecheck, tests, builds non mobiles, smokes HTTP et Design QA passent.

La publication reste bloquée par :

1. 33 vulnérabilités npm signalées mais non qualifiées, dont 32 élevées ;
2. les obligations LGPL, MPL, EPL et CC-BY en attente de validation
   CTO/juridique ;
3. le NDK Android `28.2.13676358` absent, donc aucun APK validé.

Le build iOS et les captures interactives Web/Admin sont `NON EXÉCUTÉS`.
La branche n’est ni poussée ni associée à une Pull Request tant que ces
blockers restent ouverts.

## Versions

| Outil | Version |
|---|---|
| Node.js | 22.18.0 |
| npm | 10.9.3 |
| Flutter | 3.44.1 |
| Dart | 3.12.1 |

Toutes les versions directes npm et pub sont exactes. `package-lock.json` et
`apps/mobile/pubspec.lock` sont présents.

## Architecture livrée

- `apps/mobile` : Flutter, Riverpod, GoRouter, cinq onglets officiels, états de
  fondation et trois goldens à 341 px ;
- `apps/web` : shell public Next.js sans achat, téléchargement ou lecture ;
- `apps/admin` : shell Next.js/AdminLTE React clair avec treize zones, sans
  donnée ou action métier ;
- `apps/api` : NestJS sous `/api/v1`, liveness/readiness, configuration stricte,
  corrélation, redaction, Prisma vide et Redis/BullMQ sans queue ;
- `packages/config` : TypeScript, ESLint et Prettier partagés ;
- `packages/contracts` : frontière vide, protégée par test ;
- `packages/ui` : primitives Web/Admin sans logique métier.

## Contrôles

| Contrôle | Code / état |
|---|---|
| `npm.cmd run env:check` | 0 |
| `npm.cmd install --ignore-scripts` | 0 |
| `npm.cmd ls --all` | 0 |
| `npm.cmd audit --offline --json` | 0, non probant sans cache |
| audit npm détaillé en ligne | NON EXÉCUTÉ — protection d’egress |
| `npm.cmd run licenses` | 0 — 1111 paquets, 0 licence non déclarée |
| `npm.cmd run format` | 0 |
| `npm.cmd run lint` | 0 |
| `npm.cmd run typecheck` | 0 |
| `npm.cmd test` | 0 |
| builds Web/Admin/API/contracts/config/UI | 0 |
| `npm.cmd run build` | 1 — APK bloqué par le NDK |
| `flutter test --update-goldens test/golden_test.dart` | 0 |
| `flutter test` | 0 — 7 tests |
| `flutter build apk --debug` | 1 — NDK absent |
| build iOS | NON EXÉCUTÉ — hôte Windows |
| smoke API | live 200 ; ready 503 |
| smoke Web | 200 ; titre KORA+ |
| smoke Admin | 200 ; noindex ; robots disallow all |
| captures interactives Web/Admin | NON EXÉCUTÉES — navigateur indisponible |
| manifeste immuable | 52/52 |
| secrets à haute confiance | 0 |
| marqueurs métier prématurés | 0 |
| TODO/FIXME/marqueurs IA/placeholders | 0 |
| `git diff --check` | 0 |
| `git fsck --full` | 0, avec un dangling blob préexistant |

Tests finaux : Web 7, Admin 8, API 11, contracts 1, config 1, UI 4 et mobile 7.
Les audits finaux donnent Design QA `PASS`, Foundation Contract `PASS
code/contrat — NO-GO externe` et Security/Supply Chain `NO-GO`.

## Inventaire exact des fichiers

État avant commits : 14 fichiers modifiés et 178 fichiers ajoutés, soit 192
fichiers en incluant le présent rapport.

```text
M  README.md
M  apps/admin/README.md
M  apps/api/README.md
M  apps/mobile/README.md
M  apps/web/README.md
M  docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md
M  docs/roadmap/MVP_EXECUTION_PLAN.md
M  docs/security/THREAT_MODEL.md
M  package-lock.json
M  package.json
M  packages/config/README.md
M  packages/contracts/README.md
M  packages/ui/README.md
M  scripts/check-environment.mjs
A  apps/admin/.prettierignore
A  apps/admin/.prettierrc.json
A  apps/admin/app/error.tsx
A  apps/admin/app/globals.css
A  apps/admin/app/layout.tsx
A  apps/admin/app/loading.tsx
A  apps/admin/app/metadata.test.ts
A  apps/admin/app/not-found.tsx
A  apps/admin/app/page.test.tsx
A  apps/admin/app/page.tsx
A  apps/admin/app/robots.test.ts
A  apps/admin/app/robots.ts
A  apps/admin/app/states.test.tsx
A  apps/admin/eslint.config.mjs
A  apps/admin/lib/admin-navigation.ts
A  apps/admin/next-env.d.ts
A  apps/admin/next.config.ts
A  apps/admin/package.json
A  apps/admin/tsconfig.json
A  apps/admin/vitest.config.ts
A  apps/admin/vitest.setup.ts
A  apps/api/.env.example
A  apps/api/.prettierignore
A  apps/api/.prettierrc.json
A  apps/api/eslint.config.mjs
A  apps/api/jest.config.cjs
A  apps/api/nest-cli.json
A  apps/api/package.json
A  apps/api/prisma.config.ts
A  apps/api/prisma/schema.prisma
A  apps/api/src/app.factory.ts
A  apps/api/src/app.module.ts
A  apps/api/src/common/filters/global-exception.filter.spec.ts
A  apps/api/src/common/filters/global-exception.filter.ts
A  apps/api/src/config/runtime-config.spec.ts
A  apps/api/src/config/runtime-config.ts
A  apps/api/src/health/health.controller.ts
A  apps/api/src/health/health.module.ts
A  apps/api/src/health/health.service.ts
A  apps/api/src/health/postgresql-readiness.check.ts
A  apps/api/src/health/readiness-check.ts
A  apps/api/src/health/redis-readiness.check.ts
A  apps/api/src/infrastructure/queue-infrastructure.module.ts
A  apps/api/src/infrastructure/redis-connection-options.ts
A  apps/api/src/main.ts
A  apps/api/src/observability/http-logger.ts
A  apps/api/src/observability/request-id.ts
A  apps/api/src/observability/structured-logger.spec.ts
A  apps/api/src/observability/structured-logger.ts
A  apps/api/test/app.integration.spec.ts
A  apps/api/test/safe-test-environment.ts
A  apps/api/tsconfig.build.json
A  apps/api/tsconfig.json
A  apps/mobile/.gitignore
A  apps/mobile/.metadata
A  apps/mobile/analysis_options.yaml
A  apps/mobile/android/.gitignore
A  apps/mobile/android/app/build.gradle.kts
A  apps/mobile/android/app/src/debug/AndroidManifest.xml
A  apps/mobile/android/app/src/main/AndroidManifest.xml
A  apps/mobile/android/app/src/main/kotlin/com/example/kora_plus/MainActivity.kt
A  apps/mobile/android/app/src/main/res/drawable/ic_launcher_provisional.xml
A  apps/mobile/android/app/src/main/res/drawable/launch_background.xml
A  apps/mobile/android/app/src/main/res/values-night/styles.xml
A  apps/mobile/android/app/src/main/res/values/colors.xml
A  apps/mobile/android/app/src/main/res/values/styles.xml
A  apps/mobile/android/app/src/profile/AndroidManifest.xml
A  apps/mobile/android/build.gradle.kts
A  apps/mobile/android/gradle.properties
A  apps/mobile/android/gradle/wrapper/gradle-wrapper.properties
A  apps/mobile/android/settings.gradle.kts
A  apps/mobile/ios/.gitignore
A  apps/mobile/ios/Flutter/AppFrameworkInfo.plist
A  apps/mobile/ios/Flutter/Debug.xcconfig
A  apps/mobile/ios/Flutter/Release.xcconfig
A  apps/mobile/ios/Runner.xcodeproj/project.pbxproj
A  apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata
A  apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist
A  apps/mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings
A  apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme
A  apps/mobile/ios/Runner.xcworkspace/contents.xcworkspacedata
A  apps/mobile/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist
A  apps/mobile/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings
A  apps/mobile/ios/Runner/AppDelegate.swift
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png
A  apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png
A  apps/mobile/ios/Runner/Base.lproj/LaunchScreen.storyboard
A  apps/mobile/ios/Runner/Base.lproj/Main.storyboard
A  apps/mobile/ios/Runner/Info.plist
A  apps/mobile/ios/Runner/Runner-Bridging-Header.h
A  apps/mobile/ios/Runner/SceneDelegate.swift
A  apps/mobile/ios/RunnerTests/RunnerTests.swift
A  apps/mobile/lib/main.dart
A  apps/mobile/lib/src/app.dart
A  apps/mobile/lib/src/foundation/application/foundation_presentation_controller.dart
A  apps/mobile/lib/src/foundation/presentation/foundation_section_screen.dart
A  apps/mobile/lib/src/foundation/presentation/foundation_state_view.dart
A  apps/mobile/lib/src/foundation/presentation/foundation_states_gallery.dart
A  apps/mobile/lib/src/foundation/presentation/kora_shell.dart
A  apps/mobile/lib/src/navigation/app_router.dart
A  apps/mobile/lib/src/navigation/app_section.dart
A  apps/mobile/lib/src/theme/kora_colors.dart
A  apps/mobile/lib/src/theme/kora_theme.dart
A  apps/mobile/pubspec.lock
A  apps/mobile/pubspec.yaml
A  apps/mobile/test/foundation_shell_test.dart
A  apps/mobile/test/golden_test.dart
A  apps/mobile/test/goldens/foundation_shell_341.png
A  apps/mobile/test/goldens/foundation_states_gallery_341.png
A  apps/mobile/test/goldens/no_mini_player_341.png
A  apps/web/.prettierignore
A  apps/web/.prettierrc.json
A  apps/web/app/error.tsx
A  apps/web/app/globals.css
A  apps/web/app/layout.tsx
A  apps/web/app/loading.tsx
A  apps/web/app/metadata.test.ts
A  apps/web/app/not-found.tsx
A  apps/web/app/page.test.tsx
A  apps/web/app/page.tsx
A  apps/web/app/states.test.tsx
A  apps/web/eslint.config.mjs
A  apps/web/next-env.d.ts
A  apps/web/next.config.ts
A  apps/web/package.json
A  apps/web/tsconfig.json
A  apps/web/vitest.config.ts
A  apps/web/vitest.setup.ts
A  docs/qa/SPRINT_0_3_EXECUTION_REPORT.md
A  packages/config/eslint.config.mjs
A  packages/config/eslint/base.mjs
A  packages/config/package.json
A  packages/config/prettier.json
A  packages/config/scripts/validate-config.mjs
A  packages/config/test/config.test.mjs
A  packages/config/typescript/base.json
A  packages/config/typescript/nest.json
A  packages/config/typescript/next.json
A  packages/config/typescript/node-library.json
A  packages/config/typescript/react-library.json
A  packages/contracts/.prettierignore
A  packages/contracts/.prettierrc.json
A  packages/contracts/eslint.config.mjs
A  packages/contracts/package.json
A  packages/contracts/src/index.ts
A  packages/contracts/test/boundary.test.mjs
A  packages/contracts/tsconfig.build.json
A  packages/contracts/tsconfig.json
A  packages/ui/.prettierignore
A  packages/ui/.prettierrc.json
A  packages/ui/eslint.config.mjs
A  packages/ui/package.json
A  packages/ui/src/action-button.tsx
A  packages/ui/src/brand-mark.tsx
A  packages/ui/src/index.ts
A  packages/ui/src/primitives.test.tsx
A  packages/ui/src/skip-link.tsx
A  packages/ui/src/status-panel.tsx
A  packages/ui/src/styles.css
A  packages/ui/tsconfig.json
A  packages/ui/vitest.config.ts
A  packages/ui/vitest.setup.ts
A  scripts/report-licenses.mjs
A  scripts/run-workspace-task.mjs
```

S0.4 reste **Not started — Docker blocker connu**. Aucun fichier
d’infrastructure locale, service Docker ou lot S0.4 n’a été créé.
