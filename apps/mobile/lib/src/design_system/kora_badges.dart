import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';

enum KoraStatusTone { neutral, information, success, warning, error }

class KoraStatusBadge extends StatelessWidget {
  const KoraStatusBadge({
    required this.label,
    this.tone = KoraStatusTone.neutral,
    super.key,
  });

  final String label;
  final KoraStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (tone) {
      KoraStatusTone.neutral => (KoraColors.muted, Icons.circle_outlined),
      KoraStatusTone.information => (KoraColors.gold, Icons.info_outline),
      KoraStatusTone.success => (
        KoraColors.success,
        Icons.check_circle_outline,
      ),
      KoraStatusTone.warning => (KoraColors.warning, Icons.schedule),
      KoraStatusTone.error => (KoraColors.error, Icons.error_outline),
    };

    return Semantics(
      label: 'Statut : $label',
      child: ExcludeSemantics(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            border: Border.all(color: color.withValues(alpha: 0.75)),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(icon, color: color, size: 16),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 2,
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall?.copyWith(color: KoraColors.ivory),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
