# Matrice de traçabilité des exigences

## Objet

Cette matrice reprend les 68 identifiants de l’artefact source immuable
[KORA_PLUS_Requirements_Traceability_Matrix_V1.xlsx](../source-material/originals/KORA_PLUS_Requirements_Traceability_Matrix_V1.xlsx).
Elle sert de registre vivant pour l’implémentation et la vérification. Elle ne
modifie ni les exigences sources ni les décisions d’architecture applicables.

Les colonnes `Implémentation`, `Vérification` et `Preuve` décrivent l’état réel
du dépôt à la date du présent lot. Sprint 0.1 et Sprint 0.2 ne produisent aucun
code applicatif. Les Sprints 0.3 à 0.5 introduisent uniquement des fondations
techniques ; aucune exigence produit ci-dessous n’était déclarée commencée ou
vérifiée avant l’autorisation distincte de S1.1.

Sprint 0.3 est fermé et fusionné via la
[PR #2](https://github.com/Mohamed724000/kora/pull/2). Son commit de clôture est
[`c4bce826b8a16d78aa2b10865e0d03d191ea7f46`](https://github.com/Mohamed724000/kora/commit/c4bce826b8a16d78aa2b10865e0d03d191ea7f46)
et son merge commit est
[`d3f837c93044d0b514c2abd732c559cdd6543a96`](https://github.com/Mohamed724000/kora/commit/d3f837c93044d0b514c2abd732c559cdd6543a96).
Sprint 0.4 est fermé et fusionné via la
[PR #5](https://github.com/Mohamed724000/kora/pull/5), au merge commit
[`8c3e65e2bcbffb53050b61cab4b953f108491db1`](https://github.com/Mohamed724000/kora/commit/8c3e65e2bcbffb53050b61cab4b953f108491db1).
Sprint 0.5 est fermé et fusionné via la
[PR #6](https://github.com/Mohamed724000/kora/pull/6), au merge commit
[`c080ec0529e758203d4326f7ec5b0b0159cbdad7`](https://github.com/Mohamed724000/kora/commit/c080ec0529e758203d4326f7ec5b0b0159cbdad7).
M0.1 et M0.2 sont fermés et fusionnés aux merge commits
[`79ceddc6cbf04b3d213001417da0841044af8206`](https://github.com/Mohamed724000/kora/commit/79ceddc6cbf04b3d213001417da0841044af8206)
et
[`40a224edc1dc018a080b6c188a804e361e96b5ef`](https://github.com/Mohamed724000/kora/commit/40a224edc1dc018a080b6c188a804e361e96b5ef).
Ce dernier SHA est la baseline exacte du Foundation Gate S0.6. S0.6 est fermé
et fusionné via la [PR #28](https://github.com/Mohamed724000/kora/pull/28), au
merge commit
[`a602fd38f32d018867c8a058deace0325b4a7c31`](https://github.com/Mohamed724000/kora/commit/a602fd38f32d018867c8a058deace0325b4a7c31),
qui constitue la baseline autorisée de S1.1.

## Preuves de fondation S0.5 à S0.6 hors exigences produit

| Fondation               | Implémentation                                  | Vérification                                                 |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| CI multi-OS             | `.github/workflows/*.yml`                       | `npm run ci:validate`, Actions réelles de la Draft PR        |
| Launcher Windows        | `scripts/run-workspace-task.mjs` inchangé       | tests dédiés + enfant contrôlé code 23                       |
| Supply-chain            | audits, licences, scan dépôt/historique         | `npm run security:scan`, `npm run licenses`, gates M0.1/M0.2 |
| Observabilité           | SDK désactivés sans DSN, callbacks de redaction | tests API, Web, Admin et Flutter                             |
| Contrat de santé        | `docs/api/openapi.yaml`                         | `npm run openapi:validate`                                   |
| Infrastructure locale   | Compose, PostgreSQL, Redis et probes API        | cycle de vie, reset ciblé et transitions de santé S0.6       |
| QA et design fondations | shells, états, goldens et builds                | trois `npm test`, cinq tests API ciblés et revue S0.6        |
| Rollback                | `docs/operations/FOUNDATION_ROLLBACK.md`        | revue documentaire S0.5                                      |

Ces preuves validaient uniquement les fondations. S1.1 avance exactement les
fondations de schéma et les deux design systems indiqués ci-dessous. Il ne
déclare aucune fonctionnalité runtime, sécurité métier ou donnée de seed.

## Exigences produit

| ID         | Source officielle (XLSX, colonne B)                  | Exigence synthétisée                               | Phase / lot source | Statut de spécification source | ADR ou arbitrage applicable                                        | Implémentation                                      | Vérification                | Preuve                                                 |
| ---------- | ---------------------------------------------------- | -------------------------------------------------- | -----------------: | ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| REQ-P0-01  | CdC §6 ; Engineering §4                              | Fondations du schéma de données                    |                 P0 | Specified                      | REG-18 à REG-31 ; décisions PO/CTO finance-intégrité du 2026-09-07 | Target model implemented — no migration             | Structurally verified       | Prisma, composites, carry BigInt                       |
| REQ-P1-01  | UI/UX §5                                             | Design system mobile                               |                 P1 | specified                      | Sources UI/UX ; REG-35                                             | Implemented — S1.1 primitives                       | Verified for S1.1 scope     | widgets, 341 px/200 %, golden                          |
| REQ-P1-02  | Back-Office §8                                       | Design system administration                       |                 P1 | specified                      | ADR-020                                                            | Implemented — S1.1 primitives                       | Verified for S1.1 scope     | DOM tests, keyboard/responsive styles                  |
| REQ-P1-03  | CdC §19                                              | Données de seed                                    |                 P1 | specified                      | Source Engineering ; aucun ADR spécifique                          | Not started                                         | Not verified                | —                                                      |
| REQ-P2-01  | CdC §8.1 ; UI/UX §4.6                                | Accueil mobile                                     |                 P2 | corrected v1.1                 | ADR-010 ; REG-15                                                   | Not started                                         | Not verified                | —                                                      |
| REQ-P2-02  | CdC §9.4 ; UI/UX §4.7                                | Découverte et recherche                            |                 P2 | specified                      | Source UI/UX                                                       | Not started                                         | Not verified                | —                                                      |
| REQ-P2-03  | UI/UX §4.8                                           | Parcours par catégorie                             |                 P2 | specified                      | Source UI/UX                                                       | Not started                                         | Not verified                | —                                                      |
| REQ-P2-04  | CdC §6.2 ; UI/UX §4.9                                | Détail d’un contenu                                |                 P2 | specified                      | ADR-007/011/016/017/021 : preview, cover contrôlée ; avis en V2    | Contracted — S1.2-01; runtime not started           | Verified contract gate      | cover sans URL ; ventes réglées réelles                |
| REQ-P2-05  | UI/UX §4.10                                          | Profil artiste                                     |                 P2 | specified                      | ADR-007/014                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P2-06  | CdC §4.5                                             | Web public                                         |                 P2 | specified                      | ADR-017 : aucune preview ni lecture web                            | Not started                                         | Not verified                | —                                                      |
| REQ-P3-01  | CdC §8.2 ; UI/UX §4.2                                | Connexion mobile                                   |                 P3 | specified                      | ADR-010                                                            | Contracted — S1.1; runtime not started              | Verified contract gate      | password proof, bound OTP context                      |
| REQ-P3-02  | CdC §8.2 ; UI/UX §4.3                                | Inscription                                        |                 P3 | specified                      | ADR-010                                                            | Contracted — S1.1; runtime not started              | Verified contract gate      | E.164, no account-existence oracle                     |
| REQ-P3-03  | Engineering §5.1.3 ; UI/UX §4.4                      | Vérification OTP                                   |                 P3 | specified                      | ADR-010                                                            | Contracted — S1.1; runtime not started              | Verified contract gate      | bound device/customer/session by purpose               |
| REQ-P3-04  | UI/UX §4.5                                           | Mot de passe oublié                                |                 P3 | specified                      | ADR-010                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P3-05  | CdC §17.2 ; Engineering §9.3                         | Session mono-appareil                              |                 P3 | specified                      | Source Engineering                                                 | Contracted — S1.1; runtime not started              | Verified target model       | composite device tenant; atomic revoke                 |
| REQ-P4-01  | CdC §13.2 ; UI/UX §4.11                              | Sélection du moyen de paiement                     |                 P4 | specified                      | ADR-012/022 : fournisseurs configurés et gate contractuel          | Primitive S1.1; runtime not started                 | Verified accessibility      | semantic radio group                                   |
| REQ-P4-02  | UI/UX §4.12                                          | Suivi du statut de paiement                        |                 P4 | specified                      | ADR-012/015 : `PaymentAttempt`, Inbox et Outbox                    | Primitive S1.1; runtime not started                 | Verified accessibility      | success/failure live region                            |
| REQ-P4-03  | UI/UX §4.13                                          | Liste des achats                                   |                 P4 | specified                      | ADR-016 : accès piloté par `Entitlement`                           | Not started                                         | Not verified                | —                                                      |
| REQ-P4-04  | UI/UX §4.14                                          | Commande et reçu                                   |                 P4 | specified                      | ADR-012/013/016 : tentatives, ledger, remboursement et droit       | Not started                                         | Not verified                | —                                                      |
| REQ-P5-01  | CdC §14 ; UI/UX §4.20                                | Fidélité mobile                                    |                 P5 | specified                      | ADR-013 : effet des remboursements                                 | Not started                                         | Not verified                | —                                                      |
| REQ-P5-02  | CdC §14.5 ; Back-Office §6.20                        | Classement de fidélité                             |                 P5 | specified                      | ADR-013 : un remboursement ne déclasse pas le palier atteint       | Not started                                         | Not verified                | —                                                      |
| REQ-P5-03  | CdC §14.3 ; Back-Office §6.21                        | Seuils de fidélité                                 |                 P5 | specified                      | Source produit                                                     | Not started                                         | Not verified                | —                                                      |
| REQ-P6-01  | CdC §12.1 ; UI/UX §4.15                              | Mini-lecteur                                       |                 P6 | specified                      | ADR-017 : `PreviewGrant` et descripteur signé, mobile uniquement   | Primitive S1.1; runtime not started                 | Verified accessibility      | unique media/state description and actions             |
| REQ-P6-02  | UI/UX §4.16                                          | Lecteur audio complet                              |                 P6 | specified                      | ADR-011/016/017 : contenu, droit et descripteur signé              | Primitive S1.1; runtime not started                 | Verified accessibility      | unique media/state description and actions             |
| REQ-P6-03  | UI/UX §4.17                                          | Lecteur vidéo                                      |                 P6 | specified                      | ADR-011/016/017                                                    | Not started                                         | Not verified                | —                                                      |
| REQ-P6-04  | UI/UX §4.18                                          | Lecteur de livre                                   |                 P6 | specified                      | ADR-011/016                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P7-01  | CdC §12.3 ; Engineering §9.7                         | Téléchargement et licence hors ligne               |                 P7 | specified                      | ADR-018                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P7-02  | Engineering §5.6.2                                   | Révocation hors ligne                              |                 P7 | specified                      | ADR-016/018/020 : le support ne révoque pas le droit ou la session | Not started                                         | Not verified                | —                                                      |
| REQ-P8-00a | Back-Office §6.1                                     | Connexion administration                           |                 P8 | Corrected V1.1                 | ADR-002/005/008/020                                                | Not started                                         | Not verified                | —                                                      |
| REQ-P8-00b | Back-Office §6.2 ; Addendum §1.3.2-3                 | Enrôlement TOTP                                    |                 P8 | New V1.1                       | ADR-002/005                                                        | Target data — S1.2-01; runtime not started          | Verified target model       | secret TOTP chiffré ; horodatage d’enrôlement          |
| REQ-P8-00c | Back-Office §6.2bis ; Addendum §1.3.4                | Connexion TOTP                                     |                 P8 | Corrected V1.1                 | ADR-002/005/008                                                    | Target data — S1.2-01; runtime not started          | Verified contract/data gate | TOTP chaque login ; cookie protégé ; session révocable |
| REQ-P8-00d | Back-Office §6.2ter ; Addendum §1.3.5-6              | Codes de récupération                              |                 P8 | New V1.1                       | ADR-002/005                                                        | Target data — S1.2-01; runtime not started          | Verified target model       | 10 hashes Argon2id ; consommation unique               |
| REQ-P8-00e | Back-Office §6.3                                     | Session expirée                                    |                 P8 | specified                      | ADR-005/008                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P8-00f | Back-Office §6.4 ; Addendum §1.3.7                   | Récupération d’accès                               |                 P8 | Corrected V1.1                 | ADR-002/005/008                                                    | Not started                                         | Not verified                | —                                                      |
| REQ-P8-00g | Back-Office §6.5                                     | Accès refusé                                       |                 P8 | specified                      | ADR-020                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-01  | Back-Office §6.6 ; Addendum §3                       | Tableau de bord administration                     |                 P8 | Corrected V1.1                 | ADR-003/020                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P8-02  | CdC §16.1 ; Back-Office §6.7                         | Liste des utilisateurs                             |                 P8 | specified                      | ADR-020                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-03  | Back-Office §6.8 ; Addendum §5                       | Détail utilisateur, blocage et sessions            |                 P8 | Corrected V1.1                 | ADR-005/008/020 : le support ne bloque ni ne révoque les sessions  | Not started                                         | Not verified                | —                                                      |
| REQ-P8-04  | CdC §16.1 ; Back-Office §6.9                         | Liste des artistes                                 |                 P8 | specified                      | ADR-020                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-05  | CdC §15.1 ; Engineering §5.9.1                       | Création d’un compte artiste                       |                 P8 | specified                      | ADR-020                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-06  | Engineering §5.9.2 ; Back-Office §6.11 ; Addendum §5 | Détail artiste, contenus et paiements              |                 P8 | Corrected V1.1                 | ADR-014/020 : `artistRevenueShareBps` et moindre privilège         | Not started                                         | Not verified                | —                                                      |
| REQ-P8-07  | CdC §8.6 ; Engineering §5.9.3 ; Back-Office §6.12    | Liste des contenus                                 |                 P8 | specified                      | ADR-020                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-08  | Engineering §5.9.3-4 ; Back-Office §6.13             | Création, édition et publication d’un contenu      |                 P8 | specified                      | ADR-011/019/020 : administration seule, audit et provenance        | Contract/data target — S1.2-01; runtime not started | Verified contract gate      | provenance et republication append-only                |
| REQ-P8-09  | CdC §15.2 ; UI/UX §4.24                              | Tableau de bord artiste mobile en lecture seule    |                 P8 | specified                      | ADR-014                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-10  | UI/UX §4.24bis                                       | Statistiques artiste                               |                 P8 | specified                      | ADR-014                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P8-11  | CdC §15.4 ; UI/UX §4.25                              | Demande de paiement artiste                        |                 P8 | specified                      | ADR-014                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P9-01  | Back-Office §6.14-15 ; Addendum §5                   | Commandes dans l’administration                    |                 P9 | corrected v1.1                 | ADR-012/020 : plusieurs `PaymentAttempt` immuables                 | Not started                                         | Not verified                | —                                                      |
| REQ-P9-02  | Engineering §5.10.7 ; Back-Office §6.16              | Liste des paiements                                |                 P9 | specified                      | ADR-012/013/015/020                                                | Not started                                         | Not verified                | —                                                      |
| REQ-P9-03  | Back-Office §6.17 ; Addendum §5                      | Rapprochement, nouvelle tentative et remboursement |                 P9 | corrected                      | ADR-012/013/015/016                                                | Not started                                         | Not verified                | —                                                      |
| REQ-P9-04  | CdC §13.1 ; Engineering §5.4                         | Fournisseurs de paiement réels                     |                 P9 | specified                      | ADR-022 : gate contractuel obligatoire                             | Not started                                         | Not verified                | —                                                      |
| REQ-P9-05  | Back-Office §6.18 ; Addendum §5                      | Soldes et partage de revenus artiste               |                 P9 | corrected                      | ADR-014 : `artistRevenueShareBps`                                  | Not started                                         | Not verified                | —                                                      |
| REQ-P9-06  | Engineering §5.10.8 ; Back-Office §6.19              | Workflow des paiements artistes                    |                 P9 | specified                      | ADR-014                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P10-01 | CdC §17.1 ; Engineering §9.9                         | Watermark                                          |                P10 | specified                      | ADR-011/017/018                                                    | Not started                                         | Not verified                | —                                                      |
| REQ-P10-02 | CdC §17.1 ; Engineering §9.10                        | Mesures anti-capture                               |                P10 | specified                      | ADR-024 : protection réaliste, sans garantie absolue               | Not started                                         | Not verified                | —                                                      |
| REQ-P10-03 | UI/UX §4.21                                          | Gestion des sessions sur mobile                    |                P10 | specified                      | ADR-010                                                            | Not started                                         | Not verified                | —                                                      |
| REQ-P10-04 | CdC §17 ; Engineering §5.10.9 ; Back-Office §6.22    | Centre de sécurité administration                  |                P10 | specified                      | ADR-002/005/008/020                                                | Not started                                         | Not verified                | —                                                      |
| REQ-P10-05 | CdC §16 ; Addendum §4                                | Journal d’audit                                    |                P10 | corrected                      | ADR-004/019                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P10-06 | UI/UX §4.22                                          | Notifications mobile                               |                P10 | specified                      | ADR-021 : modèles de notification dédiés                           | Not started                                         | Not verified                | —                                                      |
| REQ-P10-07 | Back-Office §6.23-24 ; Addendum §5                   | Notifications administration                       |                P10 | corrected                      | ADR-021 : modèles de notification dédiés                           | Not started                                         | Not verified                | —                                                      |
| REQ-P10-08 | CdC §16.1 ; Back-Office §6.25 ; Addendum §2.5        | Catalogue de référence et bannières                |                P10 | corrected                      | ADR-006/011                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P10-09 | CdC §16.1 ; Back-Office §6.26 ; Addendum §2.6        | Configuration de la plateforme                     |                P10 | corrected                      | ADR-006/014 : `artistRevenueShareBps`                              | Not started                                         | Not verified                | —                                                      |
| REQ-P10-10 | UI/UX §4.23                                          | Support mobile                                     |                P10 | specified                      | ADR-007/020                                                        | Not started                                         | Not verified                | —                                                      |
| REQ-P11-01 | Engineering §11.6 ; Back-Office §12                  | Tests E2E Playwright                               |                P11 | specified                      | Definition of Done et exigences source                             | Not started                                         | Not verified                | —                                                      |
| REQ-P11-02 | Engineering §11.2-3                                  | Tests widget et golden                             |                P11 | specified                      | Definition of Done et exigences source                             | Not started                                         | Not verified                | —                                                      |
| REQ-P11-03 | Back-Office §12 ; Addendum                           | Accessibilité et responsive administration         |                P11 | specified                      | ADR-020 et Definition of Done                                      | Not started                                         | Not verified                | —                                                      |
| REQ-P11-04 | CdC §22                                              | Acceptation du MVP                                 |                P11 | specified                      | Definition of Done                                                 | Not started                                         | Not verified                | —                                                      |
| REQ-P12-01 | Engineering §12                                      | CI/CD                                              |                P12 | specified                      | Master Blueprint et Definition of Done                             | Not started                                         | Not verified                | —                                                      |
| REQ-P12-02 | Engineering §2.9                                     | Monitoring                                         |                P12 | specified                      | ADR-019 et Threat Model                                            | Not started                                         | Not verified                | —                                                      |

La validation S1.1 des primitives ne vaut pas livraison complète de la
localisation. `AppLocalizations`, les ressources de langues et leur intégration
runtime restent explicitement différées au lot mobile planifié ; S1.1-R1
n’ajoute ni manifeste ni dépendance et reçoit ses nouveaux libellés d’état par
l’appelant.

## Contrôles S1.2-01 — Contract & Data Readiness Gate

| ID             | Contrôle                                                   | État               | Preuve attendue                                                                                           |
| -------------- | ---------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| GOV-S1.2-01-01 | Surface OpenAPI exacte et sans runtime                     | Vérifié localement | 34 chemins, 40 opérations, 87 schémas, 18 invariants                                                      |
| GOV-S1.2-01-02 | Couverture contrôlée versionnée et ventes non synthétiques | Vérifié localement | paramètre version obligatoire, schémas fermés, dérivation et tests négatifs                               |
| GOV-S1.2-01-03 | TOTP, sessions et récupération admin cibles                | Vérifié localement | ADR-002/005/008, trois modèles, relations `Restrict`, récupération/reset audités                          |
| GOV-S1.2-01-04 | Provenance catalogue et audit même session                 | Vérifié localement | champs serveur-only, clés composites, preuve audit complète ; immutabilité SQL exigée avant runtime       |
| GOV-S1.2-01-05 | Inbox Mux authentifiée, chiffrée et non publiante          | Vérifié localement | références upload/asset uniques, déduplication et tests négatifs ; limite corps à approuver avant runtime |
| GOV-S1.2-01-06 | Aucun runtime, migration, seed ou média                    | Vérifié localement | diff et [rapport S1.2-01](SLICE_1_2_01_CONTRACT_AND_DATA_READINESS_GATE_REPORT.md)                        |

## Contrôles S1.2-02 — Canonical PostgreSQL Baseline

| ID             | Contrôle                                  | État                | Preuve attendue                                                                                                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GOV-S1.2-02-01 | Matérialisation des 33 modèles canoniques | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; baseline Prisma déterministe, 33 tables et historique de deux migrations                                                                                                                                                                                                             |
| GOV-S1.2-02-02 | Relations composites et isolation         | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; 54 FK contrôlées et test négatif inter-client SQLSTATE `23503`                                                                                                                                                                                                                       |
| GOV-S1.2-02-03 | Publication et provenance                 | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; index actif partiel, contrôle différé des deux assets `READY`, provenance et preuves immuables                                                                                                                                                                                       |
| GOV-S1.2-02-04 | Finance et audit append-only              | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; 47 `CHECK`, 33 fonctions, 45 triggers, sources financières liées et 63 tests négatifs causaux                                                                                                                                                                                        |
| GOV-S1.2-02-05 | Reproductibilité PostgreSQL               | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; deux bases vides, second passage sans attente, inventaires identiques et signature `bdfbbec0…`                                                                                                                                                                                       |
| GOV-S1.2-02-06 | Nettoyage et périmètre                    | Clôturé et fusionné | preuve locale prépublication du 2026-09-15 ; suppression ciblée des deux bases et du conteneur `tmpfs`; aucun endpoint, runtime, seed, manifeste, lockfile ou workflow                                                                                                                                                            |
| GOV-S1.2-02-07 | Publication Git                           | Vérifié post-fusion | PR #43 fusionnée et fermée ; merge `4a1f4306871cac661fa12d4f326495fc43cddbb4`, parents ordonnés `dfb6445cb157b03142b7f1b01952fa76fdef16f9` et `2022f5a229c8cb5138205f5fb02d37ea344ef73b`, arbre `95a9036ec5e287b78cdd2771010509d24292fa29` ; un commit publié `2022f5a229c8cb5138205f5fb02d37ea344ef73b` et 14 fichiers préservés |
| GOV-S1.2-02-08 | Workflows post-fusion                     | Vérifié post-fusion | `push/main`, tous `completed/success` : Infrastructure `34986168463`, Launcher Windows `34986168571`, Security `34986168621`, Quality Linux `34986168424`                                                                                                                                                                         |
| GOV-S1.2-02-09 | Distribution et lot suivant               | Vérifié post-fusion | aucun tag, release ou déploiement ; aucun endpoint, service, worker, seed, runtime métier ou interface livré ; S1.2-03 `Not started`, analyse soumise à décision séparée, S1.2-03A ni autorisé ni démarré                                                                                                                         |

Cette dernière ligne reste le constat historique de clôture S1.2-02. Une
autorisation Product Owner séparée a démarré S1.2-03A le 2026-09-16 depuis le
merge `main` `95bdfcf30a14e05ae90b09150cf289e1e0343c0d`.

## Contrôles S1.2-03A — PostgreSQL Least-Privilege Runtime Boundary

Dans la chronologie R0 à R9 de cette section, les mentions `Draft`, ouverte ou
non fusionnée sont des preuves historiques rattachées au head cité ; elles ne
décrivent pas l’état courant après la clôture post-fusion.

| ID              | Contrôle                                  | État                  | Preuve attendue                                                                                                                                           |
| --------------- | ----------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GOV-S1.2-03A-01 | Séparation propriétaire/runtime           | Vérifié localement R8 | identifiants et secrets distincts ; rôle runtime non propriétaire, `NOINHERIT`, sans attribut administratif ni membership                                 |
| GOV-S1.2-03A-02 | Prisma 7.9.1 et attestation au démarrage  | Vérifié localement R8 | `@prisma/adapter-pg` 7.9.1 sur pool runtime ; API accepte le rôle lecture et refuse le propriétaire/migrateur avant `application.init()`                  |
| GOV-S1.2-03A-03 | Privilèges effectifs et héritage `PUBLIC` | Vérifié localement R8 | `CONNECT`, `USAGE public`, `SELECT public` sans redélégation ; schémas, colonnes, vues, types, large objects, `MAINTAIN` et ACL par défaut contrôlés      |
| GOV-S1.2-03A-04 | Refus des mutations et élévations         | Vérifié localement R8 | SQLSTATE `42501` pour DDL, `TRUNCATE`, trigger, `SET ROLE`, réplication, écritures métier et quatre routines large-object, sur deux bases                 |
| GOV-S1.2-03A-05 | Idempotence et nettoyage ciblé            | Vérifié localement R8 | par base : 52 provisionnements réussis, 43 refus déterministes à signature inchangée, 4 grant options et 1 default ACL `L` réparées ; nettoyage ciblé     |
| GOV-S1.2-03A-06 | Dépendance, licence et audit              | CI R8 verte           | graphe inchangé ; Security R8 : audits npm complet/production à 0 vulnérabilité, 1 141 paquets, 0 non déclaré et 0 non approuvé                           |
| GOV-S1.2-03A-07 | Périmètre et publication contrôlée        | Clôturé et fusionné   | baseline technique R8 `82d1655f…` préservée ; R9 documentaire `fc3c3e75…` ; PR #45 fusionnée et fermée au merge `8e2e9252…`                               |
| GOV-S1.2-03A-08 | Reproductibilité du client Prisma en CI   | R1 publié             | clone neuf après `npm ci` : client absent, puis génération automatique et succès indépendants de typecheck, build et 26 tests API                         |
| GOV-S1.2-03A-09 | Identité du smoke Infrastructure          | R2 publié et vert     | migrations propriétaire ; refus propriétaire explicite ; API runtime saine ; fatal fail-fast neutralisé ; quatre workflows R2 réussis                     |
| GOV-S1.2-03A-10 | Schémas non système                       | R4 vérifié localement | propriété exhaustive, `PUBLIC CREATE`, privilèges objets/colonnes/séquences/routines/types et default ACL tiers isolément refusés sur deux bases          |
| GOV-S1.2-03A-11 | Oracle de refus propriétaire              | R5 publié et CI verte | erreur typée, attribut administratif et droits d’écriture obligatoires ; code de propriété non exigé par cet oracle, détection R4 testée séparément       |
| GOV-S1.2-03A-12 | ACL de paramètres PostgreSQL              | R6 vérifié localement | `SET`/`ALTER SYSTEM` directs ou via `PUBLIC`, et option de redélégation, refusés par l’API et le provisionneur avant mutation sur deux bases              |
| GOV-S1.2-03A-13 | Propriétaire des privilèges par défaut    | R6 vérifié localement | exception `SELECT public` réservée au propriétaire de base ; ACL tierce refusée à signature inchangée ; future table tierce non lisible après remédiation |
| GOV-S1.2-03A-14 | Large objects PostgreSQL 18               | Vérifié localement R8 | propriété, ACL, routines `lo_*`/`loread`/`lowrite`, `lo_compat_privileges=off` et default ACL `L` contrôlés ; ACL tierces inchangées                      |
| GOV-S1.2-03A-15 | Rôle de réplication effectif              | Vérifié localement R8 | `origin` exigé sur la connexion Prisma ; réglages base, rôle et rôle/base hérités par une nouvelle connexion isolément refusés sans mutation              |
| GOV-S1.2-03A-16 | ACL des catalogues large-object           | Vérifié localement R8 | droits relation/colonne directs, `PUBLIC`, hérités et redélégables refusés ; visibilité standard des métadonnées admise, chunks non lisibles              |
| GOV-S1.2-03A-17 | Défauts cluster masqués                   | Vérifié localement R8 | overrides propriétaire rôle et rôle/base refusés pour les deux paramètres ; valeur dangereuse prouvée sur une nouvelle connexion runtime, sans mutation   |
| GOV-S1.2-03A-18 | Workflows post-fusion                     | Vérifié post-fusion   | `push/main`, tous `completed/success` : Infrastructure `36278873811`, Launcher Windows `36278873882`, Security `36278873863`, Quality Linux `36278873968` |
| GOV-S1.2-03A-19 | Distribution et lot suivant               | Vérifié post-fusion   | aucun tag, release ou déploiement ; branche et worktree S1.2-03A préservés ; S1.2-03B `Not started`, soumis à une autorisation CTO séparée                |

Le [rapport S1.2-03A](SLICE_1_2_03A_POSTGRESQL_RUNTIME_BOUNDARY_REPORT.md)
porte le détail reproductible. Les fonctionnalités métier S1.2-03B+ restent
`Not started`. Les runs initiaux de la Draft PR #45 ont réussi pour Security
`35119052015` et échoué pour Infrastructure `35119052104`, Launcher Windows
`35119052049` et Quality Linux `35119052101`. Les échecs R0 sont historiques.
La correction GOV-S1.2-03A-08 est intégrée par R1 ; aucun run initial n’est
relancé et la preuve des nouveaux runs distincts est portée par la Draft PR #45. Au head R1
`41b3d8f33a637108814208258a3e99b105be1afc`, Launcher Windows `35155026009`,
Security `35155025993` et Quality Linux `35155026016` sont
`completed/success`, tandis que l’échec historique Infrastructure R1
`35155026285` est `completed/failure`. GOV-S1.2-03A-09 conserve comme preuve
historique l’instantané local R2 du 2026-09-16, antérieur au commit : le smoke
ne confond plus le propriétaire/migrateur avec le rôle runtime et remonte une sortie
fatale neutralisée sans attendre un timeout.

R2 est ensuite publié au head
`9d163cc34caa57cd671b6783048d89dde6d18069`. Infrastructure `35162113781`,
Launcher Windows `35162113686`, Security `35162113920` et Quality Linux
`35162113691` sont tous `pull_request/completed/success` sur ce SHA exact. La
PR #45 reste ouverte, Draft et non fusionnée ; S1.2-03B reste `Not started`.
L’instantané local prépublication de la réconciliation R3 du 2026-09-17 a été
établi alors qu’aucun commit, push, changement de PR, rerun, Ready ou merge R3
n’avait été effectué ; aucun SHA ou Run ID R3 futur n’y était affirmé.

R3 est ensuite publié au head
`8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`. Infrastructure `35209186465`,
Launcher Windows `35209186447`, Security `35209186482` et Quality Linux
`35209186464` sont tous `pull_request/completed/success` sur ce SHA. La revue
CTO postérieure bloque la fusion et autorise R4. La correction du corps de PR
porte le compteur R1 à `+118/-42` tout en conservant le cumul R3
`4 commits, 28 fichiers, +2761/-187`.

L’instantané historique R4 du 2026-09-18 a été établi localement avant
publication. Les tests réels sur deux bases isolent et rejettent propriété runtime, `CREATE` via
`PUBLIC`, droits de table, colonne, séquence, routine, type et default ACL tiers,
sans normalisation automatique des ACL tierces. Quatre cas `WITH GRANT OPTION`
sont détectés puis réparés. Au moment de cet instantané, aucun commit, push,
rerun, Ready ou merge R4 n’avait été effectué ; S1.2-03B reste `Not started`.

R4 est ensuite publié au head
`ebcd3fc02c15b0ee9cf679978ab197e9865a1737`. Launcher Windows `35402506744`,
Security `35402506756` et Quality Linux `35402506746` sont
`completed/success`; Infrastructure `35402506742` est `completed/failure`.
L’instantané R5 local du 2026-09-18 explique l’absence de
`runtime_owns_database_object` par l’absence de dépendance `pg_shdepend` pour le
propriétaire initial pourtant présent dans `pg_database.datdba`. Le smoke
conserve l’erreur typée et les preuves administratives et d’écriture
obligatoires. Aucun SHA ou Run ID R5 futur n’y est affirmé ; à la date de cet
instantané, aucun commit, push, rerun, changement de PR, Ready ou merge R5
n’avait été effectué.

R5 est ensuite publié au head
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`. Infrastructure `35454834845`,
Launcher Windows `35454834879`, Security `35454834839` et Quality Linux
`35454834904` sont tous `pull_request/completed/success` sur ce SHA. Le cumul
GitHub observé est 6 commits, 31 fichiers et `+4299/-201`; la PR #45 reste
ouverte, Draft et non fusionnée.

L’instantané historique local prépublication R6 du 2026-09-20 distingue les preuves R5
publiées des nouveaux contrôles locaux. Les cinq scénarios d’ACL de paramètres
— `SET` et `ALTER SYSTEM` directs ou via `PUBLIC`, plus redélégation — sont
refusés sur chacune des deux bases avant toute mutation du provisionneur. Une
default ACL `SELECT` créée pour le runtime par le rôle tiers est également
refusée à signature inchangée, tandis que la règle normale du propriétaire de
base est acceptée et qu’une future table tierce reste non lisible après
remédiation explicite de cette ACL. Aucun SHA ou
Run ID R6 futur n’y était affirmé ; S1.2-03B restait `Not started`.

R6 est ensuite publié au head
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`. Infrastructure `36125459701`,
Launcher Windows `36125459563`, Security `36125459520` et Quality Linux
`36125459526` sont tous `pull_request/completed/success` sur ce SHA exact. Le
cumul GitHub observé est 7 commits, 31 fichiers et `+4700/-201` ; la PR #45
reste ouverte, Draft et non fusionnée.

L’instantané historique local prépublication R7 du 2026-09-25 répond au BLOCK
CTO post-R6. Sur chacune des deux bases PostgreSQL 18.4, cinq états courants de
large objects, une default ACL `L` tierce, un droit direct sur `lo_create`,
`lo_compat_privileges=on` et les trois portées persistantes de
`session_replication_role=replica` sont refusés séparément avant mutation et à
signature inchangée. La default ACL `L` du propriétaire est normalisée, une
ACL de routine tierce reste intacte et quatre appels large-object sont refusés
`42501`. Les compteurs par base sont 36 provisionnements réussis, 27 refus
inchangés, quatre grant options réparées, une default ACL `L` normalisée et
douze refus `42501`. Au moment de cet
instantané, R7 est local, non commité et non publié ; aucun SHA ou Run ID R7
futur n’est affirmé et S1.2-03B reste `Not started`.

R7 est ensuite publié au head
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`. Infrastructure `36167761862`,
Launcher Windows `36167761974`, Security `36167761909` et Quality Linux
`36167761881` sont tous `pull_request/completed/success` sur ce SHA exact. Le
cumul GitHub observé est 8 commits, 31 fichiers et `+5770/-201` ; la PR #45
reste ouverte, Draft, `CLEAN/MERGEABLE` et non fusionnée.

L’instantané historique local prépublication R8 du 2026-09-26 prouve sur deux
bases 24 ACL de catalogue brutes appliquées puis refusées par l’API et le
provisionneur : 14 grants effectifs, quatre ACL non effectives persistées et six
ACL `SELECT` de métadonnées redondantes. Huit scénarios démontrent qu’un
override propriétaire sûr ne doit pas masquer un défaut cluster dangereux de
`session_replication_role` ou `lo_compat_privileges`. Les signatures de rôle,
membership, ACL, paramètres et credential restent inchangées lors des refus.
Les compteurs cumulés sont 104 provisionnements réussis, 86 refus sans mutation
et 24 refus `42501`. R8 reste local, non indexé, non commité et non publié ;
aucun SHA ou Run ID R8 futur n’est affirmé et S1.2-03B reste `Not started`.

R8 est ensuite publié au commit
`82d1655f3f6700f4bbfac76413e2b0de0757b7a9`, parent
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, arbre
`8e1e648feb20e092ba50c2783611232a96407051`, message
`fix(security): attest PostgreSQL catalog ACLs and masked settings`, avec 13
fichiers et `+1374/-68`. Infrastructure `36260566060`, Launcher Windows
`36260566119`, Security `36260566203` et Quality Linux `36260566159` sont tous
`pull_request/completed/success` sur ce head exact. Le cumul observé après R8
est de 9 commits, 31 fichiers et `+7076/-201`.

La revue CTO finale post-R8 conclut GO pour architecture/données et pour
sécurité/intégrité PostgreSQL. Dans cet état historique, la PR #45 demeurait
ouverte, Draft, `CLEAN/MERGEABLE` et non fusionnée. La baseline technique
S1.2-03A publiée reste R8.

R9 a ensuite publié les six documents réconciliés au commit
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`, parent direct de R8. Les workflows
`pull_request` R9 Infrastructure `36277785889`, Launcher Windows `36277785803`,
Security `36277785832` et Quality Linux `36277785782` ont tous conclu
`completed/success`.

La PR #45, totalisant 10 commits et 31 fichiers, est désormais fusionnée et
fermée dans `main` au merge `8e2e9252a0ac6faa1a7aa44e08e82e07317f4d86`,
arbre `d1ccbc5587f136baf2247a4055544477ec344555`, avec les parents ordonnés
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d` puis
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`. Les quatre workflows post-fusion
`push/main` Infrastructure `36278873811`, Launcher Windows `36278873882`,
Security `36278873863` et Quality Linux `36278873968` ont tous conclu
`completed/success` sur ce merge. Aucun tag, release ou déploiement n’a été
créé ; la branche et le worktree S1.2-03A sont préservés.

S1.2-03A est entièrement clôturé sans nouvelle promesse runtime. La présente
réconciliation documentaire consigne les preuves post-fusion ; son état de
publication est vérifiable dans GitHub et ne modifie pas la baseline technique
S1.2-03A. À cette clôture historique, S1.2-03B restait `Not started` et exigeait
une autorisation CTO séparée.

## Contrôles de gouvernance de Sprint 0.1

| ID          | Contrôle                                                        | État     | Preuve attendue                                           |
| ----------- | --------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| GOV-S0.1-01 | Baseline clean-room et archive AdminLTE canonique               | Vérifié  | Rapport validé du Lot 00C et manifeste de baseline        |
| GOV-S0.1-02 | Seize artefacts de gouvernance autorisés, complets et cohérents | Verified | Validation documentaire de Sprint 0.1                     |
| GOV-S0.1-03 | Dépôt Git local initialisé sur `main`                           | Verified | Métadonnées Git locales                                   |
| GOV-S0.1-04 | Premier commit local unique                                     | Verified | Commit `44505233361ecd9b13dbae82deb69e5c47f0d65e`         |
| GOV-S0.1-05 | Remote officiel unique ; aucun tag ou hook actif                | Verified | `origin` vers `https://github.com/Mohamed724000/kora.git` |
| GOV-S0.1-06 | Aucun secret ou artefact applicatif introduit                   | Verified | Scans de Sprint 0.1                                       |

## Contrôles de gouvernance de Sprint 0.2

| ID          | Contrôle                                                 | État     | Preuve attendue                                                                |
| ----------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| GOV-S0.2-01 | Contrat racine privé et versions verrouillées            | Verified | `package.json`, `.nvmrc` et `package-lock.json` ; revue CTO PASS sur PR #1     |
| GOV-S0.2-02 | Validation Node/npm sans dépendance                      | Verified | `npm.cmd run env:check` retourne le code 0 ; revue CTO PASS sur PR #1          |
| GOV-S0.2-03 | Neuf zones canoniques réservées sans package applicatif  | Verified | Inventaire des zones et scan des manifestes enfants ; revue CTO PASS sur PR #1 |
| GOV-S0.2-04 | Zéro dépendance, code métier ou source immuable modifiée | Verified | Lockfile vide, scans du dépôt et manifeste 52/52 ; revue CTO PASS sur PR #1    |

## Contrôles de gouvernance de Sprint 0.3

| ID          | Contrôle                                                              | État                                            | Preuve attendue                                                                                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GOV-S0.3-01 | Fondations Flutter, Next.js, NestJS et packages partagés, sans métier | Closed and merged — CTO technical review passed | Sources applicatives, tests de fondation, audit contractuel, rapport d’exécution S0.3, PR #2, commit de clôture `c4bce826b8a16d78aa2b10865e0d03d191ea7f46` et merge commit `d3f837c93044d0b514c2abd732c559cdd6543a96`                                          |
| GOV-S0.3-02 | Format, lint, typecheck et tests des six workspaces et du mobile      | Verified                                        | Commandes racine et Flutter terminées avec code 0                                                                                                                                                                                                              |
| GOV-S0.3-03 | Builds et smokes applicatifs                                          | Verified on Android/Windows — CTO passed        | Builds web/admin/API/packages et smokes HTTP vérifiés ; readiness borné par `READINESS_TIMEOUT_MS` avec réponse 503 sûre ; APK debug construit après installation du NDK autorisé ; iOS non exécuté sous Windows et validation macOS requise avant release iOS |
| GOV-S0.3-04 | Inventaires de dépendances et licences                                | Approved for locked S0.3 scope                  | Audits npm complet/production à zéro ; audit Security/Supply Chain PASS technique ; chemins LGPL/MPL/EPL/CC-BY documentés ; gate juridique/licences approuvé sur attestation du Product Owner pour le périmètre verrouillé actuel                              |
| GOV-S0.3-05 | Validation visuelle des shells                                        | Approved for S0.3 foundation only               | Goldens mobiles, navigation et contraste Admin vérifiés ; quatre captures runtime Playwright Web/Admin avec dimensions et SHA-256 ; approbation Product Owner limitée au shell de fondation, pas au design final                                               |
| GOV-S0.3-06 | Intégrité clean-room, sources immuables et absence de métier          | Verified                                        | Manifeste 52/52, scans finaux, aucun métier prématuré ; rapports Foundation/Security/Design et document de clôture S0.3                                                                                                                                        |
| GOV-S0.3-07 | Readiness et journalisation défensive                                 | Verified — CTO passed                           | Timeout global et délais clients PostgreSQL/Redis ; probe bloquée et rejet tardif testés ; `msg` Nest fixe et chaînes token/DSN/password/OTP/email/phone assainies sur toutes les méthodes                                                                     |

## Règles de mise à jour

- Une exigence ne passe à `Implémentée` qu’avec une preuve versionnée.
- Une exigence ne passe à `Vérifiée` qu’après exécution du contrôle prévu et
  enregistrement de son résultat.
- Une évolution contradictoire avec une source immuable exige une décision
  explicite du Product Owner et, lorsque nécessaire, un nouvel ADR.
- Les identifiants sources ne sont ni renommés ni réutilisés.

## Traçabilité S1.2-03B — Admin Security Contract Gate

Qualification : **instantané historique prépublication du 2026-09-29**.

| Exigence                                                | Contrat / décision                 | Preuve locale                                                                  | État              |
| ------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| SEC-ADM-01 Surface exacte 60/67 et slices 12/15         | `docs/api/openapi.yaml`            | validateur + tests d'inventaire                                                | Contract verified |
| SEC-ADM-02 Login/TOTP/CSRF/Origin sans oracle           | OpenAPI + ADR-025                  | `X-Kora-CSRF`, AND/OR, Origin, Fetch et timings publics                        | Contract verified |
| SEC-ADM-03 QR TOTP à livraison unique                   | `deliverAdminTotpEnrollmentQr`     | media/header/secret/idempotency mutations                                      | Contract verified |
| SEC-ADM-04 Codes sélecteur+vérificateur, exactement dix | schémas `AdminRecoveryCode*`       | tests de bornes et surface générée                                             | Contract verified |
| SEC-ADM-05 Refresh RS256/rotation/replay/familles       | politique admin + ADR-025          | `AUTH_REFRESH_INVALID`, cookies et limites verrouillés                         | Contract verified |
| SEC-ADM-06 Récupération assistée à trois parties        | routes recovery-cases + ADR-025    | approbateur + annulation serveur auditée sans 28e route                        | Contract verified |
| SEC-ADM-07 Audit XOR, preuve et acteur/sujet            | `AdminAuditLogEntry` + ADR-025     | union + SYSTEM autonome/délégué + preuve/causalité                             | Contract verified |
| SEC-ADM-08 Exports audit privés                         | routes audit-log-exports           | payload JCS UTF-8, signing input RFC 7515, JWS Ed25519 détaché et ZIP bijectif | Contract verified |
| SEC-ADM-09 Invitations et administration RBAC           | invitations/users                  | deny-by-default, no self-change, dernier super-admin                           | Contract verified |
| SEC-ADM-10 Moindre privilège historique                 | cinq opérations Artist/Audio/Media | test de réintroduction `SUPPORT`                                               | Contract verified |
| SEC-ADM-11 Aucun runtime ni migration                   | allowlist S1.2-03B                 | preuve Git et scan domaines interdits                                          | Verified locally  |
| SEC-ADM-12 Lecture audit conforme ADR-004               | filtres admin/action/entité/date   | mutations filtre + paramètres générés                                          | Contract verified |
| SEC-ADM-13 Sinks succès/échec par opération             | `AdminSecurityEvent` / `AuditLog`  | mutation routage échec sans contexte + atomicité                               | Contract verified |
| SEC-ADM-14 Rate limit et réponses sensibles             | quatre profils + headers           | profil/429/Retry-After/no-store + timing anti-oracle                           | Contract verified |

Les états ci-dessus attestent uniquement le contrat. Les garanties runtime, SQL
et interface restent `Not started` jusqu'aux autorisations S1.2-03C1/C2/C3.

## Traçabilité S1.2-03C1 — préparation contractuelle locale

Qualification : **arbitrages CTO C1 matérialisés dans le contrat ; aucune
preuve runtime ou PostgreSQL**.

| Exigence                                                   | Contrat / décision                           | Preuve contractuelle attendue                                                     | État                      |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| SEC-ADM-C1-PREP-01 Audit enrollment/QR selon contexte      | OpenAPI + ADR-025 amendé                     | sinks succès/échec explicites, preuve serveur, mutations adversariales            | Contract prepared locally |
| SEC-ADM-C1-PREP-02 Rotation avec TOTP inline purpose-bound | `rotateAdminRecoveryCodes`                   | métadonnées générées, absence de pré-step-up/second OTP, compteur global          | Contract prepared locally |
| SEC-ADM-C1-PREP-03 Quatrième famille par éviction LRU      | politique familles de session                | plafond 3, verrou, activité, ordre déterministe, transaction et refresh           | Contract prepared locally |
| SEC-ADM-C1-PREP-04 503 générique sur les douze C1          | erreurs/réponses + politique indisponibilité | 12 réponses, message uniforme, C2 inchangé, dépendances non révélées              | Contract prepared locally |
| SEC-ADM-C1-PREP-05 Audit impossible et COMMIT inconnu      | politique indisponibilité                    | rollback non commité, aucune fausse preuve, aucun secret/retry avant confirmation | Contract prepared locally |
| SEC-ADM-C1-PREP-06 Principe writer/reader PostgreSQL       | ADR-025 + architecture + Threat Model        | séparation, allowlists, sinks insert-only ; aucune migration/provision            | Design recorded only      |
| SEC-ADM-C1-PREP-07 Surface et JWS préservés                | OpenAPI/génération                           | 60/67/137, C1=12, C2=15, C3=0, cinq retraits SUPPORT, JWS R4                      | Verified locally          |
| SEC-ADM-C1-PREP-08 Frontière sans runtime                  | allowlist fermée et postflight               | aucun Prisma/runtime/dépendance/workflow/installation                             | Verified locally          |

La table PREP ci-dessus est l'instantané historique du cadrage contractuel. Le
mandat runtime distinct est tracé ci-dessous sans réécrire cette preuve.

## Traçabilité S1.2-03C1 — instantané local prépublication R3 du 2026-10-04

Qualification : **à cet instant, R2 était le dernier head publié dans la Draft
PR #50 avec quatre workflows verts ; revue CTO terminale BLOCK ; R3 validé
localement et non publié ; après cet instantané, Git/GitHub font foi ;
fournisseur KMS/JWT de production non qualifié**.

| Exigence                                          | Preuve runtime                                                                                                                                                                                                                 | État             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| SEC-ADM-C1-RUN-01 Douze opérations seulement      | module/contrôleur C1, inventaire Nest et parcours HTTP réel                                                                                                                                                                    | Verified locally |
| SEC-ADM-C1-RUN-02 Surface contractuelle préservée | OpenAPI 60/67/137, C1=12, C2=15, C3=0, génération byte-identique                                                                                                                                                               | Verified locally |
| SEC-ADM-C1-RUN-03 Stockage et audit legacy        | six modèles, migration unique, AuditLog v1/v2 sans DML historique, 39 modèles/40 tables                                                                                                                                        | Verified locally |
| SEC-ADM-C1-RUN-04 Frontières reader/writer        | deux identités/pools attestés avant init, projections et ACL de colonnes, sinks insert-only ; R3 contrôle les memberships incidentes dans les deux orientations                                                                | Verified locally |
| SEC-ADM-C1-RUN-05 Transactions et concurrence     | compteur TOTP, recovery one-shot, refresh winner/replay, LRU trois familles, audit atomique ; R3 aligne rejeu de confirmation et échecs post-session                                                                           | Verified locally |
| SEC-ADM-C1-RUN-06 Cryptographie réelle            | TOTP SHA-256, Argon2id, AES-GCM/rewrap, RS256 + JOSE réel, QR serveur                                                                                                                                                          | Verified locally |
| SEC-ADM-C1-RUN-07 Transport fermé                 | cookies `__Host-*`, Origin/Fetch/JSON/CSRF et parser borné                                                                                                                                                                     | Verified locally |
| SEC-ADM-C1-RUN-08 Redis durable et borné          | Lua atomique, profils, `WAITAOF 1 0`, restart AOF et panne fermée                                                                                                                                                              | Verified locally |
| SEC-ADM-C1-RUN-09 Provider fail-closed            | clés réelles éphémères injectées en test ; provider absent = 503 C1, health préservé ; R3 préserve l'indisponibilité lors de la résolution JWT                                                                                 | Verified locally |
| SEC-ADM-C1-RUN-10 Supply-chain                    | pins JOSE/Argon2/QR ; alias scoped `tinyglobby@0.2.17` ; gate sans `settings.next.rootDir` ; audits complet/production zéro                                                                                                    | Verified locally |
| SEC-ADM-C1-RUN-11 Observabilité sans secret       | callbacks Pino/Sentry et enveloppes d'erreur sanitizés                                                                                                                                                                         | Verified locally |
| SEC-ADM-C1-RUN-12 Frontière de publication        | dans l'instantané daté, aucun add/commit/push/PR/tag/release/déploiement ; l'état Git/GitHub postérieur fait foi ; Ready/fusion/déploiement distincts ; C2/C3 non démarrés                                                     | Verified locally |
| SEC-ADM-C1-RUN-13 Lifecycle et health isolés      | `infra:verify`/`infra:verify-api` code 0 ; volumes vides, migrations puis provisioning, restart/reset, owner refusé, runtime accepté, pannes/récupérations PostgreSQL/Redis, cleanup ciblé et ressources étrangères inchangées | Verified locally |

### Traçabilité S1.2-03C1-R3 — instantané local prépublication

Baseline R2 publiée, dernier head à cet instant : commit
`59972cc0614842627c8c17717605345eaae277c4`, parent
`efb14d1d075dac50ff081b6ef3c1cce516de01e0`, arbre
`a4e721cf14350655c9d7a94baae28a5f4edb298d`, trois commits PR, 78 fichiers,
`+15279/-641`. Les runs R2 `37160117048`, `37160117009`, `37160117045` et
`37160117042` sont tous verts sur ce head ; ils précèdent le BLOCK CTO et ne
valident pas les corrections R3.

| Exigence                                      | Preuve R3 obtenue                                                                                                                                                                                                          | État                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SEC-ADM-C1-R3-01 Memberships incidentes       | A/B, reader/writer, ancien contournement prouvé, refus avant mutation, signature inchangée, grant tiers préservé, erreurs applicatives typées puis retour nominal                                                          | Verified locally                    |
| SEC-ADM-C1-R3-02 Statuts Auth                 | cinq surfaces exactes à 400 avec codes canoniques                                                                                                                                                                          | Verified locally                    |
| SEC-ADM-C1-R3-03 Rejeu confirmation           | rejeu exact séquentiel/concurrent et même clé avec payload divergent à 409 ; autre clé/utilisateur refusés ; aucun secret, cookie, session ou mutation supplémentaire                                                      | Verified locally                    |
| SEC-ADM-C1-R3-04 Audit post-session           | rotation/step-up et branches explicitement contextualisées prouvés ; le chemin générique partagé de certaines pannes `refresh`/`revokeCurrent`/`revokeOther` pouvait encore perdre un contexte serveur déjà prouvé         | Partial historically — HIGH post-R3 |
| SEC-ADM-C1-R3-05 Provider de vérification JWT | `assertAvailable` réussi puis résolution ou digest tardif indisponible à 503 ; kid/signature/malformation/expiration à 401, aucun contexte inventé                                                                         | Verified locally                    |
| SEC-ADM-C1-R3-06 Audit `revokeOther`          | cible connue réelle et motif validé ; sujet absent si inconnu ; succès, rôle, step-up absent/expiré, auto-cible et 404 sans mutation sur refus                                                                             | Verified locally                    |
| SEC-ADM-C1-R3-07 Gouvernance et frontière     | champs vivants réconciliés ; historiques R0/R1/R2 préservés ; R3 local/non publié dans l'instantané daté ; état Git/GitHub postérieur faisant foi ; politique open source différée ; KMS non qualifié ; C2/C3 non démarrés | Reconciled locally                  |
| SEC-ADM-C1-R3-08 Points séparés               | recommandation JTI non bloquante et pagination `NON CONCLUSIVE`, sans élargissement silencieux du lot                                                                                                                      | Preserved separately                |

### S1.2-03C1-R4 — instantané local prépublication du 2026-10-04

R3 est publié au head `b0792934aa2f9d6f6d481517f384825874d72402` de la Draft
PR #50. Infrastructure `37190396720`, Launcher Windows `37190396716`, Security
`37190396718` et Quality Linux `37190396709` réussissent en tentative 1. La
revue CTO terminale ultérieure reste **BLOCK** : cinq findings R3 sont clos et
le finding **HIGH** d'audit post-session n'était que partiellement corrigé avant R4.
Les onze fichiers techniques R3, dont PostgreSQL/Infrastructure, restent figés
après leurs validations ; R4 est borné aux trois fichiers Auth/tests et aux six
documents autorisés. Les preuves ci-dessous sont celles de l'instantané local
prépublication ; après cet instantané, l'état Git/GitHub fait foi.

| Exigence                                      | Preuve R4                                                                                                                                                                                                                       | État                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| SEC-ADM-C1-R4-01 Contexte `revokeCurrent`     | principal serveur conservé avant transaction ; panne précoce : un `AuditLog` attribué, aucun événement générique, session non révoquée                                                                                          | Verified locally        |
| SEC-ADM-C1-R4-02 Cible `revokeOther`          | avant résolution : sujet nul et cible/motif conservés ; après résolution : sujet serveur exact ; rollback acteur/cible                                                                                                          | Verified locally        |
| SEC-ADM-C1-R4-03 Preuve `refresh`             | aucun acteur inventé avant preuve ; après vérification user/session/token, pannes CSRF/signature/rotation vers un `AuditLog` exact                                                                                              | Verified locally        |
| SEC-ADM-C1-R4-04 Rotation atomique            | échec après consommation SQL de l'ancien refresh mais avant insertion du suivant ; ancien token non consommé, génération/session inchangées après rollback                                                                      | Verified locally        |
| SEC-ADM-C1-R4-05 Normalisation et concurrence | erreur normalisée enrichie avec métadonnées intactes, contexte explicite prioritaire, deux invocations concurrentes isolées                                                                                                     | Verified locally        |
| SEC-ADM-C1-R4-06 Sink indisponible            | `refresh`, `revokeCurrent`, `revokeOther` : 503 sûr, zéro `AuditLog`, zéro fallback `AdminSecurityEvent`, mutations non commitées annulées                                                                                      | Verified locally        |
| SEC-ADM-C1-R4-07 COMMIT inconnu               | trois opérations : 503 neutre, aucun rejet ni second sink ; succès/audit et mutation durables acceptés sans prétendre au rollback                                                                                               | Verified locally        |
| SEC-ADM-C1-R4-08 Régression complète          | wrapper PostgreSQL/Redis réel 30/30 ; API 17 suites, 87 réussis et 29 `skipped` ; OpenAPI 60/67/137 et génération inchangée                                                                                                     | Verified locally        |
| SEC-ADM-C1-R4-09 Publication et limites       | R3 publié et quatre CI vertes mais finding terminal HIGH ; R4 validé dans l'instantané prépublication, neuf fichiers existants maximum ; publication distincte, KMS non qualifié, pagination non concluante, C2/C3 non démarrés | Scope preserved locally |

La clôture matérielle distincte du worktree 03A, à sémantique préservée et de
cause **NON CONCLUSIVE**, n'est ni une preuve R4 ni une extension de ce lot.

## Traçabilité S1.2-03B-R1 — Supply-chain remediation

Qualification : **instantané historique local prépublication du 2026-09-29**.
Les statuts de publication de cette table décrivent l'état au moment de la
validation locale R1, avant le commit et les workflows R1 publiés.

| Exigence                                                 | Preuve locale                                                                                                                                                                                               | État                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| SEC-SC-R1-01 Fermer les quatre avis affectant R0         | trois avis explicitement imprimés par Security R0 `36572630278` ; `GHSA-hrr3-gc8f-f4qj` confirmé par le diagnostic R1 ; `fast-uri@3.1.8`, `multer@2.4.0`, audits complet et production à zéro vulnérabilité | Verified locally     |
| SEC-SC-R1-02 Refuser les versions causales vulnérables   | scanner `<3.1.8`, rejets 3.1.6/3.1.7 et Multer 2.3.0, tests ciblés 79/79                                                                                                                                    | Verified locally     |
| SEC-SC-R1-03 Préserver les overrides parentés            | `ajv@8.18.0 > fast-uri` déclaré `^3.0.1` ; `@nestjs/platform-express@11.1.28 > multer` déclaré `2.2.0`                                                                                                      | Verified locally     |
| SEC-SC-R1-04 Lockfile causal et reproductible            | deux `npm ci --ignore-scripts`, SHA-256 stable, retrait causal de `concat-stream`/`typedarray`, aucun drift de version                                                                                      | Verified locally     |
| SEC-SC-R1-05 Signatures, provenance et licences          | 1 130 paquets audités avec signature de registre, 198 attestations vérifiées ; 1 132 paquets, 0 licence non déclarée/refusée                                                                                | Verified locally     |
| SEC-SC-R1-06 Qualifier les sept artefacts WASM           | mêmes sept nœuds optionnels de branches plateforme après deux installations ; entrées R0 inchangées ; `npm ls` code 0                                                                                       | Verified nonblocking |
| SEC-SC-R1-07 Compatibilité API/NestJS                    | aucun usage Multer direct ; format, lint, typecheck, 27 tests API, build et smoke infrastructure/health réussis                                                                                             | Verified locally     |
| SEC-SC-R1-08 Préserver le contrat et la capacité produit | validation 60 chemins/67 opérations/137 schémas, 263 tests OpenAPI, génération et octets contractuels inchangés                                                                                             | Verified locally     |
| SEC-SC-R1-09 Respecter la frontière de publication       | dix fichiers maximum, index vide, R1 local/non commité/non publié, PR #48 Draft et description « CI en attente » inchangées                                                                                 | Verified locally     |

Cette traçabilité complète l’instantané contractuel R0 sans le réécrire.
S1.2-03C1, S1.2-03C2 et S1.2-03C3 restent `Not started`.

## Traçabilité S1.2-03B-R2 — Réconciliation postpublication R1

| Exigence                                              | Preuve                                                                                                                                                                                                                                                 | État               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| SEC-SC-R2-01 Identifier la publication R1             | commit `3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, parent `a1002b37b26feb456e2b11df87c20e671c4c20ae`, arbre `c87ca8400af2e421931533e2e6b6853680360800`, message `fix(security): remediate S1.2-03B supply-chain findings`, diff 10 fichiers `+358/-78` | Published          |
| SEC-SC-R2-02 Verrouiller l’empreinte agrégée R1       | `8298eb4de428fa578ed34af3f5ce0f5d80979ea02f124f78a3f8a603d3bbf659`                                                                                                                                                                                     | Reconciled         |
| SEC-SC-R2-03 Préserver la chronologie exacte des avis | Security R0 `36572630278` imprime `GHSA-qw65-cvwx-89v3`, `GHSA-58mr-gqgx-xq4g`, `GHSA-3pph-fpjx-jg34` ; R1 diagnostique aussi `GHSA-hrr3-gc8f-f4qj` et ferme les quatre                                                                                | Reconciled         |
| SEC-SC-R2-04 Distinguer preuves locales et preuves CI | local : 1 130 signatures, 198 attestations sans invalide, licences 1 132/0/0, deux installations, sept WASM et validations API/Flutter/Infrastructure ; CI : audits complet/production à zéro, licences 1 139/0/0, scanner 358/52 et lock déterministe | Reconciled         |
| SEC-SC-R2-05 Attester les quatre workflows R1         | Security `36642550938`, Infrastructure `36642550943`, Launcher Windows `36642550958`, Quality Linux `36642551010`, tous `pull_request/completed/success` sur le head R1                                                                                | Verified on GitHub |
| SEC-SC-R2-06 Conserver l’état historique au head R1   | PR #48 ouverte, Draft, non fusionnée et `MERGEABLE` ; 2 commits, 20 fichiers, `+8291/-1220`                                                                                                                                                            | Historical state   |
| SEC-SC-R2-07 Préserver la capacité contractuelle      | 60 chemins, 67 opérations et 137 schémas ; aucun runtime, migration ou interface                                                                                                                                                                       | Contract unchanged |
| SEC-SC-R2-08 Respecter la frontière documentaire R2   | exactement six documents modifiés, aucun fichier technique ; aucun rerun, Ready, merge, tag, release, déploiement ou démarrage S1.2-03C                                                                                                                | Scope verified     |

R1 est publié et ses quatre workflows sont verts, mais la PR #48 demeure Draft
et non fusionnée. R2 reste limité aux six documents de réconciliation et son
état de publication fait foi dans Git et GitHub. Les lots S1.2-03C1,
S1.2-03C2 et S1.2-03C3 restent `Not started`.

## Traçabilité S1.2-03B-R3 — Instantané local prépublication du 2026-10-01

| Exigence                                                   | Preuve                                                                                                                                                                                                  | État                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| SEC-SC-R3-01 Préserver l'historique publié R2              | commit `6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, parent `3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, arbre `55a00c1c03d5e5142f81c0f99398d0686ec1a04b`, 6 documents `+271/-74`, agrégat `43110016…3e87` | Published               |
| SEC-SC-R3-02 Diagnostiquer la cause Security R2            | run `36707322818`, `Audit dependency trees`, code 1 ; `minimatch@10.2.6 > brace-expansion@5.0.9` ; trois avis, sans échec de signature ou licence                                                       | Cause verified          |
| SEC-SC-R3-03 Fermer tous les intervalles brace vulnérables | override exact `brace-expansion@5.0.12` ; scanner couvrant les branches 0/1/2/3/4/5 et leurs bornes ; 88/88 tests ciblés                                                                                | Verified locally        |
| SEC-SC-R3-04 Qualifier l'alerte Next distincte             | `next`/`eslint-config-next@16.3.8`, `@next/env`, plugin ESLint et huit SWC alignés ; builds Web/Admin, SWC Windows et Sharp en mémoire réussis                                                          | Verified locally        |
| SEC-SC-R3-05 Préserver R1 et le graphe causal              | `fast-uri@3.1.8`, `multer@2.4.0` conservés ; aucun nœud ajouté/supprimé ; exactement 13 versions causales modifiées                                                                                     | Verified locally        |
| SEC-SC-R3-06 Reproductibilité et intégrité                 | deux `npm ci --ignore-scripts` ; lock SHA-256 `3bbb2e4b476decf50a7165143c985719d234e9511deebf757a6c9527eb68c03a` stable ; 1 130 signatures et 198 attestations                                          | Verified locally        |
| SEC-SC-R3-07 Audits, licences et graphe                    | audits complet/production : 0 ; licences 1 132/0/0 ; `npm ls --all` code 0 ; sept artefacts WASM historiques qualifiés                                                                                  | Verified locally        |
| SEC-SC-R3-08 Régressions des consommateurs                 | format, lint, typecheck, suites npm, Flutter 22/22, builds Web/Admin/API/packages et APK debug réussis ; iOS non exécuté sur Windows                                                                    | Verified locally        |
| SEC-SC-R3-09 Préserver le contrat                          | OpenAPI 60/67/137 ; génération courante ; OpenAPI, contrat et `next-env.d.ts` byte-identiques au head R2                                                                                                | Contract unchanged      |
| SEC-SC-R3-10 Respecter la frontière de publication         | instantané du 2026-10-01 : au plus 13 fichiers existants, aucun nouveau fichier ; R3 local/non indexé/non commité/non publié ; PR #48 Draft ; aucun rerun, Ready, merge, tag, release ou déploiement    | Prepublication verified |

Les essais de lockfile refusés et les deux incidents réseau de validation des
signatures ne sont pas comptés comme succès. Le troisième audit de signatures
a terminé au code 0. S1.2-03C1, S1.2-03C2 et S1.2-03C3 restent `Not started`.

Après cet instantané, l'état de publication R3 fait foi dans Git et GitHub ;
aucun SHA, arbre ou Run ID futur n'est anticipé dans cette matrice.

## Traçabilité S1.2-03B-R4 — Instantané local prépublication du 2026-10-01

| Exigence                                           | Preuve                                                                                                                                                                                     | État                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| SEC-SC-R4-01 Enregistrer la publication R3         | commit `1a6c4efeb169e89ccf989004559f4e0c1af80af3`, parent `6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, arbre `031101296c44d18d7f1a2ab1f917ac1432023f6d`, 13 fichiers `+893/-117`            | Published                  |
| SEC-SC-R4-02 Attester la CI et la PR R3            | quatre workflows tentative 1 `pull_request/completed/success`; PR #48 `OPEN`, Draft, `CLEAN`, 4 commits, 23 fichiers, `+9342/-1298`; corps SHA-256 `b103546d…97b`                          | Verified on GitHub         |
| SEC-SC-R4-03 Corriger le signing input JWS         | payload JCS UTF-8 ; `BASE64URL(protected).BASE64URL(payload)` ASCII sans padding ; forme `protected..signature` ; `b64=false` interdit ; EdDSA/Ed25519, trust bundle et rotation préservés | Contract corrected locally |
| SEC-SC-R4-04 Prouver cryptographiquement le profil | signature RFC 7515 acceptée ; signature du seul payload, en-tête altéré, payload altéré et profil non encodé refusés ; reconstruction du payload détaché vérifiée                          | Verified locally           |
| SEC-SC-R4-05 Qualifier les anciens champs vivants  | blocs R1/R2 renommés historiques sans changer leurs chiffres ; l'état courant de publication et de CI fait foi dans Git/GitHub                                                             | Reconciled                 |
| SEC-SC-R4-06 Préserver la frontière                | fichiers existants de l'allowlist seulement ; aucun manifeste, lockfile, dépendance, workflow, runtime, Prisma, migration, provisioning ou interface ; S1.2-03C1/C2/C3 `Not started`       | Scope preserved            |

Dans cet instantané du 2026-10-01, R4 était local, non indexé, non commité et
non publié. Aucun SHA, arbre, Run ID ou succès CI R4 futur n'y était anticipé ;
après cet instantané, l'état de publication et de CI fait foi dans Git et
GitHub. Les résultats de validation locale sont consignés dans le rapport du
gate.
