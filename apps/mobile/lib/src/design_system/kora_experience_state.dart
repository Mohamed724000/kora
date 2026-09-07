import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';
import 'kora_actions.dart';

enum KoraExperienceState { loading, empty, error, offline }

class KoraExperienceStateView extends StatelessWidget {
  const KoraExperienceStateView({
    required this.state,
    required this.title,
    required this.message,
    this.onRetry,
    super.key,
  });

  final KoraExperienceState state;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.disableAnimationsOf(context);
    final (icon, label) = switch (state) {
      KoraExperienceState.loading => (Icons.hourglass_top, 'Chargement'),
      KoraExperienceState.empty => (Icons.inbox_outlined, 'Aucun contenu'),
      KoraExperienceState.error => (Icons.error_outline, 'Erreur'),
      KoraExperienceState.offline => (
        Icons.cloud_off_outlined,
        'Hors connexion',
      ),
    };
    final canRetry =
        state == KoraExperienceState.error ||
        state == KoraExperienceState.offline;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      liveRegion:
          state == KoraExperienceState.loading ||
          state == KoraExperienceState.error,
      label: '$label. $title. $message',
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ExcludeSemantics(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    if (state == KoraExperienceState.loading &&
                        !disableAnimations)
                      const SizedBox.square(
                        dimension: 48,
                        child: CircularProgressIndicator(strokeWidth: 3),
                      )
                    else
                      Icon(icon, color: KoraColors.gold, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              if (canRetry && onRetry != null) ...<Widget>[
                const SizedBox(height: 20),
                KoraActionButton(
                  label: 'Réessayer',
                  onPressed: onRetry,
                  variant: KoraActionVariant.secondary,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
