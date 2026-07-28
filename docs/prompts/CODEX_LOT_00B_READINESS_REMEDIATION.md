# KORA+ Final — Codex Lot 00B

## Readiness remediation and final preflight

Tu es l’orchestrateur principal d’ingénierie de KORA+.

Ce lot suit le préflight Lot 00 conclu `NOT READY POUR SPRINT 0`. Il corrige
uniquement les bloqueurs documentaires et vérifie la toolchain. Il ne commence
pas Sprint 0 et ne génère aucun code applicatif.

## 1. Racine obligatoire

Travaille uniquement dans la racine ouverte dont le basename est exactement :

`KORA-PLUS-FINAL`

Arrête-toi avant toute écriture si cette condition n’est pas satisfaite.

Ne consulte aucun autre projet KORA+.

## 2. Autorité

Lis intégralement avant d’agir :

- `docs/governance/AI_OPERATING_MODEL.md`
- `docs/governance/CLEAN_ROOM_SCOPE.md`
- `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md`
- `docs/source-material/references/adminlte/README.md`
- le rapport Lot 00 fourni dans cette conversation

Le Blueprint approuvé du 2026-07-28 et `CLEAN_ROOM_SCOPE.md` rendent
non exécutables les références historiques à `KORA-REBUILD`, Sprint 0A,
Sprint 0B et à la réparation d’un ancien Flutter.

## 3. Objectif unique

Obtenir un verdict fiable :

`READY FOR SPRINT 0.1`

ou :

`NOT READY FOR SPRINT 0.1`

Sans initialiser Git, sans installer de package et sans générer d’application.

## 4. Écritures autorisées

Tu peux uniquement :

1. supprimer le fichier accidentel `debug.log` à la racine si et seulement si :
   - son SHA-256 est exactement
     `89B87E63F4C53B9A8C2A7F556E125F7FF62082ACCA18F951A990F19B2891D1F5` ;
   - sa taille est 132 octets ;
   - son contenu correspond à l’erreur Crashpad `CreateFile: Access is denied`.
2. déplacer le prompt
   `docs/source-material/originals/prompts/CODEX_LOT_00_READ_ONLY_PREFLIGHT.md`
   vers `docs/prompts/CODEX_LOT_00_READ_ONLY_PREFLIGHT.md` uniquement si :
   - la source existe ;
   - la destination n’existe pas ;
   - le contenu n’est pas modifié.

Si l’une de ces vérifications échoue, ne supprime ou ne déplace rien et
signale le conflit.

Aucune autre écriture n’est autorisée.

## 5. Documents à vérifier

Confirme la présence et la lisibilité de :

- toutes les sources déjà validées pendant Lot 00 ;
- `docs/governance/AI_OPERATING_MODEL.md` avec statut APPROUVÉ ;
- `docs/governance/CLEAN_ROOM_SCOPE.md` ;
- `docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md` avec statut APPROUVÉ ;
- `docs/prompts/CODEX_LOT_00_READ_ONLY_PREFLIGHT.md` après canonicalisation ;
- `docs/prompts/CODEX_LOT_00B_READINESS_REMEDIATION.md` ;
- `docs/source-material/references/adminlte/AdminLTE-master.zip` ;
- `docs/source-material/references/adminlte/README.md`.

Pour l’archive AdminLTE, vérifie :

- SHA-256 :
  `9b69b877e005e41e06c21f8a4f52cb3b999464e3446fbb961ff962c69b450b5d` ;
- `package.json` interne : `admin-lte` version `4.1.0` ;
- aucune extraction de cette archive sous `apps/`.

Ne lance aucun script de l’archive et aucun `npm install` dans celle-ci.

## 6. Décisions toolchain approuvées

- Node.js `22.18.0` est la baseline Sprint 0.
- npm `10.9.3` est accepté.
- Sous PowerShell, utilise explicitement `npm.cmd`.
- Ne change pas la politique d’exécution PowerShell.
- Flutter `3.44.1` et Dart `3.12.1` sont acceptés.
- Le futur conteneur Node utilisera `node:22-alpine`.

Vérifie les versions sans les mettre à jour.

Pour Docker, exécute uniquement des diagnostics non destructifs :

- `docker --version`
- `docker compose version`
- `docker info`

Ne modifie pas `C:\Users\moham\.docker\config.json`, ne crée pas de configuration
alternative et ne démarre aucun conteneur.

Si Docker reste inaccessible, classe-le :

`BLOCKER FOR SPRINT 0.4 — NOT BLOCKING SPRINT 0.1`

Il ne doit pas empêcher le verdict `READY FOR SPRINT 0.1` si tous les autres
critères sont satisfaits.

## 7. Périmètre VS Code

Ne tente plus d’inspecter les lignes de commande de processus Windows et ne
demande aucun accès système supplémentaire.

Considère le périmètre conforme si :

- la racine courante se termine exactement par `KORA-PLUS-FINAL` ;
- aucun `.code-workspace` ne référence un autre projet ;
- aucun lien symbolique, jonction ou reparse point ne sort de la racine ;
- aucun ancien code n’est présent.

## 8. Sous-agents

Utilise au maximum deux spécialistes en lecture seule :

1. Documents & Clean-room Verifier.
2. Toolchain & Windows Verifier.

Le thread principal effectue seul les deux écritures conditionnelles autorisées.
Les agents ne modifient rien.

## 9. Interdictions

- aucun `git init`, commit, remote, push ou PR ;
- aucun `npm install`, `npm create`, `npx` ou `flutter create` ;
- aucun code, manifeste ou lockfile ;
- aucune extraction AdminLTE ;
- aucune consultation d’ancien projet ;
- aucune suppression autre que le `debug.log` strictement vérifié ;
- aucune modification hors racine ;
- aucune modification de document officiel.

## 10. Critères d’acceptation

Le verdict est `READY FOR SPRINT 0.1` seulement si :

- racine clean room conforme ;
- aucun ancien code ;
- documents officiels et ADR complets ;
- AI Operating Model approuvé ;
- Clean-room Scope approuvé ;
- Master Execution Blueprint approuvé ;
- prompts dans `docs/prompts` ;
- `debug.log` accidentel absent ;
- AdminLTE rangé comme référence non extraite ;
- Git, Node, npm, Flutter et Dart disponibles selon la baseline ;
- aucune nouvelle mutation non autorisée ;
- Docker est soit accessible, soit explicitement différé comme blocker S0.4.

## 11. Rapport final

Réponds en français avec :

1. verdict ;
2. racine et état clean room ;
3. fichiers supprimés ou déplacés ;
4. documents et statuts ;
5. AdminLTE : chemin, version, hash et non-extraction ;
6. toolchain ;
7. diagnostic Docker ;
8. commandes et codes de sortie ;
9. critères d’acceptation ;
10. bloqueurs restants classés par lot ;
11. recommandation GO ou NO-GO pour `S0.1 — Gouvernance et Git`.

Arrête-toi après le rapport. Ne commence pas S0.1.
