import 'package:flutter_riverpod/flutter_riverpod.dart';

enum FoundationViewStatus { loading, empty, error, offline }

class FoundationPresentationController extends Notifier<FoundationViewStatus> {
  @override
  FoundationViewStatus build() => FoundationViewStatus.empty;

  void show(FoundationViewStatus status) {
    state = status;
  }
}

final foundationPresentationProvider =
    NotifierProvider<FoundationPresentationController, FoundationViewStatus>(
      FoundationPresentationController.new,
    );
