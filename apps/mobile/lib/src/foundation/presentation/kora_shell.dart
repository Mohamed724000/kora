import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../navigation/app_section.dart';
import '../../theme/kora_colors.dart';

const foundationShellKey = Key('foundation-shell');

class KoraShell extends ConsumerWidget {
  const KoraShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sections = ref.watch(appSectionsProvider);

    return Scaffold(
      key: foundationShellKey,
      appBar: AppBar(
        toolbarHeight: 60,
        titleSpacing: 20,
        title: Semantics(
          header: true,
          label: 'KORA plus',
          child: ExcludeSemantics(
            child: Text.rich(
              TextSpan(
                children: <InlineSpan>[
                  TextSpan(
                    text: 'KORA',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  TextSpan(
                    text: '+',
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(color: KoraColors.gold),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: navigationShell,
      bottomNavigationBar: KoraBottomNavigation(
        sections: sections,
        currentIndex: navigationShell.currentIndex,
        onSelected: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
      ),
    );
  }
}

class KoraBottomNavigation extends StatelessWidget {
  const KoraBottomNavigation({
    required this.sections,
    required this.currentIndex,
    required this.onSelected,
    super.key,
  });

  final List<AppSection> sections;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: KoraColors.surface,
        border: Border(top: BorderSide(color: Color(0xFF2A292E))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 84,
          child: Row(
            children: <Widget>[
              for (var index = 0; index < sections.length; index++)
                Expanded(
                  child: KoraNavigationItem(
                    section: sections[index],
                    selected: currentIndex == index,
                    onTap: () => onSelected(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class KoraNavigationItem extends StatelessWidget {
  const KoraNavigationItem({
    required this.section,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final AppSection section;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final labelStyle = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: selected ? KoraColors.ivory : KoraColors.muted,
    );

    return Semantics(
      button: true,
      onTap: onTap,
      selected: selected,
      label: section.label,
      child: ExcludeSemantics(
        child: InkWell(
          key: ValueKey<String>('tab-${section.name}'),
          onTap: onTap,
          child: SizedBox.expand(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    curve: Curves.easeOut,
                    width: 44,
                    height: 32,
                    decoration: BoxDecoration(
                      color: selected
                          ? KoraColors.gold.withValues(alpha: 0.16)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    alignment: Alignment.center,
                    child: Icon(
                      selected ? section.selectedIcon : section.icon,
                      color: selected ? KoraColors.gold : KoraColors.muted,
                      size: 22,
                    ),
                  ),
                  const SizedBox(height: 3),
                  SizedBox(
                    height: 34,
                    child: Text(
                      section.label,
                      maxLines: 2,
                      overflow: TextOverflow.clip,
                      textAlign: TextAlign.center,
                      style: labelStyle,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
