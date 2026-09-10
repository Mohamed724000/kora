import 'package:flutter/material.dart';
import 'package:kora_plus/src/design_system/kora_design_system.dart';
import 'package:kora_plus/src/theme/kora_colors.dart';

class AudioPilotGallery extends StatefulWidget {
  const AudioPilotGallery({super.key});

  @override
  State<AudioPilotGallery> createState() => _AudioPilotGalleryState();
}

class _AudioPilotGalleryState extends State<AudioPilotGallery> {
  final phone = TextEditingController(text: '70123456');
  final otp = TextEditingController(text: '123456');

  @override
  void dispose() {
    phone.dispose();
    otp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: KoraColors.background,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                'Pilote audio',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 6),
              Text(
                'Composants contractuels — fixtures de test uniquement',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 20),
              KoraAudioCard(
                title: 'Voix du fleuve',
                artistName: 'Awa Traoré',
                amountCfa: 2500,
                badge: const KoraStatusBadge(
                  label: 'Nouveau',
                  tone: KoraStatusTone.information,
                ),
                onOpen: _noop,
              ),
              const SizedBox(height: 16),
              const KoraArtistIdentity(name: 'Awa Traoré', isVerified: true),
              const SizedBox(height: 20),
              KoraMaliPhoneField(controller: phone),
              const SizedBox(height: 16),
              KoraOtpField(controller: otp),
              const SizedBox(height: 16),
              const KoraSandboxPaymentMethod(
                selected: true,
                onSelected: _ignoreBool,
              ),
              const SizedBox(height: 16),
              const KoraPaymentStatusPanel(state: KoraPaymentState.pending),
              const SizedBox(height: 16),
              const KoraReceiptSummary(
                reference: 'KORA-TEST-001',
                totalCfa: 2500,
                purchasedAtLabel: '12 août 2026 à 10:30',
                children: <Widget>[
                  KoraPurchaseLine(
                    title: 'Voix du fleuve',
                    artistName: 'Awa Traoré',
                    amountCfa: 2500,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Row(
                children: <Widget>[
                  Expanded(
                    child: KoraActionButton(
                      label: 'Continuer',
                      onPressed: _noop,
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: KoraActionButton(
                      label: 'Annuler',
                      onPressed: _noop,
                      variant: KoraActionVariant.secondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _noop() {}
void _ignoreBool(bool _) {}
