# KORA+ — Rapport final de validation M0.3

Date : 2026-08-20
Lot : M0.3 — remédiation supply-chain `deepmerge-ts`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`
Branche : `chore/m0-3-deepmerge-ts-security-hotfix`

Statut : **validation locale et trois revues indépendantes réussies — quatre
workflows du head publié encore requis avant revue CTO**.

Le commit qui contient ce rapport ne peut pas s’auto-référencer. Le head exact
et les identifiants des workflows sont donc portés par la Draft PR et par le
compte rendu d’exécution.

## Périmètre candidat

- override ciblé `@prisma/config@7.9.1 > deepmerge-ts@8.0.1` ;
- lockfile npm régénéré avec Node `22.18.0` et npm `10.9.3` ;
- scanner supply-chain et tests positifs/négatifs ;
- revue tierce M0.3, Decision Log, Threat Model et présent rapport.

Le diff candidat contient exactement huit fichiers autorisés :

1. `package.json` ;
2. `package-lock.json` ;
3. `scripts/security/scan-repository.mjs` ;
4. `scripts/security/scan-repository.test.mjs` ;
5. `docs/security/THIRD_PARTY_DEPENDENCY_REVIEW_M0_3.md` ;
6. `docs/qa/M0_3_FINAL_VALIDATION_REPORT.md` ;
7. `docs/governance/DECISION_LOG.md` ;
8. `docs/security/THREAT_MODEL.md`.

Aucun code applicatif, OpenAPI, modèle métier Prisma, migration, workflow,
manifest workspace, lockfile Flutter, infrastructure ou contenu S1.1 n’est
modifié. `DECISION_LOG.md` et `THREAT_MODEL.md` sont des chemins vivants
communs aux deux worktrees, mais leurs hunks M0.3 sont autonomes et les copies
locales S1.1 restent identiques octet par octet.

## Résolution et déterminisme

Résolution initiale :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@7.1.5
```

Résolution finale :

```text
prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@8.0.1 overridden
```

- SHA-256 initial de `package-lock.json` :
  `54448CA65A03D32F590733D9F6C4E189E9A6455884EFB46923850F9060672492` ;
- SHA-256 final de `package-lock.json` :
  `108E02A505CA331DFAEFD08EF61249A5162F89A77124DCD6260DB7C9187D7EA4` ;
- SHA-256 inchangé de `apps/mobile/pubspec.lock` :
  `44C54ADEE80B74F8860D7CC87158FEDAD520F60DB0BD918D8D19BEF5A8326B7E`.

Deux `npm ci` successifs ont installé chacun 1 136 paquets avec un audit
intégré à zéro. Le SHA-256 npm est resté identique après chacune des deux
installations. Le lockfile Flutter est également resté identique après
`flutter pub get`.

Le diff lockfile remplace uniquement le nœud physique racine
`node_modules/deepmerge-ts@7.1.5` par `8.0.1`, avec son URL, son intégrité et
ses deux métadonnées de financement. Aucun paquet n’est ajouté ou supprimé et
aucune autre version ni topologie ne change.

## Résultats locaux

| Contrôle                         | Résultat                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| versions                         | PASS — Node `22.18.0`, npm `10.9.3`, Flutter `3.44.1`, Dart `3.12.1`                                                                                      |
| registre npm et avis GitHub      | PASS — `8.0.1`, BSD-3-Clause, non déprécié, provenance/signatures présentes, correctif déclaré à partir de `8.0.0`                                        |
| deux installations déterministes | PASS — 2 × 1 136 paquets, empreinte finale stable                                                                                                         |
| `npm ls --all`                   | PASS — code 0                                                                                                                                             |
| graphe `deepmerge-ts`            | PASS — une seule installation physique `8.0.1` sous `@prisma/config@7.9.1`                                                                                |
| famille Prisma                   | PASS — `prisma`, `@prisma/client` et `@prisma/config` restent en `7.9.1`                                                                                  |
| audits complet et production     | PASS — 0 vulnérabilité chacun                                                                                                                             |
| licences                         | PASS — 1 130 paquets, 0 licence absente, 0 non approuvée                                                                                                  |
| scanner dépôt et historique      | PASS — 311 fichiers, manifeste immuable 52/52, 5 scripts qualifiés                                                                                        |
| tests scanner ciblés             | PASS — 25/25, dont fixtures vulnérable/corrigée, installation imbriquée, plage, sélecteurs globaux/parallèles, changement Prisma et graphe récursif isolé |
| tests d’outillage                | PASS — 32/32                                                                                                                                              |
| format global                    | PASS — npm et 15 fichiers Flutter, 0 diff généré                                                                                                          |
| lint global                      | PASS — tous workspaces ; Flutter `analyze`, 0 problème                                                                                                    |
| typecheck global                 | PASS — tous workspaces et Flutter                                                                                                                         |
| tests globaux                    | PASS — 61 tests : Web 10, Admin 13, API 22, contrats 1, config 1, UI 4, Flutter 10                                                                        |
| test API historique              | PASS — 5 exécutions indépendantes, chacune 9/9                                                                                                            |
| builds npm                       | PASS — Web, Admin, API, contrats, config et UI, code 0                                                                                                    |
| APK Flutter debug                | PASS — build direct, code 0, 161 072 371 octets, SHA-256 `53E2D131738FB40A9A02D8B51898443782AF460B1D62E061C97279B2DD714501`                               |
| OpenAPI                          | PASS — 2 chemins, 3 schémas, références résolues                                                                                                          |
| validation CI                    | PASS — 4 workflows, 4 actions approuvées et épinglées                                                                                                     |
| launcher                         | PASS — le code enfant contrôlé `23` est correctement propagé comme échec                                                                                  |
| Prisma réel                      | PASS — chargement config, format, validate et deux generate                                                                                               |
| déterminisme Prisma              | PASS — deux générations identiques, empreinte agrégée `4DC00A32821A673C758F8EDF2DC8B2CAF0B959637740DA6AEB5C1015A5B32F69`                                  |
| infrastructure                   | PASS — images verrouillées, sécurité Compose, santé, persistance, reset ciblé et idempotence                                                              |
| santé API                        | PASS — live/ready, 3 pannes Redis, 3 pannes PostgreSQL, récupérations et reset, même PID API, aucune fuite de secret ou DSN                               |
| nettoyage runtime                | PASS — pile et réseau KORA+ arrêtés, volumes conservés, aucun processus build/API M0.3 résiduel                                                           |
| `git diff --check`               | PASS — aucune erreur                                                                                                                                      |
| `git fsck --full`                | PASS — aucune corruption ; uniquement des objets historiques non référencés                                                                               |

## Incidents conservés

- `npm install --package-lock-only --ignore-scripts` n’a pas réévalué le nœud
  verrouillé et a laissé l’audit rouge ; aucun diff n’a été produit.
- Une installation npm complète a reconnu l’override mais a conservé le nœud
  physique `7.1.5`, marqué `invalid` ; cet état n’a pas été retenu.
- `npm update deepmerge-ts --package-lock-only --ignore-scripts`, sans force,
  a réévalué uniquement le nœud autorisé et ramené l’audit à zéro.
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

## Revues indépendantes

| Revue                         | Verdict final | Résultat                                                                                                                                                                                                                            |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| supply-chain et compatibilité | PASS          | Override, registre, avis, graphe, lockfile, audits, licences et compatibilité v8 vérifiés. Le finding initial sur trois sélecteurs parallèles non bloqués a été corrigé ; scanner 25/25, outillage 32/32 et nouvelle revue réussis. |
| Prisma/API et non-régression  | PASS          | Famille Prisma 7.9.1, configuration réelle, schéma, API 22/22, OpenAPI et absence de diff applicatif/métier vérifiés après le durcissement.                                                                                         |
| intégrité Git et périmètre    | PASS          | Huit fichiers exacts, index vide, 0/0 face à `origin/main`, aucun état Git transitoire et 39/39 fichiers S1.1 inchangés. Le statut S0.6 obsolète trouvé lors de la première lecture a été réconcilié puis revérifié.                |

Réserves non bloquantes des reviewers : le test récursif versionné couvre un
graphe auto-référencé unique, tandis que le scénario exact à deux graphes de
l’avis a été vérifié séparément en lecture seule ; une future utilisation de
`Map` ou d’autres structures complexes exigera une nouvelle qualification ;
les ajouts S1.1 aux deux documents vivants devront être réconciliés avec les
hunks M0.3 lors de la reprise autorisée de S1.1.

## Publication

Les identifiants des quatre workflows GitHub (`Security`, `Quality Linux`,
`Infrastructure`, `Launcher Windows`) ne seront connus qu’après publication du
head final. Toute exécution non terminée avec succès reste non validée.

## Préservation S1.1

Avant la création du worktree M0.3, les 39 fichiers S1.1 ont été inventoriés
avec taille et SHA-256. Ils ont été revérifiés identiques immédiatement après
création puis une troisième fois après toutes les validations locales : 39/39
fichiers sont identiques octet par octet. Le worktree original reste sur
`feat/s1-1-audio-contract-data-ux-gate` au HEAD
`a602fd38f32d018867c8a058deace0325b4a7c31`, avec index vide et lockfiles
inchangés. S1.1 reste suspendu et S1.2 n’est pas commencé.

## Rollback

Avant fusion, le rollback consiste à fermer la Draft PR sans fusion. Aucun
worktree ou branche ne doit être supprimé automatiquement. Après une éventuelle
fusion autorisée séparément, le rollback devrait être un revert du merge
commit, jamais une réécriture de l’historique.
