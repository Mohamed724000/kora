# KORA+ Final

KORA+ Final est la clean room de production du produit KORA+. Le dépôt contient
la baseline documentaire, le contrat du monorepo et les fondations applicatives
des Sprints 0.3 à 0.5. Aucune fonctionnalité métier n’est implémentée.

## État actuel

- Gate 0 et Lots 00, 00B et 00C : terminés.
- Sprint 0.1 : terminé ; baseline unique publiée sur `main`.
- Sprint 0.2 : contrat monorepo terminé et validé par la revue CTO.
- Sprint 0.3 : **Closed and merged**.
- Sprint 0.4 : **Closed and merged** via la PR #5.
- Sprint 0.5 : **CI, sécurité et observabilité en cours sur sa branche dédiée**.
- S0.6 et les slices produit : non commencés.

Sprint 0.3 a été fermé et fusionné via la
[PR #2](https://github.com/Mohamed724000/kora/pull/2). Le commit de clôture est
[`c4bce826b8a16d78aa2b10865e0d03d191ea7f46`](https://github.com/Mohamed724000/kora/commit/c4bce826b8a16d78aa2b10865e0d03d191ea7f46)
et le merge commit est
[`d3f837c93044d0b514c2abd732c559cdd6543a96`](https://github.com/Mohamed724000/kora/commit/d3f837c93044d0b514c2abd732c559cdd6543a96).
Les gates CTO, Product Owner et juridique/licences sont fermés pour le seul
périmètre verrouillé de S0.3. Aucun lot suivant n’est autorisé par le présent
état. S0.4 a été fusionné via la
[PR #5](https://github.com/Mohamed724000/kora/pull/5), au merge commit
[`8c3e65e2bcbffb53050b61cab4b953f108491db1`](https://github.com/Mohamed724000/kora/commit/8c3e65e2bcbffb53050b61cab4b953f108491db1).
S0.5 reste strictement technique et S0.6 n’est pas commencé.

## Autorités

1. [Cahier des charges V4](docs/source-material/originals/KORA_PLUS_Cahier_des_charges_V4.docx)
2. [ADR-001 à ADR-024 acceptés](docs/source-material/originals/KORA_PLUS_Specification_Resolution_Pack_V2/docs/adr/)
3. Engineering Specification et Addendum V1.1
4. UI/UX Design Specification V1
5. Back-Office AdminLTE Integration Specification V1.1
6. [Source de vérité opérationnelle](docs/governance/SOURCE_OF_TRUTH.md)

La [portée clean room](docs/governance/CLEAN_ROOM_SCOPE.md), le
[modèle opératoire IA](docs/governance/AI_OPERATING_MODEL.md) et le
[Master Execution Blueprint](docs/roadmap/MASTER_EXECUTION_BLUEPRINT.md)
gouvernent l’exécution.

## Fondations de Sprint 0.3

- `apps/mobile` : Flutter `3.44.1`, Dart `3.12.1`, Riverpod et GoRouter,
  Android/iOS, cinq onglets officiels, états fondamentaux et goldens.
- `apps/web` : Next.js App Router public, accessible, responsive et sans
  commerce ou lecture web.
- `apps/admin` : Next.js App Router et `@adminlte/react`, thème clair, treize
  zones officielles et aucun comportement opérationnel.
- `apps/api` : NestJS, préfixe `/api/v1`, health checks honnêtes,
  configuration stricte, corrélation, logs avec redaction, Prisma PostgreSQL
  vide et préparation Redis/BullMQ sans queue.
- `packages/config`, `packages/ui` et `packages/contracts` : politiques
  réellement partagées, primitives communes et frontière contractuelle vide.

Le mobile reste hors des workspaces npm conformément à l’ADR-009.

## Fondations S0.4 et S0.5

- S0.4 fournit PostgreSQL et Redis locaux verrouillés par digest, leurs
  healthchecks, leur cycle de vie et les validations de panne/reprise de l’API.
- S0.5 ajoute quatre workflows GitHub Actions : qualité Linux, launcher
  Windows, infrastructure et sécurité.
- Le contrat OpenAPI reste limité à `/health/live` et `/health/ready` ;
  aucune route produit n’est introduite.
- Sentry est désactivé sans DSN. Lorsqu’il est configuré hors dépôt, PII, logs,
  traces, screenshots et données de requête restent désactivés ou assainis.
- Le rollback de fondation est décrit dans
  [FOUNDATION_ROLLBACK.md](docs/operations/FOUNDATION_ROLLBACK.md).

## Commandes

Sous Windows :

| Commande                       | Effet                                                                |
| ------------------------------ | -------------------------------------------------------------------- |
| `npm.cmd run env:check`        | Vérifie strictement Node, npm, Flutter et Dart                       |
| `npm.cmd run format`           | Contrôle Prettier, Prisma et Dart                                    |
| `npm.cmd run lint`             | Exécute ESLint et Flutter analyze                                    |
| `npm.cmd run typecheck`        | Exécute TypeScript strict et Dart analyze                            |
| `npm.cmd test`                 | Exécute Vitest, Jest, Node Test et Flutter/goldens                   |
| `npm.cmd run build`            | Construit les workspaces puis l’APK debug ; iOS uniquement sur macOS |
| `npm.cmd run db:generate`      | Génère explicitement le client Prisma                                |
| `npm.cmd run licenses`         | Inventorie les licences npm installées                               |
| `npm.cmd run test:tooling`     | Teste les garde-fous launcher, CI, OpenAPI et sécurité               |
| `npm.cmd run ci:validate`      | Vérifie permissions et SHA des workflows                             |
| `npm.cmd run security:scan`    | Scanne secrets, historique, fichiers et sources de paquets           |
| `npm.cmd run openapi:validate` | Valide sémantiquement le contrat OpenAPI de fondation                |

Sur macOS et Linux, utiliser `npm` à la place de `npm.cmd`.

## Réserves et limites après fusion de S0.3

- Le NDK Android autorisé `28.2.13676358` est installé et l’APK debug passe.
  Gradle a aussi installé automatiquement Build-Tools `36.0.0` et CMake
  `3.22.1` pendant le build ; leur conservation a été explicitement autorisée
  par le CTO, sans autoriser une autre modification du SDK.
- Les audits npm complet et production passent à zéro après quatre overrides
  transitifs exacts. La qualification est consignée dans
  [la preuve de remédiation](docs/security/SPRINT_0_3_SECURITY_REMEDIATION.md).
- Les chemins LGPL, MPL, EPL et CC-BY sont qualifiés, l’attribution CC-BY est
  versionnée et le gate juridique/licences est approuvé pour le périmètre
  verrouillé de S0.3. Toute future dépendance, distribution ou release exige
  une nouvelle évaluation, comme consigné dans
  [la revue des licences](docs/security/THIRD_PARTY_LICENSE_REVIEW_S0_3.md).
- Les quatre captures runtime Web/Admin sont versionnées et leur approbation
  Product Owner porte uniquement sur le shell de fondation S0.3, pas sur le
  design final de KORA+.
- Le build iOS est `NON EXÉCUTÉ` sous Windows.

## Référence AdminLTE

L’unique archive de référence est
`docs/source-material/references/adminlte/AdminLTE-master.zip`. Elle reste
non exécutable et ne doit jamais être extraite dans une application.

## Contribuer

Lire [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), le
[workflow Git](docs/governance/GIT_WORKFLOW.md) et la
[Definition of Done](docs/qa/DEFINITION_OF_DONE.md). Aucun lot ne commence sans
autorisation explicite du Product Owner dans la session active.
