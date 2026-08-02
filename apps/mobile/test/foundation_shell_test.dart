import 'dart:ui' show SemanticsAction;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kora_plus/src/app.dart';
import 'package:kora_plus/src/foundation/application/foundation_presentation_controller.dart';
import 'package:kora_plus/src/foundation/presentation/foundation_state_view.dart';
import 'package:kora_plus/src/foundation/presentation/kora_shell.dart';
import 'package:kora_plus/src/navigation/app_section.dart';
import 'package:kora_plus/src/theme/kora_theme.dart';

void main() {
  testWidgets('affiche les cinq onglets officiels dans l’ordre', (
    tester,
  ) async {
    await tester.pumpWidget(const ProviderScope(child: KoraApp()));
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
    expect(find.byKey(const Key('mini-player')), findsNothing);

    final accueilSemantics = tester
        .getSemantics(find.bySemanticsLabel('Accueil'))
        .getSemanticsData();
    expect(accueilSemantics.hasAction(SemanticsAction.tap), isTrue);
  });

  testWidgets('navigue vers chacune des cinq sections', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: KoraApp()));
    await tester.pumpAndSettle();

    for (final section in AppSection.values) {
      await tester.tap(find.byKey(ValueKey<String>('tab-${section.name}')));
      await tester.pumpAndSettle();

      expect(
        find.byKey(ValueKey<String>('screen-${section.name}')),
        findsOneWidget,
      );
    }
  });

  testWidgets('Riverpod pilote les états de fondation', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const KoraApp()),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(foundationEmptyKey), findsOneWidget);

    container
        .read(foundationPresentationProvider.notifier)
        .show(FoundationViewStatus.offline);
    await tester.pump();
    expect(find.byKey(foundationOfflineKey), findsOneWidget);

    container
        .read(foundationPresentationProvider.notifier)
        .show(FoundationViewStatus.error);
    await tester.pump();
    expect(find.byKey(foundationErrorKey), findsOneWidget);
  });

  testWidgets('l’action de reprise respecte une cible tactile de 44 dp', (
    tester,
  ) async {
    var retryCount = 0;

    await tester.pumpWidget(
      MaterialApp(
        theme: KoraTheme.dark,
        home: Scaffold(
          body: FoundationStateView(
            status: FoundationViewStatus.error,
            onRetry: () => retryCount++,
          ),
        ),
      ),
    );

    final retryButton = find.widgetWithText(OutlinedButton, 'Réessayer');
    expect(tester.getSize(retryButton).height, greaterThanOrEqualTo(44));

    await tester.tap(retryButton);
    expect(retryCount, 1);
  });
}
