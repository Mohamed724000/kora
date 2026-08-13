import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kora_plus/src/app.dart';
import 'package:kora_plus/src/foundation/presentation/foundation_states_gallery.dart';
import 'package:kora_plus/src/foundation/presentation/kora_shell.dart';
import 'package:kora_plus/src/navigation/app_section.dart';
import 'package:kora_plus/src/theme/kora_theme.dart';

const _goldenFontFamily = 'KoraGoldenRoboto';
late ThemeData _goldenTheme;

void main() {
  setUpAll(() async {
    await _loadGoldenFonts();
    _goldenTheme = KoraTheme.dark.copyWith(
      textTheme: KoraTheme.dark.textTheme.apply(fontFamily: _goldenFontFamily),
    );
  });

  testWidgets('golden du shell et des cinq onglets à 341 px', (tester) async {
    _configureViewport(tester, const Size(341, 740));

    await tester.pumpWidget(ProviderScope(child: KoraApp(theme: _goldenTheme)));
    await tester.pumpAndSettle();

    final labels = tester
        .widgetList<KoraNavigationItem>(find.byType(KoraNavigationItem))
        .map((item) => item.section.label)
        .toList(growable: false);
    expect(labels, <String>[
      'Accueil',
      'Découvrir',
      'Mes achats',
      'Lecteur',
      'Compte',
    ]);

    await expectLater(
      find.byKey(foundationShellKey),
      matchesGoldenFile('goldens/foundation_shell_341.png'),
    );
  });

  testWidgets('golden des quatre états de fondation à 341 px', (tester) async {
    _configureViewport(tester, const Size(341, 740));

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: _goldenTheme,
        home: const Scaffold(body: FoundationStatesGallery()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await expectLater(
      find.byType(FoundationStatesGallery),
      matchesGoldenFile('goldens/foundation_states_gallery_341.png'),
    );
  });

  testWidgets('golden sans mini-lecteur lorsqu’aucun média n’est actif', (
    tester,
  ) async {
    _configureViewport(tester, const Size(341, 740));

    await tester.pumpWidget(ProviderScope(child: KoraApp(theme: _goldenTheme)));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(ValueKey<String>('tab-${AppSection.player.name}')),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mini-player')), findsNothing);
    await expectLater(
      find.byKey(foundationShellKey),
      matchesGoldenFile('goldens/no_mini_player_341.png'),
    );
  });
}

Future<void> _loadGoldenFonts() async {
  final packageConfigFile = File('.dart_tool/package_config.json').absolute;
  final packageConfig =
      jsonDecode(await packageConfigFile.readAsString())
          as Map<String, Object?>;
  final packages = packageConfig['packages']! as List<Object?>;
  final flutterPackage = packages.cast<Map<String, Object?>>().singleWhere(
    (entry) => entry['name'] == 'flutter',
  );
  final flutterPackageRoot = packageConfigFile.parent.uri.resolve(
    flutterPackage['rootUri']! as String,
  );
  final flutterSdkRoot = Directory.fromUri(flutterPackageRoot).parent.parent;
  final fontFile = _firstExistingFont(flutterSdkRoot, <String>[
    'bin/cache/artifacts/material_fonts/roboto-regular.ttf',
    'bin/cache/artifacts/material_fonts/Roboto-Regular.ttf',
    'bin/cache/dart-sdk/bin/resources/devtools/assets/fonts/Roboto/Roboto-Regular.ttf',
  ]);
  final materialIconsFile = _firstExistingFont(flutterSdkRoot, <String>[
    'bin/cache/artifacts/material_fonts/materialicons-regular.otf',
    'bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    'bin/cache/dart-sdk/bin/resources/devtools/assets/fonts/MaterialIcons-Regular.otf',
  ]);

  if (!fontFile.existsSync() || !materialIconsFile.existsSync()) {
    throw StateError(
      'Les polices Roboto ou Material Icons sont absentes du SDK Flutter verrouillé.',
    );
  }

  final fontBytes = await fontFile.readAsBytes();
  final materialIconsBytes = await materialIconsFile.readAsBytes();
  await (FontLoader(
    _goldenFontFamily,
  )..addFont(Future.value(ByteData.sublistView(fontBytes)))).load();
  await (FontLoader(
    'MaterialIcons',
  )..addFont(Future.value(ByteData.sublistView(materialIconsBytes)))).load();
}

File _firstExistingFont(Directory flutterSdkRoot, List<String> candidates) {
  for (final candidate in candidates) {
    final file = File.fromUri(flutterSdkRoot.uri.resolve(candidate));
    if (file.existsSync()) {
      return file;
    }
  }

  return File.fromUri(flutterSdkRoot.uri.resolve(candidates.first));
}

void _configureViewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}
