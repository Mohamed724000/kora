import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppSection {
  home,
  discover,
  purchases,
  player,
  account;

  String get label => switch (this) {
    AppSection.home => 'Accueil',
    AppSection.discover => 'Découvrir',
    AppSection.purchases => 'Mes achats',
    AppSection.player => 'Lecteur',
    AppSection.account => 'Compte',
  };

  String get route => switch (this) {
    AppSection.home => '/',
    AppSection.discover => '/decouvrir',
    AppSection.purchases => '/mes-achats',
    AppSection.player => '/lecteur',
    AppSection.account => '/compte',
  };

  IconData get icon => switch (this) {
    AppSection.home => Icons.home_outlined,
    AppSection.discover => Icons.explore_outlined,
    AppSection.purchases => Icons.library_music_outlined,
    AppSection.player => Icons.play_circle_outline,
    AppSection.account => Icons.person_outline,
  };

  IconData get selectedIcon => switch (this) {
    AppSection.home => Icons.home_rounded,
    AppSection.discover => Icons.explore_rounded,
    AppSection.purchases => Icons.library_music_rounded,
    AppSection.player => Icons.play_circle_fill_rounded,
    AppSection.account => Icons.person_rounded,
  };

  String get emptyTitle => switch (this) {
    AppSection.home => 'Rien à afficher pour le moment',
    AppSection.discover => 'Aucune sélection disponible',
    AppSection.purchases => 'Aucun achat disponible',
    AppSection.player => 'Aucun média en cours',
    AppSection.account => 'Aucune information disponible',
  };

  String get emptyMessage => switch (this) {
    AppSection.home =>
      'Les contenus apparaîtront ici lorsqu’ils seront disponibles.',
    AppSection.discover =>
      'Les contenus à découvrir apparaîtront ici lorsqu’ils seront disponibles.',
    AppSection.purchases =>
      'Vos achats apparaîtront ici lorsqu’ils seront disponibles.',
    AppSection.player =>
      'Le lecteur reste vide tant qu’aucun média réel n’est actif.',
    AppSection.account =>
      'Les informations du compte apparaîtront ici lorsqu’elles seront disponibles.',
  };
}

final appSectionsProvider = Provider<List<AppSection>>(
  (ref) => AppSection.values,
);
