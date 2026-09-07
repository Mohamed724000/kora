import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';
import 'kora_actions.dart';
import 'kora_badges.dart';

enum KoraPaymentState { pending, success, failed }

class KoraPaymentStatusPanel extends StatelessWidget {
  const KoraPaymentStatusPanel({
    required this.state,
    this.safeMessage,
    this.onRetry,
    super.key,
  });

  final KoraPaymentState state;
  final String? safeMessage;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final (label, message, tone, icon) = switch (state) {
      KoraPaymentState.pending => (
        'Paiement en attente',
        safeMessage ??
            'Nous vérifions le résultat. Vous pouvez revenir ici plus tard.',
        KoraStatusTone.warning,
        Icons.schedule,
      ),
      KoraPaymentState.success => (
        'Paiement confirmé',
        safeMessage ?? 'Votre achat est maintenant disponible dans Mes achats.',
        KoraStatusTone.success,
        Icons.check_circle_outline,
      ),
      KoraPaymentState.failed => (
        'Paiement non abouti',
        safeMessage ?? 'Aucun achat n’a été accordé. Vous pouvez réessayer.',
        KoraStatusTone.error,
        Icons.error_outline,
      ),
    };

    return Semantics(
      container: true,
      explicitChildNodes: true,
      liveRegion: state != KoraPaymentState.success,
      label: '$label. $message',
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Icon(icon, color: _toneColor(tone), size: 28),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            label,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      message,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              if (state == KoraPaymentState.failed &&
                  onRetry != null) ...<Widget>[
                const SizedBox(height: 16),
                KoraActionButton(
                  label: 'Réessayer le paiement',
                  onPressed: onRetry,
                  variant: KoraActionVariant.secondary,
                  expand: true,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Color _toneColor(KoraStatusTone tone) => switch (tone) {
    KoraStatusTone.success => KoraColors.success,
    KoraStatusTone.warning => KoraColors.warning,
    KoraStatusTone.error => KoraColors.error,
    _ => KoraColors.gold,
  };
}
