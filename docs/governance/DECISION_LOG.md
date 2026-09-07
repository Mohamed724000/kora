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
GitHub. Au moment de cette validation M0.3, S1.1 était préservé à 39/39 avec
l’empreinte agrégée
`8957cbf3ff27110af162f53c72e0c129860f0fcdfb8bfddab1ae3714a1d9c6dc`, et
S1.2 n’est pas démarré.

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

## Catégories d’autorité

- **Produit** : vision, économie, marque, contrats et périmètre irréversible ;
  décision réservée au Product Owner.
- **Technique** : architecture, sécurité et séquencement dans les limites
  approuvées ; arbitrage ChatGPT Work.
- **Exécution** : opérations autorisées par le prompt actif ; Codex exécute et
  produit les preuves.
- **Réservée PO** : aucune valeur ou identité n’est inventée pour contourner
  l’absence d’une décision.
