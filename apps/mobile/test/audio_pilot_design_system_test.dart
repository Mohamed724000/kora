import 'dart:ui' show SemanticsAction;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kora_plus/src/design_system/kora_design_system.dart';
import 'package:kora_plus/src/theme/kora_theme.dart';

void main() {
  testWidgets(
    'prix FCFA entier, carte audio et identité artiste restent explicites',
    (tester) async {
      var opened = false;
      await tester.pumpWidget(
        _TestApp(
          child: Column(
            children: <Widget>[
              KoraAudioCard(
                title: 'Voix du fleuve',
                artistName: 'Awa Traoré',
                amountCfa: 2500,
                onOpen: () => opened = true,
              ),
              const KoraArtistIdentity(name: 'Awa Traoré', isVerified: true),
            ],
          ),
        ),
      );

      expect(find.text('2\u202f500 FCFA'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Artiste vérifié : Awa Traoré'),
        findsOneWidget,
      );
      await tester.tap(
        find.bySemanticsLabel(
          'Voix du fleuve, par Awa Traoré, 2500 francs CFA',
        ),
      );
      expect(opened, isTrue);
    },
  );

  testWidgets('champs Mali et OTP appliquent leurs bornes sans dépendance', (
    tester,
  ) async {
    final phone = TextEditingController();
    final otp = TextEditingController();
    addTearDown(phone.dispose);
    addTearDown(otp.dispose);
    String? completedCode;

    await tester.pumpWidget(
      _TestApp(
        child: Column(
          children: <Widget>[
            KoraMaliPhoneField(controller: phone),
            const SizedBox(height: 16),
            KoraOtpField(
              controller: otp,
              onCompleted: (value) => completedCode = value,
            ),
          ],
        ),
      ),
    );

    await tester.enterText(find.byType(TextField).first, '70a123456789');
    await tester.enterText(find.byType(TextField).last, '1234567');

    expect(phone.text, '70123456');
    expect(otp.text, '123456');
    expect(completedCode, '123456');
    expect(find.text('+223'), findsOneWidget);
  });

  testWidgets('mini-lecteur absent sans média et présent avec média actif', (
    tester,
  ) async {
    await tester.pumpWidget(
      const _TestApp(
        child: KoraMiniPlayer(
          media: null,
          onOpen: _noop,
          onTogglePlayback: _noop,
        ),
      ),
    );
    expect(find.byKey(const Key('mini-player')), findsNothing);

    await tester.pumpWidget(
      const _TestApp(
        child: KoraMiniPlayer(
          media: KoraPlayableMedia(
            contentId: 'audio_test_1',
            title: 'Voix du fleuve',
            artistName: 'Awa Traoré',
            isPlaying: true,
          ),
          onOpen: _noop,
          onTogglePlayback: _noop,
        ),
      ),
    );
    expect(find.byKey(const Key('mini-player')), findsOneWidget);
    expect(find.byTooltip('Mettre en pause'), findsOneWidget);
  });

  testWidgets('lecteur vide fournit une prochaine action utile', (
    tester,
  ) async {
    await tester.pumpWidget(
      const _TestApp(
        child: KoraFullPlayer(
          media: null,
          onTogglePlayback: _noop,
          onBrowse: _noop,
        ),
      ),
    );

    expect(find.text('Prêt à écouter ?'), findsOneWidget);
    expect(
      find.widgetWithText(KoraActionButton, 'Découvrir les titres'),
      findsOneWidget,
    );
  });

  testWidgets('états paiement sont textuels et retry atteint 48 dp', (
    tester,
  ) async {
    var retries = 0;
    await tester.pumpWidget(
      _TestApp(
        child: KoraPaymentStatusPanel(
          state: KoraPaymentState.failed,
          onRetry: () => retries++,
        ),
      ),
    );

    final retry = find.widgetWithText(
      KoraActionButton,
      'Réessayer le paiement',
    );
    expect(retry, findsOneWidget);
    final retrySemanticsFinder = find.bySemanticsLabel(
      RegExp(r'^Réessayer le paiement$'),
    );
    expect(retrySemanticsFinder, findsOneWidget);
    final retrySemantics = tester.getSemantics(retrySemanticsFinder);
    expect(retrySemantics.getSemanticsData().label, 'Réessayer le paiement');
    expect(
      retrySemantics.getSemanticsData().hasAction(SemanticsAction.tap),
      isTrue,
    );
    expect(
      tester
          .getSize(
            find.descendant(of: retry, matching: find.byType(OutlinedButton)),
          )
          .height,
      greaterThanOrEqualTo(48),
    );
    await tester.tap(find.text('Réessayer le paiement'));
    expect(retries, 1);
  });

  testWidgets('retries erreur et hors connexion restent actionnables', (
    tester,
  ) async {
    for (final state in <KoraExperienceState>[
      KoraExperienceState.error,
      KoraExperienceState.offline,
    ]) {
      var retries = 0;
      await tester.pumpWidget(
        _TestApp(
          child: KoraExperienceStateView(
            state: state,
            title: 'Action requise',
            message: 'Vérifiez puis réessayez.',
            onRetry: () => retries++,
          ),
        ),
      );

      final retry = find.widgetWithText(KoraActionButton, 'Réessayer');
      expect(retry, findsOneWidget);
      final retrySemanticsFinder = find.bySemanticsLabel(
        RegExp(r'^Réessayer$'),
      );
      expect(retrySemanticsFinder, findsOneWidget);
      expect(
        tester
            .getSemantics(retrySemanticsFinder)
            .getSemanticsData()
            .hasAction(SemanticsAction.tap),
        isTrue,
      );
      expect(
        tester.getSemantics(retrySemanticsFinder).getSemanticsData().label,
        'Réessayer',
      );
      await tester.tap(retry);
      expect(retries, 1);
    }
  });

  testWidgets('galerie étroite supporte 200 % sans overflow', (tester) async {
    tester.view.physicalSize = const Size(341, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final phone = TextEditingController();
    final otp = TextEditingController();
    addTearDown(phone.dispose);
    addTearDown(otp.dispose);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: _TestApp(
          child: SingleChildScrollView(
            child: Column(
              children: <Widget>[
                KoraAudioCard(
                  title:
                      'Un titre volontairement long pour tester la robustesse',
                  artistName: 'Une artiste au nom également long',
                  amountCfa: 12500,
                  onOpen: _noop,
                ),
                const KoraArtistIdentity(
                  name: 'Une artiste au nom volontairement long',
                  isVerified: true,
                ),
                KoraMaliPhoneField(controller: phone),
                KoraOtpField(controller: otp),
                KoraSandboxPaymentMethod(selected: true, onSelected: (_) {}),
                const KoraPaymentStatusPanel(state: KoraPaymentState.pending),
                const KoraReceiptSummary(
                  reference: 'TEST-2026-000001',
                  totalCfa: 12500,
                  purchasedAtLabel: '20 août 2026 à 12:00 UTC',
                  children: <Widget>[
                    KoraPurchaseLine(
                      title: 'Un titre volontairement long',
                      artistName: 'Une artiste au nom également long',
                      amountCfa: 12500,
                    ),
                  ],
                ),
                const KoraMiniPlayer(
                  media: KoraPlayableMedia(
                    contentId: 'audio_test_1',
                    title: 'Un titre volontairement long',
                    artistName: 'Une artiste au nom également long',
                    isPlaying: false,
                  ),
                  onOpen: _noop,
                  onTogglePlayback: _noop,
                ),
                const KoraFullPlayer(
                  media: KoraPlayableMedia(
                    contentId: 'audio_test_1',
                    title: 'Un titre volontairement long',
                    artistName: 'Une artiste au nom également long',
                    isPlaying: false,
                  ),
                  onTogglePlayback: _noop,
                ),
                const KoraActionButton(
                  label: 'Continuer vers une prochaine étape explicite',
                  onPressed: _noop,
                  icon: Icons.arrow_forward,
                  expand: true,
                ),
                const KoraExperienceStateView(
                  state: KoraExperienceState.offline,
                  title: 'Connexion indisponible',
                  message: 'Vérifiez votre connexion puis réessayez.',
                  onRetry: _noop,
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion remplace le chargement animé', (tester) async {
    await tester.pumpWidget(
      const _TestApp(
        child: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: KoraExperienceStateView(
            state: KoraExperienceState.loading,
            title: 'Chargement',
            message: 'Préparation de votre contenu.',
          ),
        ),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byIcon(Icons.hourglass_top), findsOneWidget);
  });
}

void _noop() {}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: KoraTheme.dark,
      home: Scaffold(body: SafeArea(child: child)),
    );
  }
}
