import 'package:flutter/material.dart';

import '../../theme/kora_colors.dart';
import '../application/foundation_presentation_controller.dart';
import 'foundation_state_view.dart';

class FoundationStatesGallery extends StatelessWidget {
  const FoundationStatesGallery({super.key});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: KoraColors.background,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: const <Widget>[
              Text(
                'États de fondation',
                style: TextStyle(
                  color: KoraColors.ivory,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              SizedBox(height: 16),
              FoundationStatePanel(
                status: FoundationViewStatus.loading,
                title: 'Chargement en cours',
                message: 'Veuillez patienter un instant.',
                compact: true,
              ),
              SizedBox(height: 12),
              FoundationStatePanel(
                status: FoundationViewStatus.empty,
                title: 'Rien à afficher',
                message: 'Le contenu apparaîtra ici lorsqu’il sera disponible.',
                compact: true,
              ),
              SizedBox(height: 12),
              FoundationStatePanel(
                status: FoundationViewStatus.error,
                title: 'Une erreur est survenue',
                message: 'Réessayez dans un instant.',
                compact: true,
              ),
              SizedBox(height: 12),
              FoundationStatePanel(
                status: FoundationViewStatus.offline,
                title: 'Vous êtes hors connexion',
                message: 'Vérifiez votre connexion puis réessayez.',
                compact: true,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
