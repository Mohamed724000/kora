import 'package:flutter/material.dart';

import '../theme/kora_colors.dart';
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
    super.key,
  });

  final KoraPlayableMedia? media;
  final VoidCallback onOpen;
  final VoidCallback onTogglePlayback;

  @override
  Widget build(BuildContext context) {
    final activeMedia = media;
    if (activeMedia == null) return const SizedBox.shrink();

    return Semantics(
      container: true,
      label: 'Mini-lecteur. ${activeMedia.title}, ${activeMedia.artistName}',
      child: DecoratedBox(
        key: const Key('mini-player'),
        decoration: const BoxDecoration(
          color: KoraColors.surface,
          border: Border(top: BorderSide(color: KoraColors.gold)),
        ),
        child: SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: InkWell(
                    onTap: onOpen,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      child: Row(
                        children: <Widget>[
                          const Icon(Icons.graphic_eq, color: KoraColors.gold),
                          const SizedBox(width: 12),
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
                IconButton(
                  onPressed: onTogglePlayback,
                  tooltip: activeMedia.isPlaying ? 'Mettre en pause' : 'Lire',
                  icon: Icon(
                    activeMedia.isPlaying ? Icons.pause : Icons.play_arrow,
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ),
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
    this.onBrowse,
    super.key,
  });

  final KoraPlayableMedia? media;
  final VoidCallback onTogglePlayback;
  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    final activeMedia = media;
    if (activeMedia == null) {
      return Semantics(
        container: true,
        label:
            'Lecteur vide. Choisissez un titre dans Découvrir ou Mes achats.',
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Icon(
                  Icons.headphones_outlined,
                  color: KoraColors.gold,
                  size: 56,
                ),
                const SizedBox(height: 16),
                Text(
                  'Prêt à écouter ?',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  'Choisissez un titre dans Découvrir ou retrouvez vos achats.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (onBrowse != null) ...<Widget>[
                  const SizedBox(height: 20),
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

    return Semantics(
      container: true,
      label: 'Lecteur. ${activeMedia.title}, ${activeMedia.artistName}',
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            AspectRatio(
              aspectRatio: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xFF242329),
                  borderRadius: BorderRadius.circular(24),
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
                          size: 72,
                        ),
                      )
                    : null,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              activeMedia.title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            Text(
              activeMedia.artistName,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            IconButton.filled(
              onPressed: onTogglePlayback,
              tooltip: activeMedia.isPlaying ? 'Mettre en pause' : 'Lire',
              iconSize: 32,
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
