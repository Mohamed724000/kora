# KORA+ — Rapport de validation M0.3, R1, R2, R3, R4 et R5

Date initiale : 2026-08-20
Réconciliation documentaire R4 : 2026-09-03
Réconciliation documentaire R5 : 2026-09-04
Lot : M0.3 — remédiations supply-chain `deepmerge-ts`, `mysql2`, `fast-uri` et `qs`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`
Branche : `chore/m0-3-deepmerge-ts-security-hotfix`
Head publié de référence lors du contrôle local R5 (M0.3-R4) :
`205a4c2264cc99c065da81799ecfcc7f433e24d0`

Statut de la preuve prépublication datée du 2026-09-04 : **M0.3-R4 était publié
sur la Draft PR #29 avec quatre workflows #45 verts ; M0.3-R5 corrigeait et
validait localement le dernier écart du gate `deepmerge-ts` et réconciliait les
preuves publiées. Les métadonnées de publication R5 ne sont pas
auto-référencées dans ce rapport et font foi dans GitHub.**

## Chronologie cumulative

1. M0.3 — `2a45184509081876ece99816d4c1a3b957ff1438` — correction ciblée
   `deepmerge-ts` ;
2. M0.3-R1 — `4a3bc1c4f481587826c92e759a833c43ca9e48e4` — durcissement du
   scanner et des tests de régression ;
3. M0.3-R2 — `68027ed15948228ceef7277ad1fa0a47761751e2` — correction ciblée
   `mysql2`, parent direct R1 ;
4. M0.3-R3 — `4b5b914d213e3b3803affc15d0139fe898efcd0f` — réconciliation
   documentaire, parent direct R2 ;
5. M0.3-R4 — `205a4c2264cc99c065da81799ecfcc7f433e24d0` — remédiation des
   nouveaux avis `fast-uri`, `mysql2` et `qs`, parent direct R3 ;
6. M0.3-R5 — contrôle local prépublication du 2026-09-04 — exclusivité du
   parent de lock `deepmerge-ts` et réconciliation de l’état publié R4 ; les
   métadonnées de publication font foi dans GitHub.

## Périmètre cumulatif R4 et qualification prépublication R5

M0.3 a introduit l’override ciblé
`@prisma/config@7.9.1 > deepmerge-ts@8.0.1`. M0.3-R1 a durci le scanner
contre les variantes d’override et les graphes de lockfile non autorisés.
M0.3-R2 a ajouté l’override ciblé
`prisma@7.9.1 > mysql2@3.22.0`, sans changer Prisma. R3 a publié uniquement la
réconciliation des documents. R4 a remplacé la cible `mysql2` par `3.23.1` et
ajoute les overrides parents exacts nécessaires à `fast-uri@3.1.6` et
`qs@6.16.0`. Au contrôle local prépublication du 2026-09-04, les cinq commits
alors publiés sur la PR #29 et les changements R5 restaient limités aux mêmes
huit fichiers cumulatifs :

1. `package.json` ;
2. `package-lock.json` ;
3. `scripts/security/scan-repository.mjs` ;
4. `scripts/security/scan-repository.test.mjs` ;
5. `docs/security/THIRD_PARTY_DEPENDENCY_REVIEW_M0_3.md` ;
6. `docs/qa/M0_3_FINAL_VALIDATION_REPORT.md` ;
7. `docs/governance/DECISION_LOG.md` ;
8. `docs/security/THREAT_MODEL.md`.

Aucun code applicatif, contrat OpenAPI, modèle métier Prisma, migration,
workflow, manifeste workspace, lockfile, infrastructure ou contenu S1.1 n’est
modifié par R5. Lors de sa qualification locale préalable à publication, le
micro-lot R5 touchait uniquement le scanner, son fichier de tests et les quatre
documents M0.3 de cette liste, sans nouveau fichier.
`package.json`, `package-lock.json`, `apps/mobile/pubspec.lock` et
`THIRD_PARTY_NOTICES.md` restent inchangés depuis R4.

## Résolution et déterminisme

Résolution initiale de M0.3 :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@7.1.5
```

Résolution publiée après M0.3-R2 :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@8.0.1 overridden
prisma@7.9.1 → mysql2@3.22.0 overridden → sql-escaper@1.5.1
```

Résolution publiée après M0.3-R4 :

```text
@nestjs/cli@11.0.24 / @prisma/dev@0.24.17
  → ajv@8.18.0 → fast-uri@3.1.6 overridden
@nestjs/platform-express@11.1.28 → express@5.2.1
  → qs@6.16.0 overridden
  → body-parser@2.3.0 → qs@6.16.0 deduped
supertest@7.2.2 → superagent@10.3.0 → qs@6.16.0 deduped
prisma@7.9.1 → mysql2@3.23.1 overridden → sql-escaper@1.5.1
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@8.0.1 overridden
```

- SHA-256 publié R4 de `package-lock.json` :
  `E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044` ;
- SHA-256 inchangé de `apps/mobile/pubspec.lock` :
  `44C54ADEE80B74F8860D7CC87158FEDAD520F60DB0BD918D8D19BEF5A8326B7E`.

Deux `npm ci --ignore-scripts` successifs avec Node `22.18.0` et npm `10.9.3`
ont installé chacun 1 135 paquets. L’empreinte R4 du lockfile est restée
identique avant, entre et après les deux installations, et les audits intégrés
ont signalé zéro vulnérabilité.

Le diff cumulatif du lockfile remplace `deepmerge-ts@7.1.5` par `8.0.1`, puis
`mysql2@3.15.3` par `3.22.0`. Pour cette dernière transition, il ajoute
`sql-escaper@1.5.1` et retire `seq-queue@0.0.5` et `sqlstring@2.3.3`. Aucune
autre version, dépendance ou topologie sans rapport n’est modifiée. Les
métadonnées publiées de `@prisma/config@7.9.1` et `prisma@7.9.1` continuent
respectivement de déclarer `deepmerge-ts@7.1.5` et `mysql2@3.15.3` ; les deux
résolutions corrigées proviennent donc uniquement des overrides parents
exacts. R4 ne crée ni ne retire aucun paquet physique : il change uniquement
`fast-uri@3.1.5` en `3.1.6`, `mysql2@3.22.0` en `3.23.1` et `qs@6.15.3` en
`6.16.0`. La contrainte `sql-escaper` déclarée par `mysql2` passe de `^1.3.3` à
`^1.5.1`, mais la résolution physique reste `sql-escaper@1.5.1`. Il n’existe
aucun churn transitif sans rapport.

## Preuves R4 reproductibles et validation locale R5

Les résultats applicatifs et de dépendances ci-dessous sont les preuves locales
ayant qualifié R4 avant sa publication. R5 ne modifie ni manifestes, ni
lockfiles, ni dépendances, ni code applicatif ; il rejoue seulement les
contrôles ciblés par son gate et conserve les preuves historiques antérieures.

| Contrôle                         | Résultat applicable                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| versions                         | PASS — Node `22.18.0`, npm `10.9.3`, Flutter `3.44.1`, Dart `3.12.1`                                                                    |
| deux installations déterministes | PASS — 2 × 1 135 paquets, lockfile final stable                                                                                         |
| `npm ls --all`                   | PASS — code 0, graphe complet valide                                                                                                    |
| graphe `deepmerge-ts`            | PASS — une seule installation physique `8.0.1`, imposée uniquement sous `@prisma/config@7.9.1`                                          |
| graphe `fast-uri`                | PASS — une seule installation physique `3.1.6`, imposée uniquement sous `ajv@8.18.0`                                                    |
| graphe `mysql2`                  | PASS — une seule installation physique `3.23.1`, imposée uniquement sous `prisma@7.9.1`                                                 |
| graphe `qs`                      | PASS — une seule installation physique `6.16.0`, imposée sous les trois parents réels et exacts                                         |
| famille Prisma                   | PASS — `prisma`, `@prisma/client` et `@prisma/config` restent en `7.9.1`                                                                |
| audits complet et production     | PASS — 0 vulnérabilité dans chaque audit                                                                                                |
| licences                         | PASS — 1 129 paquets, 0 licence absente, 0 licence non approuvée ; notices inchangées après contrôle                                    |
| scanner ciblé                    | PASS R5 — 66/66 : 65 tests R4 conservés et 1 test paramétré sur les quatre sections de dépendances                                      |
| tests d’outillage                | PASS R5 — 73/73                                                                                                                         |
| tests globaux                    | PASS — 61/61 : Web 10, Admin 13, API 22, contrats 1, config 1, UI 4, Flutter 10                                                         |
| format, lint et typecheck        | PASS — workspaces npm et Flutter applicables                                                                                            |
| builds npm                       | PASS — Web, Admin, API, contrats, config et UI                                                                                          |
| APK Flutter debug                | PASS — build direct, 161 072 371 octets, SHA-256 `53E2D131738FB40A9A02D8B51898443782AF460B1D62E061C97279B2DD714501`                     |
| analyse Flutter                  | PASS — aucun problème                                                                                                                   |
| OpenAPI                          | PASS — 2 chemins, 3 schémas, références résolues                                                                                        |
| Prisma réel                      | PASS — chargement config, format, validate et deux generate                                                                             |
| déterminisme Prisma              | PASS — deux générations de 16 fichiers identiques, empreinte agrégée `CE05EF02BD41633B1594EA7964A7962A6BB4E07FA8CB890FF342075BF9CF74E5` |
| infrastructure et santé API      | PASS — contrôles S0.4/S0.6 applicables, pannes et récupérations bornées, aucune fuite de secret ou DSN                                  |
| nettoyage runtime                | PASS — aucun processus build/API M0.3 résiduel                                                                                          |
| `git diff --check`               | PASS — aucune erreur lors du contrôle local prépublication R5                                                                           |
| intégrité Git                    | PASS prépublication R5 — baseline R4 `205a4c2264cc99c065da81799ecfcc7f433e24d0`, index vide et six fichiers autorisés uniquement        |

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

Après publication documentaire R3, les workflows #44 portent tous le head
exact `4b5b914d213e3b3803affc15d0139fe898efcd0f` :

| Workflow           | Run ID        | Conclusion |
| ------------------ | ------------- | ---------- |
| `Infrastructure`   | `33742418411` | `success`  |
| `Launcher Windows` | `33742418467` | `success`  |
| `Security`         | `33742418430` | `failure`  |
| `Quality Linux`    | `33742418403` | `success`  |

Security #44 échoue uniquement à l’étape d’audit npm : 11 nœuds vulnérables,
répartis en 7 high et 4 moderate. Les étapes suivantes du job sont sautées par
arrêt immédiat ; aucune autre défaillance de workflow n’est observée. Cet état
reste une preuve historique : R4 en a traité la cause, puis les quatre nouveaux
workflows #45 ont tous réussi sur le head publié
`205a4c2264cc99c065da81799ecfcc7f433e24d0` :

| Workflow           | Run ID        | Conclusion |
| ------------------ | ------------- | ---------- |
| `Infrastructure`   | `33755877761` | `success`  |
| `Launcher Windows` | `33755877765` | `success`  |
| `Security`         | `33755877754` | `success`  |
| `Quality Linux`    | `33755877780` | `success`  |

Lors du contrôle local préalable à la publication R5, la PR #29 était ouverte,
Draft, non fusionnée et sans conflit. Au head R4 publié, elle contenait cinq
commits et huit fichiers, et sa description présentait l’état cumulatif jusqu’à
R4. Cette observation est une preuve historique ; les métadonnées de
publication R5 font foi dans GitHub et ne sont pas auto-référencées ici.

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
- À R4, `npm install --package-lock-only --ignore-scripts` puis
  `npm install --ignore-scripts` ont reconnu les nouveaux overrides mais n’ont
  pas réévalué les nœuds verrouillés. Les commandes ciblées `npm update`
  limitées à `fast-uri`, `mysql2` et `qs`, sans `audit fix` ni force, ont produit
  le lockfile retenu ; les deux `npm ci --ignore-scripts` suivants l’ont
  reproduit strictement.
- Une première exécution des tests sous sandbox a été refusée lors de la
  création du cache Vite (`EPERM`). Elle n’est pas déclarée PASS ; la même
  suite, relancée sans sandbox dans le worktree autorisé, a réussi 61/61.
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
  ses dépendances corrigées, et lorsque les autres parents auront intégré leurs
  versions corrigées sans override.
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
| M0.3-R3 | réconciliation des quatre documents vivants sans changement technique                                 | PASS — publication au head `4b5b914d213e3b3803affc15d0139fe898efcd0f`                                                       |
| M0.3-R4 | nouveaux avis `fast-uri`, `mysql2` et `qs`, gates, reproductibilité et documentation                  | PASS — publication au head `205a4c2264cc99c065da81799ecfcc7f433e24d0` et quatre workflows #45 verts                         |
| M0.3-R5 | parent de lock exclusif `deepmerge-ts` et réconciliation des preuves publiées R4                      | PASS prépublication du 2026-09-04 — scanner 66/66 et outillage 73/73                                                        |

Les réserves non bloquantes des revues publiées sont conservées dans les
limites ci-dessus. Les conclusions des revues indépendantes R4 ont été
réconciliées avant sa publication. Les revues R5 consignées ici constituent les
preuves locales historiques ayant précédé la décision de publication ; leur
conclusion technique reste applicable.

## Préservation S1.1

Avant la création du worktree M0.3, les 39 fichiers S1.1 ont été inventoriés
avec taille et SHA-256. Au préflight R5, les 39/39 fichiers sont encore
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
