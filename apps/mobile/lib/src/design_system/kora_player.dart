import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';
import '../theme/kora_theme.dart';
import 'kora_actions.dart';

class KoraPlayableMedia {
  const KoraPlayableMedia({
    required this.contentId,
    required this.title,
    required this.artistName,
    required this.isPlaying,
    this.artwork,
  });

  final String contentId;
  final String title;
  final String artistName;
  final bool isPlaying;
  final ImageProvider<Object>? artwork;
}

class KoraMiniPlayer extends StatelessWidget {
  const KoraMiniPlayer({
    required this.media,
    required this.onOpen,
    required this.onTogglePlayback,
    required this.playingStateLabel,
    required this.pausedStateLabel,
    super.key,
  });

  final KoraPlayableMedia? media;
  final VoidCallback onOpen;
  final VoidCallback onTogglePlayback;
  final String playingStateLabel;
  final String pausedStateLabel;

  @override
  Widget build(BuildContext context) {
    final activeMedia = media;
    if (activeMedia == null) return const SizedBox.shrink();
    final playbackStateLabel = activeMedia.isPlaying
        ? playingStateLabel
        : pausedStateLabel;

    return DecoratedBox(
      key: const Key('mini-player'),
      decoration: const BoxDecoration(
        color: KoraColors.surface,
        border: Border(top: BorderSide(color: KoraColors.gold)),
      ),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: KoraDimensions.miniPlayerMinHeight,
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Semantics(
                  button: true,
                  excludeSemantics: true,
                  label:
                      'Mini-lecteur. ${activeMedia.title}, ${activeMedia.artistName}. $playbackStateLabel',
                  onTap: onOpen,
                  child: InkWell(
                    excludeFromSemantics: true,
                    onTap: onOpen,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: KoraSpacing.xl,
                        vertical: KoraSpacing.md,
                      ),
                      child: Row(
                        children: <Widget>[
                          const Icon(Icons.graphic_eq, color: KoraColors.gold),
                          const SizedBox(width: KoraSpacing.lg),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: <Widget>[
                                Text(
                                  activeMedia.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                ),
                                Text(
                                  activeMedia.artistName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: onTogglePlayback,
                tooltip: activeMedia.isPlaying ? 'Mettre en pause' : 'Lire',
                icon: Icon(
                  activeMedia.isPlaying ? Icons.pause : Icons.play_arrow,
                ),
              ),
              const SizedBox(width: KoraSpacing.sm),
            ],
          ),
        ),
      ),
    );
  }
}

class KoraFullPlayer extends StatelessWidget {
  const KoraFullPlayer({
    required this.media,
    required this.onTogglePlayback,
    required this.playingStateLabel,
    required this.pausedStateLabel,
    this.onBrowse,
    super.key,
  });

  final KoraPlayableMedia? media;
  final VoidCallback onTogglePlayback;
  final String playingStateLabel;
  final String pausedStateLabel;
  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    final activeMedia = media;
    if (activeMedia == null) {
      return Semantics(
        container: true,
        explicitChildNodes: true,
        label:
            'Lecteur vide. Choisissez un titre dans Découvrir ou Mes achats.',
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(KoraSpacing.xxxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                ExcludeSemantics(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      const Icon(
                        Icons.headphones_outlined,
                        color: KoraColors.gold,
                        size: KoraDimensions.emptyPlayerIcon,
                      ),
                      const SizedBox(height: KoraSpacing.xl),
                      Text(
                        'Prêt à écouter ?',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: KoraSpacing.sm),
                      Text(
                        'Choisissez un titre dans Découvrir ou retrouvez vos achats.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                if (onBrowse != null) ...<Widget>[
                  const SizedBox(height: KoraSpacing.xxl),
                  KoraActionButton(
                    label: 'Découvrir les titres',
                    onPressed: onBrowse,
                    variant: KoraActionVariant.secondary,
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    final playbackStateLabel = activeMedia.isPlaying
        ? playingStateLabel
        : pausedStateLabel;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          'Lecteur. ${activeMedia.title}, ${activeMedia.artistName}. $playbackStateLabel',
      child: Padding(
        padding: const EdgeInsets.all(KoraSpacing.xxxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            ExcludeSemantics(
              child: Column(
                children: <Widget>[
                  AspectRatio(
                    aspectRatio: 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: KoraColors.artworkSurface,
                        borderRadius: BorderRadius.circular(KoraRadii.artwork),
                        image: activeMedia.artwork == null
                            ? null
                            : DecorationImage(
                                image: activeMedia.artwork!,
                                fit: BoxFit.cover,
                              ),
                      ),
                      child: activeMedia.artwork == null
                          ? const Center(
                              child: Icon(
                                Icons.graphic_eq,
                                color: KoraColors.gold,
                                size: KoraDimensions.fullPlayerIcon,
                              ),
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: KoraSpacing.xxxl),
                  Text(
                    activeMedia.title,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: KoraSpacing.xs),
                  Text(
                    activeMedia.artistName,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: KoraSpacing.xxxl),
                ],
              ),
            ),
            IconButton.filled(
              onPressed: onTogglePlayback,
              tooltip: activeMedia.isPlaying ? 'Mettre en pause' : 'Lire',
              iconSize: KoraDimensions.iconXxl,
              icon: Icon(
                activeMedia.isPlaying ? Icons.pause : Icons.play_arrow,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
