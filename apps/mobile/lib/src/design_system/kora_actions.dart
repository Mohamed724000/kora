import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';

enum KoraActionVariant { primary, secondary, destructive }

class KoraActionButton extends StatelessWidget {
  const KoraActionButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = KoraActionVariant.primary,
    this.expand = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final KoraActionVariant variant;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = icon == null
        ? Text(label)
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(icon, size: 20),
              const SizedBox(width: 8),
              Flexible(child: Text(label)),
            ],
          );
    final style = ButtonStyle(
      minimumSize: WidgetStateProperty.all(const Size(48, 48)),
      padding: WidgetStateProperty.all(
        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      ),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );

    final button = switch (variant) {
      KoraActionVariant.primary => FilledButton(
        onPressed: onPressed,
        style: style,
        child: child,
      ),
      KoraActionVariant.secondary => OutlinedButton(
        onPressed: onPressed,
        style: style,
        child: child,
      ),
      KoraActionVariant.destructive => FilledButton(
        onPressed: onPressed,
        style: style.copyWith(
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? KoraColors.error.withValues(alpha: 0.35)
                : KoraColors.error,
          ),
          foregroundColor: WidgetStateProperty.all(KoraColors.background),
        ),
        child: child,
      ),
    };

    return Semantics(
      button: true,
      enabled: onPressed != null,
      excludeSemantics: true,
      label: label,
      onTap: onPressed,
      child: expand ? SizedBox(width: double.infinity, child: button) : button,
    );
  }
}
