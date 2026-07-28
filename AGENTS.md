# KORA+ Final — règles d’exécution

## Autorité et périmètre

- La seule racine active est `KORA-PLUS-FINAL`.
- Aucun code, manifeste, migration, configuration ou build d’un ancien projet
  KORA+ ne peut être consulté pour réutilisation, copié, adapté ou déplacé.
- Le Cahier des charges V4 définit le produit. Les ADR-001 à ADR-024 acceptés
  corrigent les spécifications techniques et UI de rang inférieur.
- Le périmètre clean room et l’ordre des lots suivent
  `docs/governance/CLEAN_ROOM_SCOPE.md` et
  `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md`.
- Un prompt n’est exécutable que s’il est explicitement autorisé par le Product
  Owner dans la session active. Tout prompt terminé, remplacé ou non autorisé
  est historique, même s’il contient des impératifs.

## Responsabilités

- Mohamed Sogoba est Product Owner : vision, modèle économique, marque,
  contrats, dépenses importantes et validation visuelle finale.
- ChatGPT Work est l’autorité technique : architecture, arbitrage et Go/No-Go.
- Codex est l’orchestrateur d’exécution : intégration, Git et fichiers racine.
- Un seul orchestrateur modifie les fichiers racine et intègre les changements.
- Les sous-agents travaillent seulement sur des tâches indépendantes. Les
  écritures parallèles exigent des périmètres disjoints et une autorisation
  explicite.
- Les validateurs restent en lecture seule : ils signalent, le propriétaire
  corrige.

## Règles d’ingénierie

- Stack verrouillée : Flutter/Dart pour le mobile, Next.js pour le web et
  l’administration, NestJS/Prisma pour l’API, PostgreSQL, Redis/BullMQ,
  Cloudflare R2 et Mux selon les lots autorisés.
- Ne jamais inventer une décision produit, financière, juridique ou de
  sécurité. Signaler toute contradiction non arbitrée.
- Aucune dépendance de production sans justification, contrôle de licence,
  analyse de sécurité et validation du lot.
- Aucun secret, token, mot de passe, DSN, donnée privée ou URL de production
  dans le repository ou les logs.
- Toute logique financière reste côté serveur, contract-first, auditée et
  conforme aux ADR. Les écritures financières sont append-only et compensées.
- Ne jamais exposer ou journaliser une URL média brute.
- Exécuter les contrôles applicables de format, lint, typecheck, tests et build.
  Un contrôle non exécuté est déclaré `NON EXÉCUTÉ`, jamais `PASS`.
- Mettre à jour les documents vivants, la traçabilité, les contrats et les
  preuves avec chaque changement concerné.

## Git et sécurité opérationnelle

- Après le bootstrap local : un lot ou une fonctionnalité par branche et, après
  création autorisée du remote, une Pull Request contrôlée.
- Ne jamais utiliser de force-push sur `main`, de réécriture d’historique ou de
  commande destructive telle que `reset --hard` ou `clean`.
- Ne jamais créer de remote, tag, release, hook ou identité Git sans
  autorisation explicite.
- Préserver les travaux utilisateur préexistants et arrêter en cas de
  chevauchement non résoluble.

Consulter la [source de vérité](docs/governance/SOURCE_OF_TRUTH.md), le
[workflow Git](docs/governance/GIT_WORKFLOW.md) et la
[Definition of Done](docs/qa/DEFINITION_OF_DONE.md) avant toute exécution.
