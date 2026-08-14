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

| ID          | Nature      | Décision                                                                                                                                                                                                                                 | Autorité          | Statut                        |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------- |
| DEC-S0.6-01 | Traçabilité | S0.4, S0.5, M0.1 et M0.2 sont fusionnés aux SHA exacts `8c3e65e2bcbffb53050b61cab4b953f108491db1`, `c080ec0529e758203d4326f7ec5b0b0159cbdad7`, `79ceddc6cbf04b3d213001417da0841044af8206` et `40a224edc1dc018a080b6c188a804e361e96b5ef`. | Décision CTO S0.6 | Accepted                      |
| DEC-S0.6-02 | Exécution   | La baseline immuable du gate est le merge M0.2 `40a224edc1dc018a080b6c188a804e361e96b5ef`; S0.6 audite et documente sans corriger ni modifier de fichier technique.                                                                      | Décision CTO S0.6 | Accepted                      |
| DEC-S0.6-03 | Qualité     | Les gates locaux applicables QA, infrastructure, sécurité et design passent ; le verdict est `PASS WITH RESERVATIONS` et reste soumis à la revue CTO et aux quatre checks de la Draft PR.                                                | Décision CTO S0.6 | Executed — CTO review pending |
| DEC-S0.6-04 | Réserves    | iOS/macOS, Gitleaks, Sentry réel et l’inspection navigateur interactive sont non exécutés ; Dependabot Alerts/security updates et Code Scanning ne sont pas actifs/configurés sur GitHub. Aucun de ces écarts n’est corrigé dans S0.6.   | Décision CTO S0.6 | Open external/platform limits |
| DEC-S0.6-05 | Périmètre   | Les 68 exigences produit restent `Not started` / `Not verified`; aucune sécurité métier, route, modèle Prisma, migration ou fonctionnalité Slice 1 n’est déclarée implémentée.                                                           | Décision CTO S0.6 | Accepted                      |

S0.6 valide uniquement les fondations. La Draft PR doit rester Draft ; Ready,
merge, tag, release, déploiement et démarrage de Slice 1 exigent une nouvelle
décision CTO.

## Catégories d’autorité

- **Produit** : vision, économie, marque, contrats et périmètre irréversible ;
  décision réservée au Product Owner.
- **Technique** : architecture, sécurité et séquencement dans les limites
  approuvées ; arbitrage ChatGPT Work.
- **Exécution** : opérations autorisées par le prompt actif ; Codex exécute et
  produit les preuves.
- **Réservée PO** : aucune valeur ou identité n’est inventée pour contourner
  l’absence d’une décision.
