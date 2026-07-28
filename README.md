# KORA+ Final

KORA+ Final est la clean room de production du produit KORA+. Le repository
contient la baseline documentaire et le contrat technique minimal du monorepo.
Aucune application ni aucun package métier n’est initialisé par Sprint 0.2.

## État actuel

- Gate 0 et Lots 00, 00B et 00C : terminés.
- Sprint 0.1 : terminé ; baseline unique publiée sur `main`.
- Sprint 0.2 : contrat monorepo implémenté, en attente de revue CTO.
- Sprint 0.3 et lots applicatifs : non commencés.
- Docker : contrôle différé à S0.4.

Un lot ne peut commencer qu’après autorisation explicite du Product Owner dans
la session active. La présence d’un ancien prompt ne constitue pas une
autorisation.

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

## Contrat technique de Sprint 0.2

- Node.js : `22.18.0`.
- npm : `10.9.3`.
- Package racine : privé, version `0.0.0`, sans dépendance.
- Workspaces npm : `apps/web`, `apps/admin`, `apps/api`,
  `packages/contracts`, `packages/config` et `packages/ui`.
- `apps/mobile` reste hors des npm workspaces conformément à l’ADR-009.

Sous Windows, les commandes disponibles sont :

| Commande | Effet actuel |
|---|---|
| `npm.cmd run env:check` | Vérifie strictement les versions Node et npm |
| `npm.cmd run format` | Déclare le contrôle non exécuté tant qu’aucun package applicatif n’existe |
| `npm.cmd run lint` | Déclare le contrôle non exécuté tant qu’aucun package applicatif n’existe |
| `npm.cmd run typecheck` | Déclare le contrôle non exécuté tant qu’aucun package applicatif n’existe |
| `npm.cmd test` | Déclare le contrôle non exécuté tant qu’aucun package applicatif n’existe |
| `npm.cmd run build` | Déclare le contrôle non exécuté tant qu’aucun package applicatif n’existe |

Sur macOS et Linux, utiliser `npm` à la place de `npm.cmd`. Ces commandes ne
prétendent pas valider une application inexistante ; elles seront raccordées
aux packages réels dans un lot ultérieur explicitement autorisé.

## Référence AdminLTE

L’unique archive de référence est
`docs/source-material/references/adminlte/AdminLTE-master.zip`. Elle reste
non exécutable et ne doit jamais être extraite dans une application.

## Contribuer

Lire [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), le
[workflow Git](docs/governance/GIT_WORKFLOW.md) et la
[Definition of Done](docs/qa/DEFINITION_OF_DONE.md). N’initialiser aucune
application et n’ajouter aucune dépendance sans autorisation explicite du lot
correspondant.
