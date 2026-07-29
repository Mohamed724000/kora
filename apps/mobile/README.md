# KORA+ Mobile

Fondation Flutter Android et iOS de KORA+. Ce lot installe uniquement le shell
de navigation, le thème, l'état de présentation et les primitives d'interface.
Il ne contient ni authentification, ni achat, ni paiement, ni téléchargement,
ni lecture média, ni mode hors connexion fonctionnel.

## Environnement verrouillé

- Flutter `3.44.1`
- Dart `3.12.1`
- `flutter_riverpod` `3.4.1`
- `go_router` `17.3.0`
- `flutter_lints` `6.0.0`

Les dépendances utilisent des versions exactes. Le mobile reste hors des
workspaces npm.

## Architecture

```text
lib/
  main.dart
  src/
    app.dart
    foundation/
      application/
      presentation/
    navigation/
    theme/
```

- GoRouter expose les cinq sections officielles dans leur ordre canonique :
  Accueil, Découvrir, Mes achats, Lecteur, Compte.
- Riverpod conserve l'état de présentation de la fondation.
- Les états chargement, vide, erreur et hors connexion sont réutilisables.
- Aucun mini-lecteur n'est monté lorsqu'aucun média réel n'est actif.

## Identifiants provisoires

Les hôtes utilisent `com.example.kora_plus` sur Android et
`com.example.koraPlus` sur iOS. Ces identifiants de génération sont
explicitement provisoires et ne doivent pas être utilisés pour une publication
en store avant validation du Product Owner.

## Validation

Après la résolution centralisée des dépendances par l'orchestrateur :

```text
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter pub deps
flutter build apk --debug
```

Sous Windows, le build iOS reste non exécuté.

Les tests golden ciblent une largeur de 341 pixels. Les références sont déclarées
dans `test/golden_test.dart` et doivent être générées par l'orchestrateur avec :

```text
flutter test --update-goldens test/golden_test.dart
```

Fichiers attendus :

- `test/goldens/foundation_shell_341.png`
- `test/goldens/foundation_states_gallery_341.png`
- `test/goldens/no_mini_player_341.png`
