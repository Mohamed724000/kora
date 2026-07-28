# KORA+ Final — Clean-room Scope

Statut : **APPROUVÉ**

Date d’effet : 2026-07-28

## Décision

La seule racine technique active est `KORA-PLUS-FINAL`.

Les projets `STREAM/Kora`, `KORA-REBUILD` et toute autre tentative antérieure
restent historiques. Aucun code, composant, manifeste, lockfile, configuration,
migration, build ou fichier d’environnement provenant de ces projets ne peut
être copié, comparé pour réutilisation, adapté, déplacé ou cherry-pické.

## Documents historiques

Les références à `KORA-REBUILD`, Sprint 0A, Sprint 0B, réparation d’un ancien
Flutter, `CardThemeData`, anciens tests `MyApp`, `RenderFlex` ou
`apps/mobile-flutter` présentes dans des archives documentaires sont
**non exécutables**.

Elles sont conservées uniquement pour la traçabilité et ne peuvent donner lieu
à aucune tâche.

## Sources conservées

Seuls sont réutilisables :

- les documents officiels KORA+ ;
- les ADR-001 à ADR-024 acceptés ;
- les décisions et registres approuvés ;
- les assets officiels dont KORA+ détient les droits ;
- les benchmarks, uniquement comme références fonctionnelles et ergonomiques.

## Référence AdminLTE

`docs/source-material/references/adminlte/AdminLTE-master.zip` est une référence
visuelle AdminLTE 4.1.0. L’archive ne doit pas être extraite dans une application
et ses pages HTML ne doivent jamais être intégrées.

L’implémentation du back-office utilise `@adminlte/react` et les dépendances npm
verrouillées par les ADR.

## Autorité

Ce document et `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md` remplacent toute
instruction historique incompatible avec la clean room.
