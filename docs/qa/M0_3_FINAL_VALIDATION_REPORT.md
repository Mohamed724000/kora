# KORA+ — Rapport final de validation M0.3, R1 et R2

Date initiale : 2026-08-20
Réconciliation documentaire : 2026-09-02
Lot : M0.3 — remédiations supply-chain `deepmerge-ts` et `mysql2`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`
Branche : `chore/m0-3-deepmerge-ts-security-hotfix`
Head M0.3-R2 publié : `68027ed15948228ceef7277ad1fa0a47761751e2`

Statut : **M0.3-R2 publié sur la Draft PR #29 ; quatre workflows #43 réussis
sur le head exact ; réconciliation documentaire M0.3-R3 validée localement et
en attente d’une décision CTO de commit**.

## Chronologie publiée

1. M0.3 — `2a45184509081876ece99816d4c1a3b957ff1438` — correction ciblée
   `deepmerge-ts` ;
2. M0.3-R1 — `4a3bc1c4f481587826c92e759a833c43ca9e48e4` — durcissement du
   scanner et des tests de régression ;
3. M0.3-R2 — `68027ed15948228ceef7277ad1fa0a47761751e2` — correction ciblée
   `mysql2`, parent direct R1.

## Périmètre cumulatif publié

M0.3 a introduit l’override ciblé
`@prisma/config@7.9.1 > deepmerge-ts@8.0.1`. M0.3-R1 a durci le scanner
contre les variantes d’override et les graphes de lockfile non autorisés.
M0.3-R2 a ajouté l’override ciblé
`prisma@7.9.1 > mysql2@3.22.0`, sans changer Prisma. Les trois commits publiés
sur la PR #29 touchent toujours exactement huit fichiers :

1. `package.json` ;
2. `package-lock.json` ;
3. `scripts/security/scan-repository.mjs` ;
4. `scripts/security/scan-repository.test.mjs` ;
5. `docs/security/THIRD_PARTY_DEPENDENCY_REVIEW_M0_3.md` ;
6. `docs/qa/M0_3_FINAL_VALIDATION_REPORT.md` ;
7. `docs/governance/DECISION_LOG.md` ;
8. `docs/security/THREAT_MODEL.md`.

Aucun code applicatif, contrat OpenAPI, modèle métier Prisma, migration,
workflow, manifeste workspace, lockfile Flutter, infrastructure ou contenu
S1.1 n’est modifié. M0.3-R3 réconcilie localement uniquement les quatre
documents déjà présents dans cette liste ; il n’ajoute aucun fichier et n’est
pas encore commité ni publié.

## Résolution et déterminisme

Résolution initiale de M0.3 :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@7.1.5
```

Résolution finale publiée après M0.3-R2 :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@8.0.1 overridden
prisma@7.9.1 → mysql2@3.22.0 overridden → sql-escaper@1.5.1
```

- SHA-256 publié de `package-lock.json` :
  `2041E52ECFB25092FADC32EE207C84DED22E9805233CCEA38889170CD1D08742` ;
- SHA-256 inchangé de `apps/mobile/pubspec.lock` :
  `44C54ADEE80B74F8860D7CC87158FEDAD520F60DB0BD918D8D19BEF5A8326B7E`.

Deux `npm ci` successifs avec Node `22.18.0` et npm `10.9.3` ont installé
chacun 1 135 paquets. L’empreinte du lockfile est restée identique après les
deux installations, et les audits intégrés ont signalé zéro vulnérabilité.

Le diff cumulatif du lockfile remplace `deepmerge-ts@7.1.5` par `8.0.1`, puis
`mysql2@3.15.3` par `3.22.0`. Pour cette dernière transition, il ajoute
`sql-escaper@1.5.1` et retire `seq-queue@0.0.5` et `sqlstring@2.3.3`. Aucune
autre version, dépendance ou topologie sans rapport n’est modifiée. Les
métadonnées publiées de `@prisma/config@7.9.1` et `prisma@7.9.1` continuent
respectivement de déclarer `deepmerge-ts@7.1.5` et `mysql2@3.15.3` ; les deux
résolutions corrigées proviennent donc uniquement des overrides parents
exacts.

## Preuves finales reproductibles

Les résultats techniques ci-dessous sont les preuves cumulatives publiées de
M0.3, R1 et R2. Le micro-lot R3 ne les réexécute pas : il ne lance que les
contrôles documentaires explicitement autorisés.

| Contrôle                         | Résultat final publié                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| versions                         | PASS — Node `22.18.0`, npm `10.9.3`, Flutter `3.44.1`, Dart `3.12.1`                                                     |
| deux installations déterministes | PASS — 2 × 1 135 paquets, lockfile final stable                                                                          |
| `npm ls --all`                   | PASS — code 0, graphe complet valide                                                                                     |
| graphe `deepmerge-ts`            | PASS — une seule installation physique `8.0.1`, imposée uniquement sous `@prisma/config@7.9.1`                           |
| graphe `mysql2`                  | PASS — une seule installation physique `3.22.0`, imposée uniquement sous `prisma@7.9.1`                                  |
| famille Prisma                   | PASS — `prisma`, `@prisma/client` et `@prisma/config` restent en `7.9.1`                                                 |
| audits complet et production     | PASS — 0 vulnérabilité dans chaque audit                                                                                 |
| licences                         | PASS — 1 129 paquets, 0 licence absente, 0 licence non approuvée ; notices inchangées après contrôle                     |
| scanner ciblé                    | PASS — 49/49, avec cas positifs et négatifs pour les deux overrides et leurs parents exacts                              |
| tests d’outillage                | PASS — 56/56                                                                                                             |
| tests globaux                    | PASS — 61/61 : Web 10, Admin 13, API 22, contrats 1, config 1, UI 4, Flutter 10                                          |
| format, lint et typecheck        | PASS — workspaces npm et Flutter applicables                                                                             |
| builds npm                       | PASS — Web, Admin, API, contrats, config et UI                                                                           |
| APK Flutter debug                | PASS — build direct, 161 072 371 octets, SHA-256 `53E2D131738FB40A9A02D8B51898443782AF460B1D62E061C97279B2DD714501`      |
| OpenAPI                          | PASS — 2 chemins, 3 schémas, références résolues                                                                         |
| Prisma réel                      | PASS — chargement config, format, validate et deux generate                                                              |
| déterminisme Prisma              | PASS — deux générations identiques, empreinte agrégée `4DC00A32821A673C758F8EDF2DC8B2CAF0B959637740DA6AEB5C1015A5B32F69` |
| infrastructure et santé API      | PASS — contrôles S0.4/S0.6 applicables, pannes et récupérations bornées, aucune fuite de secret ou DSN                   |
| nettoyage runtime                | PASS — aucun processus build/API M0.3 résiduel                                                                           |
| `git diff --check`               | PASS — aucune erreur sur l’état R2 publié                                                                                |
| intégrité Git                    | PASS — chaîne de trois commits et huit fichiers contrôlée                                                                |

## Publication contrôlée

Les quatre workflows GitHub Actions portant le numéro d’exécution `43` sont
terminés avec `success` sur le head exact
`68027ed15948228ceef7277ad1fa0a47761751e2` :

| Workflow           | Run ID        | Conclusion |
| ------------------ | ------------- | ---------- |
| `Infrastructure`   | `33628257911` | `success`  |
| `Launcher Windows` | `33628257887` | `success`  |
| `Security`         | `33628257867` | `success`  |
| `Quality Linux`    | `33628257884` | `success`  |

La PR #29 est ouverte, Draft, non fusionnée et sans conflit. À l’état R2
publié, elle contient trois commits et huit fichiers.

## Incidents conservés

- `npm install --package-lock-only --ignore-scripts` n’a pas réévalué le nœud
  verrouillé et a laissé l’audit rouge ; aucun diff n’a été produit.
- Une installation npm complète a reconnu l’override mais a conservé le nœud
  physique `7.1.5`, marqué `invalid` ; cet état n’a pas été retenu.
- `npm update deepmerge-ts --package-lock-only --ignore-scripts`, sans force,
  a réévalué uniquement le nœud autorisé et ramené l’audit à zéro.
- La correction `mysql2` a modifié la topologie transitive attendue :
  `sql-escaper` a été ajouté et `seq-queue` ainsi que `sqlstring` ont été
  retirés. Ce changement du graphe est intentionnel et borné à
  `mysql2@3.22.0` ; il n’a pas été masqué comme une simple variation de
  métadonnées.
- L’empreinte du client Prisma avant la première génération n’existait pas car
  `node_modules/.prisma/client` n’était pas encore créé. Seules les deux
  générations successives existantes et identiques constituent la preuve.
- Le premier `npm run build` global a dépassé la fenêtre de 30 minutes de
  l’outil. Il a produit un APK ultérieurement, mais ce timeout n’est pas déclaré
  PASS. La preuve de remplacement est constituée des six builds npm ciblés
  réussis et d’un build Flutter direct réussi en 34,2 secondes. Les processus
  associés ont ensuite été contrôlés absents.
- La tentative initiale d’arrêt Gradle via le wrapper a échoué parce que
  `JAVA_HOME` n’était pas défini dans cette session. L’arrêt a été rejoué via
  le runtime Java Android Studio explicitement identifié : un daemon arrêté,
  code 0.

Aucun échec intermédiaire n’est déclaré PASS.

## Limites non fonctionnelles

- Les overrides sont temporaires et doivent être retirés dans un futur lot
  autorisé lorsqu’une version stable qualifiée de Prisma résoudra officiellement
  les deux dépendances corrigées.
- La qualification `deepmerge-ts` couvre les objets utilisés par la
  configuration Prisma et un graphe récursif borné. Un futur usage de `Map` ou
  de graphes complexes exige une nouvelle qualification.
- Gitleaks, le test Sentry avec DSN réel, le build iOS/macOS et l’inspection
  navigateur interactive restent `NON EXÉCUTÉS` pour les raisons consignées au
  Foundation Gate ; M0.3 ne prétend pas les remplacer.
- Les états du registre npm et des avis de sécurité sont temporels. Un futur
  lot doit refaire audit, licences et provenance avant toute nouvelle
  modification de dépendance ou release.

## Historique des revues techniques publiées

| Étape   | Objet                                                                                                 | Conclusion publiée                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| M0.3    | correction `deepmerge-ts`, compatibilité Prisma et preuves locales                                    | PASS après correction des findings initiaux                                                                                 |
| M0.3-R1 | parcours itératif et rejet des variantes globales, élargies, en plage ou rattachées à un autre parent | PASS — scanner 31/31 et outillage 38/38 à R1                                                                                |
| M0.3-R2 | correction `mysql2`, reproductibilité, audits, licences, gouvernance et périmètre                     | PASS — cumul porté à 49/49 et 56/56 ; publication au head `68027ed15948228ceef7277ad1fa0a47761751e2` et workflows #43 verts |

Les réserves non bloquantes des revues publiées sont conservées dans les
limites ci-dessus. Les trois revues documentaires indépendantes M0.3-R3 sont
consignées dans le compte rendu d’exécution local ; elles ne remplacent pas les
preuves techniques publiées.

## Préservation S1.1

Avant la création du worktree M0.3, les 39 fichiers S1.1 ont été inventoriés
avec taille et SHA-256. Au préflight M0.3-R3, les 39/39 fichiers sont encore
identiques octet par octet et leur empreinte agrégée reste
`8957cbf3ff27110af162f53c72e0c129860f0fcdfb8bfddab1ae3714a1d9c6dc`.
Le worktree original reste sur
`feat/s1-1-audio-contract-data-ux-gate` au HEAD
`a602fd38f32d018867c8a058deace0325b4a7c31`, avec index vide et lockfiles
inchangés. S1.1 reste suspendu et S1.2 n’est pas commencé.

## Rollback

Avant fusion, le rollback consiste à fermer la Draft PR sans fusion. Aucun
worktree ou branche ne doit être supprimé automatiquement. Après une éventuelle
fusion autorisée séparément, le rollback devrait être un revert du merge
commit, jamais une réécriture de l’historique.
