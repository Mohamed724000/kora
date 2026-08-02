import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../navigation/app_section.dart';
import '../application/foundation_presentation_controller.dart';
import 'foundation_state_view.dart';

class FoundationSectionScreen extends ConsumerWidget {
  const FoundationSectionScreen({required this.section, super.key});

  final AppSection section;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(foundationPresentationProvider);

    return ColoredBox(
      key: ValueKey<String>('screen-${section.name}'),
      color: Theme.of(context).scaffoldBackgroundColor,
      child: SafeArea(
        top: false,
        child: FoundationStateView(
          status: status,
          emptyTitle: section.emptyTitle,
          emptyMessage: section.emptyMessage,
        ),
      ),
    );
  }
}
