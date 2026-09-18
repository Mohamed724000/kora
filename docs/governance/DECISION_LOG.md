# KORA+ Final — Decision Log

Ce journal conserve les décisions acceptées et distingue leur nature. Les
instructions d’exécution historiques restent traçables mais non exécutables.

## 2026-07-25 — Clôture de spécification

Owner : Mohamed Sogoba
Autorité technique : ChatGPT Work
Statut : **Accepted**

- Le Cahier des charges V4 reste l’autorité produit.
- Les ADR acceptés corrigent les spécifications d’ingénierie, mobile et
  back-office de rang inférieur.
- La billetterie sort du MVP et passe en V2.
- L’identité MVP est le téléphone vérifié ; e-mail facultatif et aucun social
  login.
- Les invités atteignent Home ; l’authentification intervient sur action
  protégée.
- Seule l’administration publie des contenus au MVP.
- `artistRevenueShareBps=2000` signifie une part artiste de 20 %.
- La base artiste d’une vente est le revenu éligible réglé après taxes et
  remboursements ; les frais fournisseur restent un coût plateforme.
- « Soutenir l’artiste » transfère le net collecté sans commission KORA+
  supplémentaire au MVP.
- Une Order accepte plusieurs PaymentAttempts immuables.
- Toute correction financière utilise des écritures compensatoires équilibrées.
- Un remboursement total ciblé révoque le droit correspondant, compense vente
  et revenu, et baisse la dépense nette sans déclasser le palier atteint.
- Les previews anonymes existent uniquement dans l’application mobile.
- Les URLs sources média restent privées ; seuls des descriptors signés courts
  sont transmis.
- Publication éditoriale et processing média sont deux états distincts.
- Un contenu archivé reste accessible à ses acheteurs.
- Les webhooks sont durablement enregistrés avant acquittement.
- Les audits critiques sont transactionnels et append-only en base.
- L’offline utilise chiffrement lié à l’appareil et licences renouvelables.
- Favoris et playlists simples restent avant bêta ; avis et notes passent en V2.
- Le back-office est clair uniquement au MVP.
- Le support est masqué/read-only et ne peut muter finance, sécurité ou contenu.
- Le benchmark comprend 16 captures.
- Les paiements réels restent bloqués par contrats, stores et revue légale.

## Corpus des 40 arbitrages préservés

Les entrées `REG-01` à `REG-40` du
[Specification Alignment Register](SPEC_ALIGNMENT_REGISTER.md) sont des
décisions existantes, pas de nouvelles décisions S0.1. Elles restent toutes
fermées.

| IDs             | Objet                                                                                                   | Statut        |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| REG-01 à REG-09 | Dépendances AdminLTE, sécurité/session admin, dashboard, audit, contrats et configuration               | Accepted      |
| REG-10 à REG-16 | Terminologie, performance/tests, sessions, artiste, guest-first et identité                             | Accepted      |
| REG-17          | Billetterie                                                                                             | Deferred V2   |
| REG-18 à REG-29 | Paiements, ledger, revenus, preview, média, archive, webhooks, sessions, audit, offline et bibliothèque | Accepted      |
| REG-30          | Avis et notes                                                                                           | Deferred V2   |
| REG-31 à REG-39 | Notifications, checkout, thème, RBAC, flows, benchmark, revenus, remboursements et capture              | Accepted      |
| REG-40          | Paiements réels et distribution                                                                         | Contract gate |

La décision détaillée, la justification, l’impact, les sources, les ADR et la
date de chaque ID sont conservés dans le registre canonique.

## 2026-07-25 — Ancienne autorisation d’exécution

Statut : **Historique — non exécutable**

- L’ancien Sprint 0B Architecture Alignment and Foundation Repair avait été
  autorisé.
- L’ancien travail de repository devait être préservé et audité.
- Des échecs Flutter historiques pouvaient être réparés.
- Les comportements paiement, ledger, offline et publication média restaient
  interdits avant validation des contrats.

Ces quatre décisions d’exécution sont remplacées par
`CLEAN_ROOM_SCOPE.md` et le Master Execution Blueprint du 2026-07-28. Elles ne
créent aucune tâche dans `KORA-PLUS-FINAL`.

## 2026-07-28 — Gouvernance S0.1

| ID          | Nature      | Décision                                                                                                                            | Autorité                        | Statut   |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------- |
| DEC-S0.1-01 | Technique   | La seule implémentation active est une clean room ; aucun ancien code n’est réutilisable.                                           | ChatGPT Work / Clean-room Scope | Accepted |
| DEC-S0.1-02 | Technique   | La racine unique est `KORA-PLUS-FINAL`.                                                                                             | ChatGPT Work / Product Owner    | Accepted |
| DEC-S0.1-03 | Technique   | Baseline : Git disponible, Node 22.18.0, npm 10.9.3, Flutter 3.44.1 et Dart 3.12.1.                                                 | Master Blueprint                | Accepted |
| DEC-S0.1-04 | Technique   | Git est initialisé localement uniquement dans la racine validée.                                                                    | Product Owner                   | Accepted |
| DEC-S0.1-05 | Technique   | La branche stable initiale est `main`.                                                                                              | Product Owner                   | Accepted |
| DEC-S0.1-06 | Technique   | Le premier commit local S0.1 est l’unique exception de bootstrap, uniquement avec identité Git préexistante et contrôles conformes. | Product Owner                   | Accepted |
| DEC-S0.1-07 | Réservée PO | Aucun remote, push, tag ou compte GitHub n’est créé sans nouvelle autorisation.                                                     | Product Owner                   | Accepted |
| DEC-S0.1-08 | Technique   | Docker demeure `BLOCKER FOR SPRINT 0.4 — NOT BLOCKING SPRINT 0.1`.                                                                  | Master Blueprint / Lot 00B      | Accepted |

## 2026-08-12 — Exécution technique S0.5

| ID          | Nature    | Décision                                                                                                    | Autorité                                    | Statut   |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| DEC-S0.5-01 | Technique | S0.4 est la baseline fusionnée exacte `8c3e65e2bcbffb53050b61cab4b953f108491db1`.                           | Décision CTO S0.5                           | Accepted |
| DEC-S0.5-02 | Technique | Les workflows restent en lecture seule, épinglent les actions par SHA et ne déploient rien.                 | Décision CTO S0.5                           | Accepted |
| DEC-S0.5-03 | Sécurité  | Sentry reste inactif sans DSN, sans PII, logs, traces, replay ou source maps.                               | Décision CTO S0.5 / Engineering `1.13-1.14` | Accepted |
| DEC-S0.5-04 | Contrat   | OpenAPI reste limité aux deux routes de santé avant Slice 1.                                                | ADR-009 / Décision CTO S0.5                 | Accepted |
| DEC-S0.5-05 | Exécution | La publication s’arrête à une Draft PR ; Ready, merge, tag, release, déploiement et S0.6 restent interdits. | Décision CTO S0.5                           | Accepted |

Ces décisions n’ajoutent aucune décision produit, financière, juridique ou de
sécurité métier.

## 2026-08-13 — Gouvernance des dépendances M0.1

| ID          | Nature         | Décision                                                                                                                                                                | Autorité                         | Statut   |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| DEC-M0.1-01 | Maintenance    | Les PR Dependabot #7 à #12 sont fermées sans fusion, avec une trace factuelle et sans suppression manuelle de branche.                                                  | Décision CTO M0.1                | Accepted |
| DEC-M0.1-02 | Dépendances    | Seuls `@types/react@19.2.18`, `flutter_riverpod@3.4.2` et `riverpod@3.4.2` sont réappliqués.                                                                            | Décision CTO M0.1                | Accepted |
| DEC-M0.1-03 | Dépendances    | `apexcharts@4.7.0`, `typescript-eslint@8.65.0`, la famille NestJS `11.1.28` et `bullmq@5.81.2` restent verrouillés.                                                     | Décision CTO M0.1                | Accepted |
| DEC-M0.1-04 | Sécurité       | Toute dépendance directe externe utilise une version SemVer exacte et les spécifications manifestes/lock npm doivent être identiques byte-for-byte.                     | Décision CTO M0.1                | Accepted |
| DEC-M0.1-05 | Automatisation | Les version updates Dependabot sont limitées aux dépendances directes patch/minor ; les security updates restent actives et aucune fusion automatique n'est configurée. | Décision CTO M0.1                | Accepted |
| DEC-M0.1-06 | Automatisation | `versioning-strategy: increase` reste désactivé faute de garantie sur les pins exacts ; le scanner de dépôt est le gate bloquant.                                       | Décision CTO M0.1 / preuve PR #9 | Accepted |

**DEC-M0.1-07 — Sécurité — Accepted.** Les pins workspace exacts de
`@types/react` sont unanimes et le lockfile contient une seule installation
physique racine à la même version. Autorité : décision CTO M0.1-R1.

M0.1 est un gate de maintenance pré-S0.6. Il ne démarre ni S0.6 ni Slice 1.

## 2026-08-13 — Hotfix supply-chain M0.2

| ID          | Nature         | Décision                                                                                                                                                                     | Autorité                            | Statut   |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------- |
| DEC-M0.2-01 | Sécurité       | L'override racine `nanoid` passe de `3.3.17` à la première version 3.x corrigée `3.3.18` pour fermer `GHSA-2v37-7h3g-55p8`, sans modifier `postcss@8.5.24`.                  | Décision CTO M0.2 / GitHub Advisory | Accepted |
| DEC-M0.2-02 | Automatisation | Les règles `allow` npm et Pub exigent explicitement `dependency-type: direct` ainsi que patch/minor ; un gate local et ses tests négatifs rendent cette politique bloquante. | Décision CTO M0.2 / preuve PR #14   | Accepted |
| DEC-M0.2-03 | Maintenance    | Les PR Dependabot #14 à #21 sont fermées sans fusion avec une trace factuelle propre et sans commande de suppression manuelle de branche.                                    | Décisions CTO M0.2 et M0.2-R1       | Accepted |
| DEC-M0.2-04 | Périmètre      | M0.2 reste un hotfix supply-chain : aucune mise à jour courante reportée, fonctionnalité, release, balise, opération de déploiement, S0.6 ou Slice 1 n'est autorisée.        | Décision CTO M0.2                   | Accepted |

La mise à jour postérieure de la fiche GitHub explique que les audits M0.1
étaient à zéro avant que la branche Nano ID 3.x ne soit intégrée à la plage
affectée. La revue M0.2 conserve cette chronologie sans réécrire M0.1.
Les PR #14, #17, #18, #19 et #20 étaient des propositions transitives générées
avant l'application de la politique direct-only. Les PR #15, #16 et #21
étaient des mises à jour directes courantes reportées hors du hotfix. #20 et
#21 avaient été ouvertes avant la publication de la Draft PR #22 et utilisaient
encore la configuration présente sur `main`.

Après fermeture, Dependabot a supprimé automatiquement les références
distantes #14 à #18 et #21 constatées absentes avant le commit R1. Les
références #19 et #20 existaient encore au constat final pré-commit. Aucune
suppression manuelle, recréation de branche ni modification de paramètre GitHub
n'a été effectuée par l'orchestrateur.

## 2026-08-14 — Foundation Gate S0.6

| ID          | Nature      | Décision                                                                                                                                                                                                                                 | Autorité                     | Statut                           |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- |
| DEC-S0.6-01 | Traçabilité | S0.4, S0.5, M0.1 et M0.2 sont fusionnés aux SHA exacts `8c3e65e2bcbffb53050b61cab4b953f108491db1`, `c080ec0529e758203d4326f7ec5b0b0159cbdad7`, `79ceddc6cbf04b3d213001417da0841044af8206` et `40a224edc1dc018a080b6c188a804e361e96b5ef`. | Décision CTO S0.6            | Accepted                         |
| DEC-S0.6-02 | Exécution   | La baseline immuable du gate est le merge M0.2 `40a224edc1dc018a080b6c188a804e361e96b5ef`; S0.6 audite et documente sans corriger ni modifier de fichier technique.                                                                      | Décision CTO S0.6            | Accepted                         |
| DEC-S0.6-03 | Qualité     | Les gates locaux applicables QA, infrastructure, sécurité et design passent ; le verdict est `PASS WITH RESERVATIONS` et reste soumis à la revue CTO et aux quatre checks de la Draft PR.                                                | Décision CTO S0.6            | Executed — closed by DEC-S0.6-06 |
| DEC-S0.6-04 | Réserves    | iOS/macOS, Gitleaks, Sentry réel et l’inspection navigateur interactive sont non exécutés ; Dependabot Alerts/security updates et Code Scanning ne sont pas actifs/configurés sur GitHub. Aucun de ces écarts n’est corrigé dans S0.6.   | Décision CTO S0.6            | Open external/platform limits    |
| DEC-S0.6-05 | Périmètre   | Les 68 exigences produit restent `Not started` / `Not verified`; aucune sécurité métier, route, modèle Prisma, migration ou fonctionnalité Slice 1 n’est déclarée implémentée.                                                           | Décision CTO S0.6            | Accepted                         |
| DEC-S0.6-06 | Clôture     | Sur décision CTO ultérieure, la PR #28 a été fusionnée par merge commit `a602fd38f32d018867c8a058deace0325b4a7c31`, avec parents `40a224edc1dc018a080b6c188a804e361e96b5ef` et `1900e10d4f5c8b7528601d5dfc46b4e7d1fe5cb4`.               | Décision CTO de clôture S0.6 | Accepted — S0.6 closed           |

À la date du gate, S0.6 validait uniquement les fondations et la Draft PR devait
rester Draft. La décision CTO de clôture ultérieure a autorisé exclusivement
Ready et le merge commit ci-dessus. Elle n’a autorisé ni tag, release,
déploiement, suppression de branche, ni démarrage de Slice 1.

## 2026-08-15 — Slice 1 / S1.1 Audio Pilot Contract, Data & Experience Gate

| ID          | Nature      | Décision                                                                                                                                                                                                                         | Autorité          | Statut                           |
| ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------- |
| DEC-S1.1-01 | Contrat     | OpenAPI est la source unique des 29 chemins et 35 opérations du pilote audio ; les types partagés sont générés seulement après validation et un contrôle de dérive est bloquant.                                                 | Décision CTO S1.1 | Proposed — historical S1.1 draft |
| DEC-S1.1-02 | Données     | Le schéma Prisma est une cible de conception sans migration, seed, mutation de base ni prétention d’application runtime.                                                                                                         | Décision CTO S1.1 | Proposed — historical S1.1 draft |
| DEC-S1.1-03 | Finance     | FCFA et points de base sont des entiers, la devise cible est XOF ; les relations composites lient Order, tentative, événement réussi, Settlement, ligne et Entitlement ; le reste est une précondition transactionnelle runtime. | ADR-012 à ADR-016 | Proposed — historical S1.1 draft |
| DEC-S1.1-04 | Média       | Processing et publication sont indépendants ; publication exige master audio et cover READY à leurs versions exactes ; les capabilities sont courtes, non persistables et non journalisables.                                    | ADR-011/017       | Proposed — historical S1.1 draft |
| DEC-S1.1-05 | Expérience  | Le mobile reste guest-first, sombre et à cinq onglets ; le mini-lecteur exige un média actif ; le Web public ne lit, ne preview ni ne transige.                                                                                  | ADR-010/017       | Proposed — historical S1.1 draft |
| DEC-S1.1-06 | Paiement    | S1.1 ne présente que `SANDBOX_NEUTRAL` et ne contracte, intègre ou simule aucun fournisseur de production.                                                                                                                       | Décision CTO S1.1 | Proposed — historical S1.1 draft |
| DEC-S1.1-07 | Design      | Les primitives Flutter et administration sont réelles et testées ; les fixtures restent confinées aux tests et goldens, jamais au runtime.                                                                                       | Décision CTO S1.1 | Proposed — historical S1.1 draft |
| DEC-S1.1-08 | Publication | Le lot s’arrête à une Draft PR ; aucune route métier, migration, Ready, fusion, release, déploiement ou S1.2 n’est autorisé.                                                                                                     | Décision CTO S1.1 | Proposed — historical S1.1 draft |
| DEC-S1.1-09 | Sécurité    | Les mutations admin exigent bearer court, RBAC, audit transactionnel et idempotence dédiée ; un replay de préparation réémet une capability sans persister le token brut.                                                        | ADR-019/020       | Proposed — historical S1.1 draft |

Dans l’instantané historique du 2026-08-15, ces propositions S1.1 décrivaient
uniquement le travail local alors non publié. Elles ne constituaient pas encore
des décisions acceptées ni une clôture du lot.

## 2026-08-20 — Hotfix supply-chain M0.3

| ID          | Nature         | Décision                                                                                                                                                                                                                                                                                                                   | Autorité                               | Statut                                       |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| DEC-M0.3-01 | Sécurité       | `GHSA-ggr8-5vv4-36mx` est corrigée par un override exact limité à `@prisma/config@7.9.1 > deepmerge-ts@8.0.1`; aucun downgrade ou changement de la famille Prisma n’est admis.                                                                                                                                             | Décision CTO M0.3 / GitHub Advisory    | Accepted                                     |
| DEC-M0.3-02 | Gouvernance    | Le scanner bloque toute version vulnérable ou imbriquée, tout override global ou en plage, tout élargissement de l’override et toute dérive de Prisma `7.9.1`.                                                                                                                                                             | Décision CTO M0.3                      | Accepted                                     |
| DEC-M0.3-03 | Compatibilité  | La rupture majeure `deepmerge-ts` v8 exige des preuves réelles sur la configuration Prisma, la fusion d’objets ordinaires, les graphes récursifs isolés, format, validate et génération déterministe.                                                                                                                      | Décision CTO M0.3                      | Accepted                                     |
| DEC-M0.3-04 | Cycle de vie   | L’override temporaire doit être retiré dans un futur lot autorisé dès qu’une version stable qualifiée de Prisma résout officiellement `deepmerge-ts >=8.0.0`.                                                                                                                                                              | Décision CTO M0.3                      | Accepted                                     |
| DEC-M0.3-05 | Isolement      | M0.3 s’exécute dans un second worktree ; les 39 fichiers locaux S1.1 restent intacts et suspendus, et S1.2 reste interdit.                                                                                                                                                                                                 | Décision CTO M0.3                      | Accepted                                     |
| DEC-M0.3-06 | Automatisation | M0.3-R1 rend le parcours des overrides itératif et n’autorise que le chemin exact `@prisma/config@7.9.1 > deepmerge-ts@8.0.1` ; les variantes globales, élargies, en plage, parallèles ou rattachées à un autre parent sont bloquées.                                                                                      | Décision CTO M0.3-R1                   | Accepted                                     |
| DEC-M0.3-07 | Sécurité       | M0.3-R2 corrige `GHSA-3f6p-5ww8-9rcr` uniquement par l’override exact `prisma@7.9.1 > mysql2@3.22.0`. Prisma, Prisma Client et l’override `@prisma/config@7.9.1 > deepmerge-ts@8.0.1` restent inchangés.                                                                                                                   | Décision CTO M0.3-R2 / GitHub Advisory | Accepted                                     |
| DEC-M0.3-08 | Périmètre      | Le changement de graphe R2 autorise uniquement l’ajout `sql-escaper@1.5.1`, le retrait `seq-queue@0.0.5` et `sqlstring@2.3.3`, ainsi que les métadonnées transitives directement liées à `mysql2@3.22.0`. Aucun autre changement de dépendance n’est admis.                                                                | Décision CTO M0.3-R2                   | Accepted                                     |
| DEC-M0.3-09 | Validation     | L’état R2 applicable est le lockfile SHA-256 `2041E52ECFB25092FADC32EE207C84DED22E9805233CCEA38889170CD1D08742`, deux installations de 1 135 paquets, audits complet/production à zéro, licences 1 129/0/0, scanner 49/49, outillage 56/56 et tests globaux 61/61.                                                         | Preuves M0.3-R2 validées par le CTO    | Accepted                                     |
| DEC-M0.3-10 | Publication    | Le head `68027ed15948228ceef7277ad1fa0a47761751e2` est publié dans la Draft PR #29 ; les quatre workflows #43 concluent `success`. Cette publication n’autorise ni Ready, approval, merge, tag, release, déploiement, reprise S1.1 ou démarrage S1.2.                                                                      | Décision CTO de publication M0.3-R2    | Accepted                                     |
| DEC-M0.3-11 | Documentation  | M0.3-R3 réconcilie les quatre documents vivants M0.3 avec l’état R2 publié. Son commit documentaire `4b5b914d213e3b3803affc15d0139fe898efcd0f` est publié sur la Draft PR #29 sans modifier code, manifeste, lockfile, scanner ou workflow.                                                                                | Décision CTO M0.3-R3                   | Accepted                                     |
| DEC-M0.3-12 | Incident       | Le 2026-09-03, le workflow Security #44 du head R3 révèle 11 nœuds vulnérables (7 high, 4 moderate) issus de sept avis : quatre `fast-uri`, un nouveau `mysql2` et deux `qs`. Les trois autres workflows #44 réussissent ; aucune défaillance indépendante n’est constatée.                                                | Workflow Security #44 / diagnostic R4  | Accepted                                     |
| DEC-M0.3-13 | Sécurité       | M0.3-R4 impose `ajv@8.18.0 > fast-uri@3.1.6`, `prisma@7.9.1 > mysql2@3.23.1`, ainsi que `qs@6.16.0` sous `body-parser@2.3.0`, `express@5.2.1` et `superagent@10.3.0`. Les overrides restent exacts, parentés et sans sélecteur global.                                                                                     | Décision CTO M0.3-R4 / avis officiels  | Accepted — published in R4                   |
| DEC-M0.3-14 | Automatisation | Le scanner R4 exige les cinq chemins parents exacts, les trois installations physiques racine uniques et l’absence de toute version vulnérable, variante globale, en plage, wildcard, tag, référence, mauvais parent, mauvais chemin ou override parallèle. Les gates M0.3/R1/R2 restent actifs.                           | Décision CTO M0.3-R4                   | Accepted — extended by DEC-M0.3-18           |
| DEC-M0.3-15 | Validation     | L’état R4 utilise le lockfile SHA-256 `E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044` : 2 × 1 135 paquets, audits complet/production à zéro, licences 1 129/0/0, scanner 65/65, outillage 72/72 et tests globaux 61/61.                                                                                 | Preuves locales M0.3-R4                | Accepted — published in R4                   |
| DEC-M0.3-16 | Périmètre      | R4 ne change physiquement que `fast-uri`, `mysql2` et `qs`; la contrainte `sql-escaper` de `mysql2` passe de `^1.3.3` à `^1.5.1` sans changer sa résolution `1.5.1`. Aucun paquet n’est ajouté ou retiré, Prisma reste `7.9.1`, `deepmerge-ts` reste `8.0.1`, les notices restent inchangées et S1.1 demeure suspendu.     | Décision CTO M0.3-R4                   | Accepted — published in R4                   |
| DEC-M0.3-17 | Publication    | Le commit R4 `205a4c2264cc99c065da81799ecfcc7f433e24d0` est publié dans la Draft PR #29, qui totalise alors cinq commits et huit fichiers. Les workflows #45 Infrastructure `33755877761`, Launcher Windows `33755877765`, Security `33755877754` et Quality Linux `33755877780` concluent tous `success`.                 | Décision CTO de publication M0.3-R4    | Accepted                                     |
| DEC-M0.3-18 | Automatisation | M0.3-R5 étend le gate `deepmerge-ts` afin que seul `node_modules/@prisma/config` puisse le déclarer dans les métadonnées du lockfile. Tout parent supplémentaire dans `dependencies`, `devDependencies`, `optionalDependencies` ou `peerDependencies` est rejeté de façon déterministe ; scanner 66/66 et outillage 73/73. | Décision CTO M0.3-R5                   | Accepted — prepublication evidence validated |

La séquence est cumulative : M0.3 corrige `deepmerge-ts`, R1 durcit le gate,
R2 corrige la première alerte `mysql2`, R3 réconcilie les documents publiés et
R4 traite les avis révélés par Security #44 sans changer Prisma `7.9.1`, puis
est publié au head consigné par DEC-M0.3-17 avec quatre workflows #45 verts.
La validation locale du 2026-09-04 consignée par DEC-M0.3-18 a qualifié la
correction R5 du dernier écart de gate avant publication. Les métadonnées de
publication, qui ne sont pas auto-référencées dans cette preuve, font foi dans
GitHub. Au moment de cette validation M0.3, l’instantané historique
prépublication S1.1 était préservé à 39/39. Son empreinte agrégée, établie sur
ce périmètre exact à partir de l’inventaire associant chaque chemin à sa taille
et son SHA-256, était
`8957cbf3ff27110af162f53c72e0c129860f0fcdfb8bfddab1ae3714a1d9c6dc`.
S1.2 n’était pas démarré à cet instant.

## 2026-08-20 — Arbitrage financier S1.1

| ID          | Nature    | Décision                                                                                                                                                                                                                            | Autorité                 | Statut                    |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- |
| DEC-S1.1-10 | Arrondi   | Proposition historique d’un `ROUND_HALF_UP` au Settlement entier, sans report fractionnaire. Cette proposition n’a jamais été publiée ni fusionnée et est remplacée par la décision Product Owner DEC-S1.1-13.                      | Arbitrage CTO 2026-08-20 | Superseded by DEC-S1.1-13 |
| DEC-S1.1-11 | Intégrité | Proposition historique de relations composites et d’un rang d’allocation. La protection composite reste requise, mais le rang lié au largest-remainder est remplacé par la chaîne structurelle et les préconditions de DEC-S1.1-14. | Arbitrage CTO 2026-08-20 | Superseded by DEC-S1.1-14 |
| DEC-S1.1-12 | Reversal  | Proposition historique où le complément plateforme absorbait le reliquat du Settlement courant. Elle est remplacée : le reliquat appartient à l’artiste et toute correction future reste compensatoire, sans réécriture.            | Arbitrage CTO 2026-08-20 | Superseded by DEC-S1.1-13 |

Cet arbitrage historique n’a été ni publié ni fusionné. Les propositions
incompatibles sont remplacées par les décisions finales ci-dessous.

## 2026-09-07 — Décisions finales finance et intégrité S1.1

| ID          | Nature       | Décision                                                                                                                                                                                                                                                                                                                                             | Autorité                             | Statut                            |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------- |
| DEC-S1.1-13 | Fractions    | `FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1` est la règle officielle. KORA+ paie les FCFA entiers ; chaque reliquat de numérateur appartient au même artiste, sort d’un `ArtistSettlement` et entre exactement une fois dans son successeur immédiat. Aucun `ROUND_HALF_UP`, abandon plateforme ou transfert entre artistes n’est autorisé.               | Décision Product Owner du 2026-09-07 | Accepted — S1.1 contract decision |
| DEC-S1.1-14 | Intégrité    | Chaque `ArtistEarning` est relié par clé composite au même `ArtistSettlement`, `Settlement`, `OrderItem`, `AudioContent` et artiste. Le prédécesseur du carry est unique, du même artiste et ordonné par séquence ; une transaction future doit le verrouiller et exécuter les préconditions de correspondance, conservation et consommation unique. | Décision CTO du 2026-09-07           | Accepted — S1.1 contract decision |
| DEC-S1.1-15 | Immutabilité | Les relations financières cibles utilisent `Restrict`, les données finalisées restent append-only et toute correction future crée des écritures compensatoires. S1.1 fournit uniquement modèle, contrat, validateur et preuve pure : aucune migration, route, transaction ou exécution financière réelle n’est livrée.                               | ADR-013/014 et décision CTO S1.1     | Accepted — S1.1 contract decision |

Ces décisions S1.1 sont acceptées indépendamment du statut Git de leur
publication et remplacent les propositions historiques incompatibles
DEC-S1.1-10 à DEC-S1.1-12. Lors de la validation locale du 2026-09-07, aucun
commit, push ou changement GitHub S1.1 n’avait encore été effectué et S1.2
n’avait pas été commencé. Cet état est un instantané historique de
prépublication ; tout statut ultérieur fait foi dans l’historique Git et dans la
Draft PR correspondante.

## 2026-09-08 — Correctifs locaux S1.1-R1 issus de la revue CTO

| ID          | Nature           | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                     | Autorité                   | Statut                                |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------- |
| DEC-S1.1-16 | Authentification | Le contrat client sépare inscription et connexion, exige téléphone E.164 et mot de passe avant OTP, protège le step-up par la session existante et impose la création atomique de la seule session active avec révocation des précédentes. Le challenge conserve un contexte serveur borné et l’inscription ne révèle pas l’existence du téléphone. Access 15 minutes, refresh 30 jours rotatif à usage unique, replay révoquant la famille. | ADR-010 / revue CTO S1.1   | Accepted — S1.1 contract decision     |
| DEC-S1.1-17 | Isolation        | Session/appareil, descripteur/droit/appareil et idempotence/commande utilisent des relations composites de même client avec `Restrict`. Toute réponse métier avec corps suit une enveloppe fermée `{data, meta}` et toute erreur suit `{error: {code, message, details}}` avec détails fermés non sensibles ; les classes de sécurité sont exactes, sans alternative anonyme.                                                                | Revue CTO S1.1             | Accepted — S1.1 contract decision     |
| DEC-S1.1-18 | Accessibilité    | Paiement sandbox expose un radio exclusif actionnable ; succès paiement et hors connexion sont des régions vivantes ; les lecteurs séparent description, état dérivé de `isPlaying` et action sans répéter titre/artiste, y compris à vide. Dimensions, espacements, rayons et typographie sont centralisés dans les tokens Flutter existants.                                                                                               | Revue CTO S1.1             | Accepted — S1.1 contract decision     |
| DEC-S1.1-19 | Localisation     | L’intégration complète `AppLocalizations` est formellement différée au lot runtime mobile planifié. S1.1-R1 n’ajoute ni dépendance, manifeste ni infrastructure i18n et fournit les nouveaux libellés d’état par l’appelant ; il ne prétend pas livrer la localisation complète.                                                                                                                                                             | Gouvernance S1.1 / roadmap | Accepted — deferred runtime execution |

Au point de décision CTO du 2026-09-08, S1.1-R1 avait achevé sa validation
locale avant tout commit, push ou changement de la Draft PR #36. Ce constat est
une preuve historique de prépublication ; la publication ultérieure est
enregistrée séparément dans l’historique Git et dans la PR. S1.2 restait non
démarré à cet instant.

## 2026-09-09 — Remédiation supply-chain S1.1-R2

| ID          | Nature         | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Autorité                              | Statut                                   |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------- |
| DEC-S1.1-20 | Dépendances    | R2 maintient les branches majeures et fixe Next/ESLint Config Next `16.3.4`, Vitest et `@vitest/mocker` `4.1.11`, `js-yaml` `3.15.2`/`4.3.2` via les deux sélecteurs existants, et Sharp `0.35.4` avec `libheif@1.23.2`. Aucun override `@vitest/mocker`, changement Prisma, code applicatif, workflow ou nouveau fichier n’est autorisé.                                                                                                                                                        | Décision CTO S1.1-R2 / avis officiels | Accepted — S1.1-R2 remediation decision  |
| DEC-S1.1-21 | Upload         | `@nestjs/platform-express@11.1.28` conserve sa version et remplace uniquement sa résolution déclarée `multer@2.2.0` par l’override parenté exact `multer@2.3.0`. Tout futur runtime d’upload devra fixer un `fieldArrayIndexLimit` minimal adapté au produit ; aucune valeur ni implémentation runtime n’est inventée par R2.                                                                                                                                                                    | Décision CTO S1.1-R2                  | Accepted — S1.1-R2 remediation decision  |
| DEC-S1.1-22 | Automatisation | Le scanner impose les pins, installations physiques et parents exacts des familles R2. Il rejette les overrides globaux, élargis, mal versionnés, en plage, wildcard, tag, référence, parallèles ou rattachés à un autre parent, tout en conservant sans affaiblissement les gates M0.3 et S1.1-R1.                                                                                                                                                                                              | Security gate S1.1-R2                 | Accepted — S1.1-R2 remediation decision  |
| DEC-S1.1-23 | Validation     | Le lockfile SHA-256 `417A15E68EB637F7426E52FB0022ADBFF3825C7BE1097145DC4A12F6312E245F` est reproduit par 2 × 1 137 paquets ; audits complet/production zéro, `npm ls --all` code 0, scanner 75/75, outillage 226/226, licences 1 131/0/0, tests globaux et six builds npm passent. Après conservation des sorties Next suivies, deux passages Web/Admin supplémentaires, typecheck inclus, produisent les mêmes SHA-256 et le même diff Git. Prisma reste `7.9.1` et le lock Pub reste inchangé. | Preuves locales S1.1-R2               | Accepted — local prepublication evidence |
| DEC-S1.1-24 | Périmètre      | R2 reste limité à 12 fichiers : les cinq manifests/lock npm, le scanner et ses tests, les trois documents vivants et les deux `next-env.d.ts` suivis, régénérés par Next `16.3.4`. Leur import `root-params.d.ts` est requis pour des builds idempotents avec la politique de suivi actuelle. Aucun manifeste Pub, golden, fichier Flutter, OpenAPI, schéma Prisma, code métier, migration, infrastructure ou S1.2 ne change.                                                                    | Gouvernance S1.1-R2                   | Accepted — S1.1-R2 scope decision        |

Au point de validation prépublication du 2026-09-09, S1.1-R2 était uniquement
présent dans le worktree local, non indexé, non commité et non publié. Ce
constat est une preuve historique datée ; toute publication ultérieure sera
enregistrée séparément dans l’historique Git et dans la Draft PR #36. S1.2
restait non démarré à cet instant.

## 2026-09-09 — Qualification de licence Sharp/libvips Linux S1.1-R3

| ID          | Nature       | Décision                                                                                                                                                                                                                                                                                                                                                                                                                           | Autorité                      | Statut                                   |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| DEC-S1.1-25 | Gate CI      | Le workflow Security R2 `34373860535` a réussi les audits à zéro puis rejeté uniquement `@img/sharp-libvips-linux-x64@1.3.3` et `@img/sharp-libvips-linuxmusl-x64@1.3.3`, absents de l’installation Windows mais sélectionnés par Sharp sur Linux x64. Les trois autres workflows R2 ont conclu `success`.                                                                                                                         | Preuve GitHub S1.1-R2         | Accepted — historical CI evidence        |
| DEC-S1.1-26 | Licence      | Le contrôleur remplace exclusivement les deux autorisations nominatives `1.3.2` par les mêmes noms en `1.3.3` et licence exacte `LGPL-3.0-or-later`. La licence ne devient pas globalement approuvée ; aucun wildcard, plage, tag, autre version ou troisième paquet n’est autorisé. La qualification S0.3 est un précédent historique limité et non une approbation automatique du delta.                                         | Décision CTO S1.1-R3          | Accepted — exact package qualification   |
| DEC-S1.1-27 | Distribution | Les bibliothèques optionnelles ne sont ni modifiées localement, ni intégrées aux bundles navigateur ou à l’APK Flutter. Elles peuvent être embarquées dans un artefact serveur Linux ; toute distribution reste soumise à un gate juridique/release distinct couvrant licences, notices, sources correspondantes, conditions LGPL et packaging réel. Cette qualification technique n’autorise aucune release.                      | Gouvernance licences/releases | Accepted — release gate remains required |
| DEC-S1.1-28 | Périmètre    | R3 est strictement documentaire et outillage : contrôleur de licences, notices tierces, rapport dédié et trois documents vivants. Aucun manifeste, lockfile, dépendance, workflow, code applicatif, binaire tiers, bundle, APK ou S1.2 ne change.                                                                                                                                                                                  | Gouvernance S1.1-R3           | Accepted — S1.1-R3 scope decision        |
| DEC-S1.1-29 | Publication  | Le commit `7d23f14619bb88e870e8cfa6d88a0d921db70b28` publie R3 comme quatrième commit de la Draft PR #36, dont le cumul atteint alors 52 fichiers. Infrastructure `34413603588`, Launcher Windows `34413603576`, Security `34413603622` et Quality Linux `34413603626` concluent tous `completed/success` sur ce head exact. Security confirme les audits npm complet et production à zéro ainsi que l’inventaire Linux 1 138/0/0. | Preuves GitHub S1.1-R3        | Accepted — published historical evidence |

Au point de validation prépublication du 2026-09-09, S1.1-R3 était
uniquement présent dans le worktree local, non indexé, non commité et non
publié. Ce constat est une preuve historique datée ; tout statut ultérieur
fait foi dans l’historique Git et dans la Draft PR #36. S1.2 restait non
démarré à cet instant.

Après cet instantané, R3 a été publié au SHA consigné par DEC-S1.1-29. Cette
preuve postérieure n’étend ni l’autorisation LGPL nominative ni l’autorisation
de release ; les futurs statuts Git et CI font foi dans l’historique GitHub et
la PR #36.

## 2026-09-10 — S1.2-01 Contract & Data Readiness Gate

| ID             | Nature      | Décision                                                                                                                                                                                                                                                                                                                                                                                                  | Autorité                                        | Statut                                                    |
| -------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| DEC-S1.2-01-01 | Périmètre   | S1.1 est fermé. S1.2-01 complète uniquement le contrat, le modèle cible, les gates et les preuves ; aucune migration, route runtime, interface, installation, dépendance, seed, intégration fournisseur ou donnée média n’est créée.                                                                                                                                                                      | Autorisation Product Owner et CTO du 2026-09-10 | Accepted — contract/data gate decision                    |
| DEC-S1.2-01-02 | Catalogue   | La couverture publique est une représentation contrôlée liée au contenu et au `mediaAssetVersion` obligatoire de la publication active, sans URL ou emplacement privé. `settledSalesCount` dérive seulement des unités réglées nettes des remboursements totaux et vaut zéro avant P4.                                                                                                                    | ADR-011/016 et décision CTO S1.2-01             | Accepted — contract decision                              |
| DEC-S1.2-01-03 | Provenance  | `Artist` et `AudioContent` conservent l’administrateur créateur ; cette provenance est attribuée par le serveur, absente des entrées client et reliée par `Restrict`. Comme `Restrict` n’interdit pas une réaffectation directe de la FK, une future contrainte SQL devra rendre la colonne immuable avant le runtime.                                                                                    | ADR-011/019/020                                 | Accepted — target data decision; SQL enforcement deferred |
| DEC-S1.2-01-04 | Admin       | La cible de données admin couvre TOTP RFC 6238 à chaque connexion et enrôlement préalable, secret chiffré, dix codes Argon2id à usage unique, récupération/reset audités, session révocable, refresh cookie protégé, rotation versionnée, inactivité huit heures, fraîcheur TOTP cinq minutes et journal complet lié à la même session (action, entité, avant/après masqués, motif, requête, horodatage). | ADR-002/005/008/019                             | Accepted — data readiness decision                        |
| DEC-S1.2-01-05 | Média       | Le callback Mux futur vérifie la signature sur le corps brut borné, persiste avant acquittement une Inbox dédupliquée contenant SHA-256 et payload chiffré, corrèle séparément les références upload/asset uniques, puis traite idempotemment sans jamais publier. La valeur maximale du corps reste une décision de sécurité préalable au runtime.                                                       | ADR-011/015                                     | Accepted — contract/data target; runtime limit deferred   |
| DEC-S1.2-01-06 | Publication | Une republication après archivage ajoute une nouvelle `ContentPublication` et préserve toutes les preuves historiques ; les liens contenu, publication et assets sont `Restrict`.                                                                                                                                                                                                                         | ADR-011/016/019                                 | Accepted — data decision                                  |

Instantané historique de validation locale du 2026-09-11, établi avant toute
publication. À cet instant, le HEAD de départ restait
`bcb579916c1ca73e3cfb186683cb932f4f3905e9` et aucun commit, push, changement
GitHub, runtime ou migration S1.2 n’avait été effectué. Ce constat reste vrai
pour cet instantané historique ; toute publication ultérieure est enregistrée
séparément par l’historique Git, la PR et les workflows.

## 2026-09-12 — S1.2-01-R2 Contract Gate Hardening

| ID                | Nature      | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Autorité                                                        | Statut                             |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------- |
| DEC-S1.2-01-R2-01 | Réponses    | Chaque `operationId` est lié à un unique triplet succès exact : statut HTTP, media type et schéma de réponse. Une enveloppe valide appartenant à une autre opération, un statut substitué, un media type ajouté ou un body sur `204` sont bloquants.                                                                                                                                                                                                                                                               | Verdict CTO `CHANGES REQUIRED` et autorisation R2 du 2026-09-12 | Accepted — règle de gate R2        |
| DEC-S1.2-01-R2-02 | Couverture  | `getPublicAudioCover` exige `mediaAssetVersion` présent, entier et supérieur ou égal à 1 ; toute violation est contractée en `400 / VALIDATION_ERROR`.                                                                                                                                                                                                                                                                                                                                                             | Autorisation CTO S1.2-01-R2                                     | Accepted — contrat défensif        |
| DEC-S1.2-01-R2-03 | Webhook Mux | La racine du payload fournisseur Mux et son objet `data` restent extensibles pour tolérer les ajouts fournisseur ; l’acquittement KORA+ reste au contraire une forme exacte et fermée.                                                                                                                                                                                                                                                                                                                             | Autorisation CTO S1.2-01-R2                                     | Accepted — frontière fournisseur   |
| DEC-S1.2-01-R2-04 | Prisma      | Les commentaires ligne et bloc sont retirés lexicalement et les chaînes susceptibles de contenir du faux code sont masquées avant tout contrôle Prisma : un champ, une relation, une clé candidate ou une contrainte uniquement commenté ou injecté dans une telle chaîne ne satisfait aucun gate. Les garanties sensibles explicitement couvertes par R2 — authentification admin, provenance, Inbox et média Mux — sont en plus ancrées à des lignes et noms exacts afin de rejeter leurs identifiants préfixés. | Autorisation CTO S1.2-01-R2                                     | Accepted — validation fail-closed  |
| DEC-S1.2-01-R2-05 | Génération  | La comparaison officielle des types générés exige exactement Prettier `3.9.6`. L’absence, le remplacement ou l’impossibilité de charger ce formateur produit un échec explicite ; aucune équivalence lexicale dégradée n’est déclarée `PASS`.                                                                                                                                                                                                                                                                      | Version verrouillée du dépôt et autorisation CTO S1.2-01-R2     | Accepted — reproductibilité exacte |

Instantané historique local prépublication du 2026-09-12 : R2 est construit sur
le head publié R1 `c588f12422423936ea190a72926f821988553761`. Les décisions ci-dessus
décrivent le gate défensif validé localement avant toute décision distincte de
commit R2. Elles n’affirment aucun SHA ou Run ID futur et n’autorisent ni
runtime, migration, interface, changement de dépendance, Ready, merge ou
démarrage de S1.2-02.

## 2026-09-14 — S1.2-01-R3 Prisma Lexer and Cover Parameter Uniqueness

| ID                | Nature            | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Autorité                                                        | Statut                                  |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| DEC-S1.2-01-R3-01 | Validation Prisma | Toute chaîne Prisma qui atteint un saut de ligne ou la fin du fichier avant un guillemet fermant non échappé provoque un échec lexical explicite. Aucun texte placé après cette ouverture ne peut satisfaire un gate de champ, relation, clé candidate ou contrainte. Les chaînes valides, échappements et commentaires correctement terminés conservent leur traitement R2.                                                                                                          | Verdict CTO `CHANGES REQUIRED` et autorisation R3 du 2026-09-14 | Accepted — règle de gate R3             |
| DEC-S1.2-01-R3-02 | Couverture        | Après déréférencement, `getPublicAudioCover` doit contenir exactement un paramètre nommé `mediaAssetVersion`, situé en query, obligatoire, entier et de minimum 1. Un second paramètre homonyme est bloquant, même lorsque le premier est conforme.                                                                                                                                                                                                                                   | Autorisation CTO S1.2-01-R3                                     | Accepted — contrat défensif             |
| DEC-S1.2-01-R3-03 | Validation        | Les deux faux `PASS` Prisma — relation `AuditLog.adminSession` injectée après une ouverture de chaîne suivie d’un saut de ligne, puis chaîne encore ouverte à EOF — et le doublon de paramètre cover ont été reproduits avant correction. Trois tests négatifs les figent ; sous Node `22.18.0`, syntaxe, validateur réel, tests OpenAPI/Contracts `220/220`, scanner officiel sur 337 fichiers, Prettier `3.9.6`, références, chronologie, whitespace et périmètre concluent `PASS`. | Preuves locales R3 du 2026-09-14                                | Accepted — preuve locale prépublication |

Cette entrée décrit exclusivement l’instantané historique local
prépublication du 2026-09-14, construit sur le head R2 publié
`7138b2d3d3829ffdd65e4ff592968466273c46d3`. À cet instant, aucun commit R3,
push ou changement de la Draft PR #42 n’a été effectué ; aucun SHA R3 ni Run ID
futur n’est affirmé. Le micro-lot ne livre ni runtime, migration, interface,
dépendance ou fichier généré et ne démarre pas S1.2-02. Tout statut de
publication ultérieur fera foi dans l’historique Git, la PR et ses workflows.

## 2026-09-14 — S1.2-02 Canonical PostgreSQL Baseline

| ID             | Nature     | Décision                                                                                                                                                                                                                                                                                                 | Autorité                             | Statut                       |
| -------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| DEC-S1.2-02-01 | Migration  | Le schéma canonique complet de 33 modèles est matérialisé par une baseline générée byte-for-byte avec Prisma 7.9.1, suivie d’une migration SQL PostgreSQL séparée afin de garder la génération reproductible et les garanties spécifiques auditables.                                                    | Autorisation S1.2-02 active          | Executed — closed and merged |
| DEC-S1.2-02-02 | Intégrité  | Les garanties matérialisables sans runtime sont imposées en base : unicités partielles, relations composites, provenance/références immuables, preuves append-only, historiques/états liés, SHA-256, publication `READY`, sources financières rapprochées, ledger équilibré et conservation floor/carry. | ADR-011 à ADR-019 et contrat S1.2-01 | Executed — validated         |
| DEC-S1.2-02-03 | Frontière  | L’atomicité métier multi-agrégats, la clôture logique des agrégats par rôle d’écriture borné, l’authentification, HMAC/KMS, RBAC, limites webhook, sérialisation, endpoints et workers restent explicitement différés ; aucune garantie non livrée n’est déclarée opérationnelle.                        | Autorisation S1.2-02 et gouvernance  | Accepted — runtime deferred  |
| DEC-S1.2-02-04 | Validation | Deux bases PostgreSQL 18.4 vides et isolées reçoivent les migrations, un second passage sans attente, les inventaires complets et les tests positifs/négatifs. Leur signature structurelle est identique et les deux bases sont supprimées de façon ciblée.                                              | Preuves locales S1.2-02              | Executed — validated         |
| DEC-S1.2-02-05 | Périmètre  | Aucun endpoint, service, worker, seed, média, interface, dépendance, manifeste, lockfile, workflow, infrastructure ou donnée de production n’est ajouté. Dans l’instantané prépublication du 2026-09-15, aucun commit, push ou changement GitHub n’avait encore été effectué. S1.2-03 n’est pas démarré. | Autorisation S1.2-02 active          | Accepted — enforced          |

Les états locaux et l’absence de publication consignés ci-dessus décrivent
uniquement l’instantané historique prépublication du 2026-09-15. Tout état
ultérieur fait foi dans l’historique Git, la Draft PR et ses workflows ; aucun
SHA de commit, numéro de PR ou Run ID futur n’est anticipé dans cette preuve.

## 2026-09-15 — Clôture post-fusion S1.2-02

Les constats ci-dessous sont postérieurs à l’instantané prépublication conservé
ci-dessus et ne le réécrivent pas.

| ID             | Nature       | Décision                                                                                                                                                                                                                                                                                                                                                                       | Autorité                                   | Statut                            |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------- |
| DEC-S1.2-02-06 | Publication  | La PR #43 est fusionnée et fermée dans `main` au merge `4a1f4306871cac661fa12d4f326495fc43cddbb4`, parents ordonnés `dfb6445cb157b03142b7f1b01952fa76fdef16f9` puis `2022f5a229c8cb5138205f5fb02d37ea344ef73b`, arbre `95a9036ec5e287b78cdd2771010509d24292fa29`. L’unique commit S1.2-02 publié `2022f5a229c8cb5138205f5fb02d37ea344ef73b` et ses 14 fichiers sont préservés. | État Git et PR #43 constatés le 2026-09-15 | Accepted — S1.2-02 closed/merged  |
| DEC-S1.2-02-07 | CI           | Les workflows post-fusion `push/main` Infrastructure `34986168463`, Launcher Windows `34986168571`, Security `34986168621` et Quality Linux `34986168424` ont tous terminé `completed/success` sur le merge exact.                                                                                                                                                             | GitHub Actions post-fusion                 | Accepted — four workflows green   |
| DEC-S1.2-02-08 | Distribution | Aucun tag, release ou déploiement n’accompagne la fusion. Aucun endpoint, service, worker, seed, runtime métier ou interface n’est livré par S1.2-02.                                                                                                                                                                                                                          | Périmètre et état GitHub constatés         | Accepted — scope preserved        |
| DEC-S1.2-02-09 | Séquencement | S1.2-03 reste `Not started`. Son analyse demeure une proposition soumise à une décision séparée ; S1.2-03A n’est ni autorisé ni démarré par la clôture S1.2-02.                                                                                                                                                                                                                | Gouvernance et autorisation Product Owner  | Accepted — next slice not started |

## 2026-09-16 — S1.2-03A PostgreSQL Least-Privilege Runtime Boundary

Cette autorisation est postérieure à DEC-S1.2-02-09 et ne réécrit pas son
constat historique. Elle part du merge `main`
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d`, après fusion de la PR #44 et
succès des workflows `push/main` Infrastructure `35082285457`, Launcher Windows
`35082285515`, Security `35082285620` et Quality Linux `35082285461`.

| ID              | Nature      | Décision                                                                                                                                                                                                                                                                                  | Autorité                                     | Statut                                                  |
| --------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| DEC-S1.2-03A-01 | Accès base  | Le compte propriétaire/migrateur ne doit jamais être utilisé par l’API. Le rôle API est non propriétaire, `NOINHERIT`, sans membership ni attribut administratif, et limité à `CONNECT`, `USAGE` et `SELECT`.                                                                             | Autorisation Product Owner du 2026-09-16     | Executed — locally validated                            |
| DEC-S1.2-03A-02 | Fail closed | Avant `application.init()`, l’API vérifie identité, attributs, memberships, propriété et privilèges effectifs, y compris `PUBLIC`; tout droit inattendu bloque le démarrage avec des codes sûrs sans valeur de connexion.                                                                 | Objectif de sécurité S1.2-03A                | Executed — locally validated                            |
| DEC-S1.2-03A-03 | Prisma      | Prisma 7.9.1 utilise `@prisma/adapter-pg` 7.9.1 sur le pool runtime unique partagé par la readiness. La version, provenance SLSA, licence, graphe et audit sont contrôlés avant installation.                                                                                             | Stack verrouillée et gate supply-chain       | Accepted — initial audit zero; not replayed after R1/R2 |
| DEC-S1.2-03A-04 | Validation  | Deux bases PostgreSQL 18.4 indépendantes reçoivent les migrations existantes sous des propriétaires distincts. Le script livré prouve création, convergence, idempotence et récupération de dérive, puis DDL, `TRUNCATE`, trigger, `SET ROLE` et écritures sont refusés avec `42501`.     | Preuves locales S1.2-03A                     | Executed — reproducible and cleaned                     |
| DEC-S1.2-03A-05 | Périmètre   | Le rôle runtime reste en lecture seule. Aucun schéma, migration, OpenAPI, contrat, workflow, endpoint, service métier, worker, seed, interface, média ou paiement n’est ajouté. La publication initiale, puis R1 et R2 ont été autorisés séparément ; Ready et merge demeurent interdits. | Autorisation Product Owner et limites du lot | Executed — Draft PR #45 open; not merged                |
| DEC-S1.2-03A-06 | CI propre   | Les commandes API `build`, `typecheck` et `test` doivent générer Prisma 7.9.1 avant leur exécution et réussir après `npm ci` sans dépendre d’un client produit par une commande antérieure. Un test de contrat verrouille les trois hooks npm.                                            | Échecs CI initiaux de la Draft PR #45        | Executed — R1 integrated on Draft branch                |
| DEC-S1.2-03A-07 | Smoke infra | Le smoke Infrastructure applique les migrations sous le propriétaire/migrateur, reprovisionne les ACL, exige son refus par le garde, puis lance l’API exclusivement avec le rôle runtime. Une sortie prématurée remonte le fatal neutralisé sans attendre le timeout.                     | Échec Infrastructure R1 `35155026285`        | R2 published — CI green on Draft branch                 |

L’absence de commit, push et PR constatée lors de la validation locale du
2026-09-16 reste l’instantané historique prépublication. Elle ne décrit pas
l’état postérieur à l’autorisation de publication Draft.

La Draft PR #45 a ensuite été créée au head
`974d7afa9d4dc9ceb88a35bd5bd7ae3f477cb875`. Security `35119052015` a réussi ;
Infrastructure `35119052104`, Launcher Windows `35119052049` et Quality Linux
`35119052101` ont échoué faute de génération Prisma après `npm ci`. La séquence
R0 et ses échecs sont historiques. La correction DEC-S1.2-03A-06 a été validée
dans un clone propre puis intégrée par R1 sur la branche de la Draft PR. Aucun
run initial n’est relancé ; les nouveaux runs sont attachés au head R1 distinct.
La PR demeure Draft et S1.2-03B reste `Not started`.

R1 est publié au commit `41b3d8f33a637108814208258a3e99b105be1afc`.
Launcher Windows `35155026009`, Security `35155025993` et Quality Linux
`35155026016` ont réussi ; Infrastructure `35155026285` a échoué. Le log complet
de cet échec R1 historique montre que le provisionnement runtime et les
contrôles de l’infrastructure réussissent. Dans la version R1 publiée,
`verify-api-health.mjs` transmettait
encore `KORA_POSTGRES_USER` et `postgres_password` au processus API. La
reproduction isolée neutralisée obtient le fatal `RuntimeDatabaseBoundaryError`
attendu pour le propriétaire. DEC-S1.2-03A-07 corrige localement ce câblage sans
modifier le garde, les privilèges PostgreSQL, les migrations, le workflow ou le
lockfile. Cette preuve décrit l’instantané local prépublication R2 : à cet
instant, la correction n’avait fait l’objet d’aucun commit, push, rerun ou
changement de la Draft PR #45 et ne préjugeait pas du résultat de ses futurs
workflows. Cet instantané local R2 du 2026-09-16 reste une preuve historique.

R2 a ensuite été publié au commit
`9d163cc34caa57cd671b6783048d89dde6d18069`. Infrastructure `35162113781`,
Launcher Windows `35162113686`, Security `35162113920` et Quality Linux
`35162113691` ont tous terminé `pull_request/completed/success` sur ce head
exact. La PR #45 demeure ouverte, Draft et non fusionnée ; S1.2-03B reste
`Not started`.

L’instantané local prépublication de la réconciliation documentaire R3 du
2026-09-17 a été établi alors qu’aucun commit, push, changement de PR, rerun,
Ready ou merge R3 n’avait été effectué ; aucun SHA ou Run ID R3 futur n’y était
affirmé.

## 2026-09-18 — S1.2-03A-R4 All Non-System Schemas Boundary

| ID              | Nature         | Décision                                                                                                                                                                                                                                                                                                                                                                                                                | Autorité                                 | Statut                                     |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| DEC-S1.2-03A-08 | Publication R3 | R3 est publié au head `8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`. Infrastructure `35209186465`, Launcher Windows `35209186447`, Security `35209186482` et Quality Linux `35209186464` sont tous `pull_request/completed/success` sur ce SHA exact.                                                                                                                                                                      | Preuves GitHub R3                        | Accepted — historical publication evidence |
| DEC-S1.2-03A-09 | Preuve R1      | Le corps de la Draft PR #45 corrige une seule fois le compteur historique R1 de `+116/-42` vers `+118/-42`, valeur confirmée par Git et GitHub. Le cumul R3 reste `4 commits, 28 fichiers, +2761/-187` ; titre, head, base et statut Draft sont inchangés.                                                                                                                                                              | Verdict CTO et autorisation 2026-09-18   | Executed — PR body correction only         |
| DEC-S1.2-03A-10 | Attestation    | Le profil runtime est contrôlé sur tous les schémas non système de la base courante. Toute propriété enregistrée, option de redélégation ou ACL inattendue de schéma, relation, colonne, séquence, routine, type ou privilège par défaut accordée au runtime ou à `PUBLIC` bloque le démarrage ; `public` conserve uniquement `USAGE` et la lecture des tables canoniques.                                              | Verdict CTO BLOCK post-R3                | R4 locally implemented and validated       |
| DEC-S1.2-03A-11 | Provisioning   | Le provisionneur normalise exclusivement le rôle runtime, la base, `public` et les privilèges par défaut du propriétaire/migrateur qui relèvent du lot. Toute propriété runtime, tout état dangereux tiers ou tout default ACL d’un autre propriétaire dans `public` est refusé avec un code non nul et un diagnostic borné sans secret ; aucune propriété ou ACL tierce n’est réattribuée ou réécrite automatiquement. | Décision CTO R4                          | R4 locally implemented and validated       |
| DEC-S1.2-03A-12 | Validation     | Deux bases éphémères indépendantes valident chacune un schéma tiers sain, 18 provisionnements réussis, 11 refus déterministes à signature inchangée et quatre réparations isolées de `WITH GRANT OPTION`, puis Prisma, `SELECT 1`, lecture `Customer`, refus propriétaire et sept refus `42501`. Le nettoyage des deux bases, six rôles, du conteneur et des secrets reste strictement ciblé.                           | Preuves locales R4                       | Executed — reproducible and cleaned        |
| DEC-S1.2-03A-13 | Périmètre      | R4 ne modifie ni dépendance, lockfile, schéma Prisma, migration S1.2-02, OpenAPI, contrat généré, workflow ou client Web/Admin/Mobile. Il ne publie aucun code et ne démarre pas S1.2-03B.                                                                                                                                                                                                                              | Autorisation Product Owner du 2026-09-18 | Accepted — local prepublication scope      |

Ces décisions décrivent l’instantané local prépublication R4 du 2026-09-18.
Aucun SHA ou Run ID R4 futur n’est affirmé. En dehors de l’unique correction
historique du corps de la Draft PR #45 consignée par DEC-S1.2-03A-09, aucun
commit, push, rerun, changement de statut, Ready ou merge R4 n’a été effectué.

## Catégories d’autorité

- **Produit** : vision, économie, marque, contrats et périmètre irréversible ;
  décision réservée au Product Owner.
- **Technique** : architecture, sécurité et séquencement dans les limites
  approuvées ; arbitrage ChatGPT Work.
- **Exécution** : opérations autorisées par le prompt actif ; Codex exécute et
  produit les preuves.
- **Réservée PO** : aucune valeur ou identité n’est inventée pour contourner
  l’absence d’une décision.
