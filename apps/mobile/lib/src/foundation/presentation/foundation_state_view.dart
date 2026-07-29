import 'package:flutter/material.dart';

import '../../theme/kora_colors.dart';
import '../application/foundation_presentation_controller.dart';

const foundationLoadingKey = Key('foundation-state-loading');
const foundationEmptyKey = Key('foundation-state-empty');
const foundationErrorKey = Key('foundation-state-error');
const foundationOfflineKey = Key('foundation-state-offline');

class FoundationStateView extends StatelessWidget {
  const FoundationStateView({
    required this.status,
    this.emptyTitle = 'Rien à afficher',
    this.emptyMessage = 'Le contenu apparaîtra ici lorsqu’il sera disponible.',
    this.onRetry,
    super.key,
  });

  final FoundationViewStatus status;
  final String emptyTitle;
  final String emptyMessage;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final details = _detailsFor(status);

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: FoundationStatePanel(
            key: details.key,
            status: status,
            title: status == FoundationViewStatus.empty
                ? emptyTitle
                : details.title,
            message: status == FoundationViewStatus.empty
                ? emptyMessage
                : details.message,
            onRetry: onRetry,
          ),
        ),
      ),
    );
  }
}

class FoundationStatePanel extends StatelessWidget {
  const FoundationStatePanel({
    required this.status,
    required this.title,
    required this.message,
    this.onRetry,
    this.compact = false,
    super.key,
  });

  final FoundationViewStatus status;
  final String title;
  final String message;
  final VoidCallback? onRetry;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final semanticsLabel = '$title. $message';

    if (compact) {
      return Semantics(
        container: true,
        label: semanticsLabel,
        child: ExcludeSemantics(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _StatusIndicator(status: status, compact: true),
                  const SizedBox(width: 14),
                  Expanded(
                    child: _StatusCopy(
                      title: title,
                      message: message,
                      compact: true,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Semantics(
      container: true,
      liveRegion: status != FoundationViewStatus.empty,
      label: semanticsLabel,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ExcludeSemantics(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                _StatusIndicator(status: status),
                const SizedBox(height: 20),
                _StatusCopy(title: title, message: message),
              ],
            ),
          ),
          if (onRetry != null &&
              (status == FoundationViewStatus.error ||
                  status == FoundationViewStatus.offline)) ...<Widget>[
            const SizedBox(height: 24),
            OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ],
      ),
    );
  }
}

class _StatusIndicator extends StatelessWidget {
  const _StatusIndicator({required this.status, this.compact = false});

  final FoundationViewStatus status;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 44.0 : 64.0;
    final details = _detailsFor(status);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: details.accent.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: status == FoundationViewStatus.loading
          ? SizedBox.square(
              dimension: compact ? 22 : 30,
              child: const CircularProgressIndicator(
                color: KoraColors.gold,
                strokeWidth: 2.5,
              ),
            )
          : Icon(details.icon, color: details.accent, size: compact ? 22 : 30),
    );
  }
}

class _StatusCopy extends StatelessWidget {
  const _StatusCopy({
    required this.title,
    required this.message,
    this.compact = false,
  });

  final String title;
  final String message;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: compact
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      children: <Widget>[
        Text(
          title,
          textAlign: compact ? TextAlign.start : TextAlign.center,
          style: compact ? textTheme.titleMedium : textTheme.titleLarge,
        ),
        SizedBox(height: compact ? 4 : 8),
        Text(
          message,
          textAlign: compact ? TextAlign.start : TextAlign.center,
          style: textTheme.bodyMedium,
        ),
      ],
    );
  }
}

_FoundationStateDetails _detailsFor(FoundationViewStatus status) {
  return switch (status) {
    FoundationViewStatus.loading => const _FoundationStateDetails(
      key: foundationLoadingKey,
      title: 'Chargement en cours',
      message: 'Veuillez patienter un instant.',
      icon: Icons.hourglass_empty_rounded,
      accent: KoraColors.gold,
    ),
    FoundationViewStatus.empty => const _FoundationStateDetails(
      key: foundationEmptyKey,
      title: 'Rien à afficher',
      message: 'Le contenu apparaîtra ici lorsqu’il sera disponible.',
      icon: Icons.inbox_outlined,
      accent: KoraColors.muted,
    ),
    FoundationViewStatus.error => const _FoundationStateDetails(
      key: foundationErrorKey,
      title: 'Une erreur est survenue',
      message: 'Réessayez dans un instant.',
      icon: Icons.error_outline_rounded,
      accent: KoraColors.error,
    ),
    FoundationViewStatus.offline => const _FoundationStateDetails(
      key: foundationOfflineKey,
      title: 'Vous êtes hors connexion',
      message: 'Vérifiez votre connexion puis réessayez.',
      icon: Icons.cloud_off_outlined,
      accent: KoraColors.muted,
    ),
  };
}

class _FoundationStateDetails {
  const _FoundationStateDetails({
    required this.key,
    required this.title,
    required this.message,
    required this.icon,
    required this.accent,
  });

  final Key key;
  final String title;
  final String message;
  final IconData icon;
  final Color accent;
}
