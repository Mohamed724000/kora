import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';

class KoraPrice extends StatelessWidget {
  const KoraPrice({required this.amountCfa, this.compact = false, super.key});

  final int amountCfa;
  final bool compact;

  String get formattedAmount {
    final digits = amountCfa.toString();
    final buffer = StringBuffer();
    for (var index = 0; index < digits.length; index++) {
      if (index > 0 && (digits.length - index) % 3 == 0) {
        buffer.write('\u202f');
      }
      buffer.write(digits[index]);
    }
    return '${buffer.toString()} FCFA';
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$amountCfa francs CFA',
      child: ExcludeSemantics(
        child: Text(
          formattedAmount,
          style:
              (compact
                      ? Theme.of(context).textTheme.labelLarge
                      : Theme.of(context).textTheme.titleMedium)
                  ?.copyWith(
                    color: KoraColors.gold,
                    fontWeight: FontWeight.w800,
                  ),
        ),
      ),
    );
  }
}

class KoraArtistIdentity extends StatelessWidget {
  const KoraArtistIdentity({
    required this.name,
    this.isVerified = false,
    this.image,
    super.key,
  });

  final String name;
  final bool isVerified;
  final ImageProvider<Object>? image;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: isVerified ? 'Artiste vérifié : $name' : 'Artiste : $name',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            CircleAvatar(
              radius: 18,
              foregroundImage: image,
              backgroundColor: const Color(0xFF2A292E),
              child: image == null
                  ? const Icon(Icons.person_outline, size: 20)
                  : null,
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (isVerified) ...<Widget>[
              const SizedBox(width: 6),
              const Icon(Icons.verified, color: KoraColors.gold, size: 18),
            ],
          ],
        ),
      ),
    );
  }
}

class KoraAudioCard extends StatelessWidget {
  const KoraAudioCard({
    required this.title,
    required this.artistName,
    required this.amountCfa,
    required this.onOpen,
    this.artwork,
    this.badge,
    super.key,
  });

  final String title;
  final String artistName;
  final int amountCfa;
  final VoidCallback onOpen;
  final ImageProvider<Object>? artwork;
  final Widget? badge;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title, par $artistName, $amountCfa francs CFA',
      onTap: onOpen,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: <Widget>[
                _AudioArtwork(image: artwork),
                const SizedBox(width: 12),
                Expanded(
                  child: ExcludeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        if (badge != null) ...<Widget>[
                          badge!,
                          const SizedBox(height: 8),
                        ],
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          artistName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 8),
                        KoraPrice(amountCfa: amountCfa, compact: true),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                const ExcludeSemantics(
                  child: Icon(Icons.chevron_right, color: KoraColors.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AudioArtwork extends StatelessWidget {
  const _AudioArtwork({this.image});

  final ImageProvider<Object>? image;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 80,
      height: 80,
      decoration: BoxDecoration(
        color: const Color(0xFF242329),
        borderRadius: BorderRadius.circular(12),
        image: image == null
            ? null
            : DecorationImage(image: image!, fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: image == null
          ? const Icon(Icons.graphic_eq, color: KoraColors.gold, size: 32)
          : null,
    );
  }
}

class KoraPurchaseLine extends StatelessWidget {
  const KoraPurchaseLine({
    required this.title,
    required this.artistName,
    required this.amountCfa,
    super.key,
  });

  final String title;
  final String artistName;
  final int amountCfa;

  @override
  Widget build(BuildContext context) {
    final useStackedLayout = MediaQuery.textScalerOf(context).scale(16) >= 24;
    final identity = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const Icon(Icons.music_note, color: KoraColors.gold),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              Text(artistName, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );

    return Semantics(
      label: '$title, $artistName, $amountCfa francs CFA',
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: useStackedLayout
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    identity,
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: KoraPrice(amountCfa: amountCfa, compact: true),
                    ),
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(child: identity),
                    const SizedBox(width: 8),
                    KoraPrice(amountCfa: amountCfa, compact: true),
                  ],
                ),
        ),
      ),
    );
  }
}

class KoraReceiptSummary extends StatelessWidget {
  const KoraReceiptSummary({
    required this.reference,
    required this.totalCfa,
    required this.purchasedAtLabel,
    required this.children,
    super.key,
  });

  final String reference;
  final int totalCfa;
  final String purchasedAtLabel;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final useStackedTotal = MediaQuery.textScalerOf(context).scale(16) >= 24;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                const Icon(Icons.receipt_long, color: KoraColors.gold),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Reçu $reference',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              purchasedAtLabel,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            const Divider(),
            ...children,
            const Divider(),
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: useStackedTotal
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        Text(
                          'Total',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 4),
                        Align(
                          alignment: Alignment.centerRight,
                          child: KoraPrice(amountCfa: totalCfa),
                        ),
                      ],
                    )
                  : Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            'Total',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        KoraPrice(amountCfa: totalCfa),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
