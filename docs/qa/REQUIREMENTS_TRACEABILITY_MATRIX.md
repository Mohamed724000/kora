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

| Exigence                                          | Preuve runtime                                                                                                                                                                                                                 | État                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| SEC-ADM-C1-RUN-01 Douze opérations seulement      | module/contrôleur C1, inventaire Nest et parcours HTTP réel                                                                                                                                                                    | Verified locally                 |
| SEC-ADM-C1-RUN-02 Surface contractuelle préservée | OpenAPI 60/67/137, C1=12, C2=15, C3=0, génération byte-identique                                                                                                                                                               | Verified locally                 |
| SEC-ADM-C1-RUN-03 Stockage et audit legacy        | six modèles, migration unique, AuditLog v1/v2 sans DML historique, 39 modèles/40 tables                                                                                                                                        | Verified locally                 |
| SEC-ADM-C1-RUN-04 Frontières reader/writer        | deux identités/pools attestés avant init, projections et ACL de colonnes, sinks insert-only ; la preuve R3 historique ne préparait que `roleid=target`; R11 couvre réellement `roleid` et `member` pour reader/writer sur A/B  | Verified locally — R11 completed |
| SEC-ADM-C1-RUN-05 Transactions et concurrence     | compteur TOTP, recovery one-shot, refresh winner/replay, LRU trois familles, audit atomique ; R3 aligne rejeu de confirmation et échecs post-session                                                                           | Verified locally                 |
| SEC-ADM-C1-RUN-06 Cryptographie réelle            | TOTP SHA-256, Argon2id, AES-GCM/rewrap, RS256 + JOSE réel, QR serveur                                                                                                                                                          | Verified locally                 |
| SEC-ADM-C1-RUN-07 Transport fermé                 | cookies `__Host-*`, Origin/Fetch/JSON/CSRF et parser borné                                                                                                                                                                     | Verified locally                 |
| SEC-ADM-C1-RUN-08 Redis durable et borné          | Lua atomique, profils, `WAITAOF 1 0`, restart AOF et panne fermée                                                                                                                                                              | Verified locally                 |
| SEC-ADM-C1-RUN-09 Provider fail-closed            | clés réelles éphémères injectées en test ; provider absent = 503 C1, health préservé ; R3 préserve l'indisponibilité lors de la résolution JWT                                                                                 | Verified locally                 |
| SEC-ADM-C1-RUN-10 Supply-chain                    | pins JOSE/Argon2/QR ; alias scoped `tinyglobby@0.2.17` ; gate sans `settings.next.rootDir` ; audits complet/production zéro                                                                                                    | Verified locally                 |
| SEC-ADM-C1-RUN-11 Observabilité sans secret       | callbacks Pino/Sentry et enveloppes d'erreur sanitizés                                                                                                                                                                         | Verified locally                 |
| SEC-ADM-C1-RUN-12 Frontière de publication        | dans l'instantané daté, aucun add/commit/push/PR/tag/release/déploiement ; l'état Git/GitHub postérieur fait foi ; Ready/fusion/déploiement distincts ; C2/C3 non démarrés                                                     | Verified locally                 |
| SEC-ADM-C1-RUN-13 Lifecycle et health isolés      | `infra:verify`/`infra:verify-api` code 0 ; volumes vides, migrations puis provisioning, restart/reset, owner refusé, runtime accepté, pannes/récupérations PostgreSQL/Redis, cleanup ciblé et ressources étrangères inchangées | Verified locally                 |

### Traçabilité S1.2-03C1-R3 — instantané local prépublication

Baseline R2 publiée, dernier head à cet instant : commit
`59972cc0614842627c8c17717605345eaae277c4`, parent
`efb14d1d075dac50ff081b6ef3c1cce516de01e0`, arbre
`a4e721cf14350655c9d7a94baae28a5f4edb298d`, trois commits PR, 78 fichiers,
`+15279/-641`. Les runs R2 `37160117048`, `37160117009`, `37160117045` et
`37160117042` sont tous verts sur ce head ; ils précèdent le BLOCK CTO et ne
valident pas les corrections R3.

| Exigence                                      | Preuve R3 obtenue                                                                                                                                                                                                          | État                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| SEC-ADM-C1-R3-01 Memberships incidentes       | Preuve historique limitée à `GRANT <target> TO <probe>`, donc `roleid=target`; elle n'exerçait pas `GRANT <probe> TO <target>`, donc `member=target`. La postcondition saine ne démontrait pas ce refus sans mutation.     | Partial historically — corrected R11 |
| SEC-ADM-C1-R3-02 Statuts Auth                 | cinq surfaces exactes à 400 avec codes canoniques                                                                                                                                                                          | Verified locally                     |
| SEC-ADM-C1-R3-03 Rejeu confirmation           | rejeu exact séquentiel/concurrent et même clé avec payload divergent à 409 ; autre clé/utilisateur refusés ; aucun secret, cookie, session ou mutation supplémentaire                                                      | Verified locally                     |
| SEC-ADM-C1-R3-04 Audit post-session           | rotation/step-up et branches explicitement contextualisées prouvés ; le chemin générique partagé de certaines pannes `refresh`/`revokeCurrent`/`revokeOther` pouvait encore perdre un contexte serveur déjà prouvé         | Partial historically — HIGH post-R3  |
| SEC-ADM-C1-R3-05 Provider de vérification JWT | `assertAvailable` réussi puis résolution ou digest tardif indisponible à 503 ; kid/signature/malformation/expiration à 401, aucun contexte inventé                                                                         | Verified locally                     |
| SEC-ADM-C1-R3-06 Audit `revokeOther`          | cible connue réelle et motif validé ; sujet absent si inconnu ; succès, rôle, step-up absent/expiré, auto-cible et 404 sans mutation sur refus                                                                             | Verified locally                     |
| SEC-ADM-C1-R3-07 Gouvernance et frontière     | champs vivants réconciliés ; historiques R0/R1/R2 préservés ; R3 local/non publié dans l'instantané daté ; état Git/GitHub postérieur faisant foi ; politique open source différée ; KMS non qualifié ; C2/C3 non démarrés | Reconciled locally                   |
| SEC-ADM-C1-R3-08 Points séparés               | recommandation JTI non bloquante et pagination `NON CONCLUSIVE`, sans élargissement silencieux du lot                                                                                                                      | Preserved separately                 |

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

### S1.2-03C1-R5 — publication R4 et instantané local du 2026-10-05

R4 est publié au commit `cdc020caa8b06d74af816dc072e778e25e020699` et ses
quatre workflows réussissent en tentative 1. La revue terminale conserve
**BLOCK** sur deux findings, traités localement par R5 sans modifier le contrat.

| Exigence / contrôle                         | Preuve R5                                                                                                                                                                                      | Statut                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| SEC-ADM-C1-R5-01 Recovery après preuve      | création, QR et confirmation sous panne post-preuve : exactement un `AuditLog` `ADMIN_RECOVERY`, aucun événement, écritures métier annulées                                                    | Verified locally                   |
| SEC-ADM-C1-R5-02 Avant preuve / PREAUTH     | digest initial de confirmation et panne PREAUTH : zéro attribution recovery; événement de sécurité seulement                                                                                   | Verified locally                   |
| SEC-ADM-C1-R5-03 Sink recovery indisponible | échec d'enregistrement du rejet : 503 neutre, zéro fallback, zéro mutation durable                                                                                                             | Verified locally                   |
| SEC-ADM-C1-R5-04 Liste avant preuve         | JWT signé à JTI incompatible et panne transactionnelle pré-preuve : `AdminSecurityEvent`, zéro `AuditLog`                                                                                      | Verified locally                   |
| SEC-ADM-C1-R5-05 Liste après preuve         | panne après le véritable UPDATE touch : rollback des horodatages et zéro sink; panne de lecture après commit d'authentification : touch durable possible et zéro sink                          | Verified locally                   |
| SEC-ADM-C1-R5-06 COMMIT inconnu             | callback et COMMIT réels puis perte d'accusé sur création, QR, confirmation et touch liste : 503 neutre, succès durable possible, aucun rejet contradictoire, second sink ou retry automatique | Verified locally                   |
| SEC-ADM-C1-R5-07 Régression C1              | wrapper PostgreSQL A/B + HTTP + Redis : 34/34 tests réels, douze opérations; API 17 suites, 90 réussis, 33 conditionnels `skipped`; OpenAPI 60/67/137 inchangé                                 | Verified locally                   |
| SEC-ADM-C1-R5-08 Frontière                  | six fichiers TypeScript et six documents existants; repository/filter/writer, Prisma, migrations, provisioning, wrapper, workflows, manifestes, lockfile et contrat inchangés                  | Scope preserved; local unpublished |

La politique open source reste différée et non installée, le fournisseur de
clés de production **NON QUALIFIÉ**, la recommandation JTI séparée, la
pagination **NON CONCLUSIVE**, et C2/C3 `Not started`.

### S1.2-03C1-R6 — publication R5 et instantané local du 2026-10-05

R5 est publié au commit `89323beb1ebbae9a488456db5d1dc2cb19215dd6`; ses
quatre workflows réussissent en tentative 1. R6 ferme localement le finding de
réutilisation d'un client après rollback non confirmé, sans modifier les
contrats ni les services Auth/session.

| Exigence / contrôle                                | Preuve R6                                                                                                                                                                                                                        | Statut                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| SEC-ADM-C1-R6-01 Rollback non confirmé             | callback rejeté avant COMMIT, `ROLLBACK` rejeté, `AggregateError` contenant les deux erreurs, libération unique par `release(true)`, aucun COMMIT ni retry                                                                       | Verified locally                   |
| SEC-ADM-C1-R6-02 BEGIN et COMMIT                   | BEGIN rejeté avec rollback confirmé ou rejeté; COMMIT inconnu sans rollback, cause conservée et client détruit; succès et rollback confirmé réutilisables                                                                        | Verified locally                   |
| SEC-ADM-C1-R6-03 Preuve PostgreSQL réelle          | writer de production, `pg`, pool dédié `max=1`, mutation réelle, transaction ouverte, rejet contrôlé du rollback, ancien backend retiré, identité suivante distincte                                                             | Verified locally                   |
| SEC-ADM-C1-R6-04 État durable et non-contamination | connexion indépendante : mutation abandonnée absente, mutation saine suivante présente, ancien PID absent; aucune transaction ni entrée d'audit héritée                                                                          | Verified locally                   |
| SEC-ADM-C1-R6-05 Parcours HTTP contextuel          | enrollment, idempotence et audit de succès exécutés dans la transaction puis annulés; 503 neutre, un rejet `ADMIN_RECOVERY`, aucun événement, succès contradictoire ou double sink                                               | Verified locally                   |
| SEC-ADM-C1-R6-06 Régression C1                     | writer 13/13; wrapper PostgreSQL A/B + HTTP + Redis 36/36; API 17 suites, 93 réussis et 35 conditionnels `skipped`; lint, typecheck, build, audits à zéro et scanner officiel 384 fichiers                                       | Verified locally                   |
| SEC-ADM-C1-R6-07 Frontière et qualification        | trois fichiers techniques et six documents existants; injection contrôlée distincte d'un timeout réseau réel; Auth/session, contrats, Prisma, migrations, ACL, wrapper, dépendances, lockfile, workflows et manifestes inchangés | Scope preserved; local unpublished |

Le fournisseur de clés de production reste **NON QUALIFIÉ**, la politique open
source reste différée et non installée, le JTI transactionnel reste une
recommandation séparée, la pagination reste **NON CONCLUSIVE**, et C2/C3
restent `Not started`.

### S1.2-03C1-R7 — publication R6 et diagnostic causal local du 2026-10-06

R6 est publié au commit `bc907192075df1ccd68ec8a0378c9eae53e1ce23`.
Trois workflows réussissent; Infrastructure `37390492450` échoue sur l'ancien
oracle concurrent après 35/36 tests. Le statut exact de la réponse historique
n'est pas présent dans le log et n'est pas reconstruit comme un fait.

| Exigence / contrôle                         | Preuve R7                                                                                                                                                                                                | Statut                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SEC-ADM-C1-R7-01 Provenance CI bornée       | checkout du merge synthétique du head R6 exact; PostgreSQL A/B passe; échec historique en 258 ms car statut hors `{200,401}`; statut, corps et ordre absents du log                                      | Verified; historical limit explicit |
| SEC-ADM-C1-R7-02 Ordre `n → n+1`            | deux réponses 200; compteur durable `n+1`; deux PREAUTH consommés; deux audits corrélés; deux nouvelles sessions; deux victimes LRU exactes; trois familles actives                                      | Verified locally                    |
| SEC-ADM-C1-R7-03 Ordre `n+1 → n`            | 200 puis 400 `OTP_INVALID` au message neutre; aucun cookie/secret au rejet; PREAUTH rejeté non consommé; un audit de succès, un événement `ADMIN_TOTP_VERIFY/FAILED/OTP_INVALID`; une seule éviction LRU | Verified locally                    |
| SEC-ADM-C1-R7-04 Concurrence réelle         | deux requêtes HTTP avec PREAUTH distincts, deux writers observés bloqués dans PostgreSQL, au moins un directement par la fixture; deux répétitions `200/200`; maximum observé de trois familles actives  | Verified locally                    |
| SEC-ADM-C1-R7-05 Régression et répétabilité | deux wrappers frais : PostgreSQL A/B et 37/37 à chaque fois, HTTP/PostgreSQL/Redis réels et nettoyage ciblé; API lint/typecheck, 17/17 suites, 93 réussis et 36 conditionnels `skipped`                  | Verified locally                    |
| SEC-ADM-C1-R7-06 Essais non conclusifs      | scénario original local 36/36 sans ordre inverse forcé; première correction 36/37 sur observateur ne comptant que les blocages directs; tentative Docker sandbox refusée avant exécution fonctionnelle   | Recorded, not counted as PASS       |
| SEC-ADM-C1-R7-07 Frontière                  | un test et six documents existants; aucun runtime, contrat, ADR, Prisma, migration, ACL, provisioning, wrapper, dépendance, lockfile, workflow ou manifeste modifié; aucun changement GitHub             | Scope preserved; local unpublished  |

Le fournisseur de clés de production reste **NON QUALIFIÉ**, la politique open
source reste différée et non installée, le JTI transactionnel reste une
recommandation séparée, la pagination reste **NON CONCLUSIVE**, et C2/C3
restent `Not started`.

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

## Traçabilité locale S1.2-03C1-R10 — 2026-10-07

| ID        | Exigence vérifiée                                                | Preuve locale R10                                                                                                                    | Statut           |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| C1-R10-01 | Adopter le candidat R9 sans dépendre du prototype après adoption | Frontière finale de 23 chemins techniques ; prototype et preuves R9 inchangés                                                        | Verified locally |
| C1-R10-02 | Reproduire le graphe supply-chain                                | Deux installations fraîches avec scripts ignorés ; graphe SHA-256 `d015a1fbf88a052ef55e3fdd9bcc640fcd61602a8a2156a5d5bf2667c022fe73` | Verified locally |
| C1-R10-03 | Qualifier vulnérabilités, signatures et licences                 | Audits complet/production zéro ; signatures manquantes/invalides vides ; licences 933/0/0                                            | Verified locally |
| C1-R10-04 | Gérer strictement une suppression suivie                         | `apps/api/jest.config.cjs` seul est omis ; toute autre erreur de lecture reste bloquante                                             | Verified locally |
| C1-R10-05 | Composer strictement `qs` et `proxy-addr`                        | Ensemble exact sous `express@5.2.1`, versions exactes, parents/lock/singletons vérifiés ; 107/107 tests scanner                      | Verified locally |
| C1-R10-06 | Préserver le contrôle global du dépôt                            | 419/419 tests tooling ; scanner officiel avec historique sur 385 fichiers, 52 immuables et six scripts qualifiés                     | Verified locally |
| C1-R10-07 | Requalifier l'API et les consommateurs                           | API format/lint/typecheck/OpenAPI/tests/build ; Web/Admin/UI tests/typechecks/builds ; smoke Sharp                                   | Verified locally |
| C1-R10-08 | Rejouer le runtime réel deux fois                                | Deux répétitions fraîches PostgreSQL A/B et 37/37 HTTP/PostgreSQL/Redis, nettoyage complet                                           | Verified locally |
| C1-R10-09 | Reproduire le gel technique                                      | Deux manifestes byte-identiques, 385 lignes, SHA-256 `627aada7638656ef510c3f767f6a8b641c29f204f9c041f229834b3a23557337`              | Verified locally |
| C1-R10-10 | Préserver la frontière de publication                            | Instantané prépublication : 29 chemins non indexés, aucune mutation Git/GitHub, PR #50 au head R6 ; état ultérieur dans Git/GitHub   | Scope preserved  |

Les deux NON-PASS scanner intermédiaires et les incidents environnementaux sont
conservés dans le rapport de validation ; aucun résultat non exécuté ou échoué
n'est renommé en PASS. Le fournisseur de clés de production reste **NON
QUALIFIÉ**, la politique open source différée n'est pas installée, la pagination
reste **NON CONCLUSIVE** et C2/C3 restent `Not started`.

Les mentions R10 ci-dessus décrivent l'instantané local antérieur à toute
publication. Elles ne prédisent aucun SHA, Run ID ou succès CI ; l'état courant
ultérieur fait foi dans Git et GitHub.

## Instantané local prépublication S1.2-03C1-R11 — 2026-10-07

Chronologie qualifiée : R10 est publié au head source
`153b6ca1ef861a9fc09f3c290cb4d8cb54e9802d` avec quatre workflows verts; la
revue terminale suivante prononce **BLOCK** sur F1/F2; R11 est la remédiation
locale non indexée, non commitée et non publiée. Les succès CI R10 ne sont pas
des preuves R11.

| ID        | Exigence vérifiée                               | Preuve locale R11                                                                                                                                                                                                                      | Statut                                      |
| --------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C1-R11-01 | Refuser les quatre orientations de membership   | prédicat F1 présent avec les trois anciens; matrice A/B × reader/writer × `roleid`/`member`, soit huit refus réels par wrapper                                                                                                         | Verified locally                            |
| C1-R11-02 | Prouver le refus avant mutation                 | grant et options brutes prouvés; signature reader/writer/probe strictement identique; grant tiers inchangé; nettoyage ciblé et absence du probe vérifiés                                                                               | Verified locally                            |
| C1-R11-03 | Préserver les preuves PostgreSQL existantes     | quatre provisionnements positifs/idempotents, refus writer/ACL distinct, 39 modèles, 40 tables, rollback et COMMIT inconnu conservés                                                                                                   | Verified locally                            |
| C1-R11-04 | Aligner cinq contrats `VALIDATION_ERROR`        | code ajouté uniquement aux cinq listes autorisées; QR exclu et remapping `403 FORBIDDEN` préservé                                                                                                                                      | Verified locally                            |
| C1-R11-05 | Refuser cinq dérives contractuelles             | cinq retraits unitaires refusés avec l'operationId concerné; OpenAPI adversarial 299/299; surface 60/67/137                                                                                                                            | Verified locally                            |
| C1-R11-06 | Prouver cinq réponses HTTP réelles              | prérequis Origin/PREAUTH ou session/CSRF/UUID/idempotence valides; exactement 400, enveloppe et code `VALIDATION_ERROR`, sink existant, zéro mutation métier                                                                           | Verified locally                            |
| C1-R11-07 | Préserver génération et boundary                | générateur courant; `audio-pilot.ts` byte-identique SHA-256 `d53665d89388e399d1a7dbf782739b836bb652d8cfd281e3679621c86377b697`; boundary 7/7                                                                                           | Verified locally                            |
| C1-R11-08 | Requalifier API et outillage                    | lint/typecheck; API 17 fichiers, 93 réussites, 41 conditionnels ignorés; tooling 426/426; scanner 385 fichiers, historique, 52 immuables, six scripts                                                                                  | Verified locally                            |
| C1-R11-09 | Répéter l'intégration réelle                    | deux wrappers frais, chacun PostgreSQL A/B, huit refus membership, un refus writer/ACL et 42/42 HTTP/PostgreSQL/Redis; inventaire Docker restauré puis Docker arrêté                                                                   | Verified locally                            |
| C1-R11-10 | Conserver les tentatives NON-PASS               | première tentative lint refusée sur constante de test inutilisée; correction causale et reprise réussie, sans renommer l'échec initial en PASS                                                                                         | Traced                                      |
| C1-R11-11 | Préserver la frontière locale et de publication | dans l'instantané prépublication : douze fichiers existants au maximum, index vide, aucune mutation Git/GitHub/CI; audits/signatures/licences/builds hors périmètre non rejoués; toute publication ultérieure fait foi dans Git/GitHub | Scope preserved — historical prepublication |

Limites inchangées : fournisseur de clés de production **NON QUALIFIÉ**,
politique OSS différée/non installée, JTI transactionnel séparé, pagination
**NON CONCLUSIVE**, couverture V8 et iOS non exécutées, C2/C3 `Not started`.

## Instantané prépublication S1.2-03C1-R12 — 2026-10-08

R11 est publié au head `3e02785d06c0d5f397eb9f9a39a09b8058b10467` avec
quatre runs `pull_request/completed/success`. La revue terminale cumulative
identifie ensuite le parsing JSON pré-contrôleur comme finding **HIGH**. À
l'instantané prépublication du 2026-10-08, R12 était local, non indexé, non
commité et non publié; toute publication ultérieure fait foi dans Git et
GitHub.

| ID        | Exigence vérifiée                        | Preuve locale R12                                                                                                                                                                                                                                                                                                   | Statut           |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C1-R12-01 | Reproduire les sept erreurs JSON réelles | sept chaînes brutes tronquées; avant correction, 400 `BAD_REQUEST`, champs génériques, zéro événement/audit, état métier inchangé; campagne 42 réussites/1 échec                                                                                                                                                    | Reproduced       |
| C1-R12-02 | Classifier uniquement l'erreur causale   | `SyntaxError`, `entity.parse.failed`, statut 400; aucun matching de message/corps; erreurs URI, applicatives, taille, encodage et C1 existantes transmises par identité                                                                                                                                             | Verified locally |
| C1-R12-03 | Borner le routage aux sept POST          | montages Express exacts, sans suffixe; casse, query, slash terminal et paramètre non-UUID acceptés comme par le routeur; méthode, route étrangère, QR, opérations sans corps, C2 et client non surclassés                                                                                                           | Verified locally |
| C1-R12-04 | Préserver les parseurs Nest              | un `jsonParser`, un `urlencodedParser`; logger avant JSON, sept normaliseurs avant les routes; aucune option de limite, stricteté, type, encodage, `verify` ou `rawBody` ajoutée                                                                                                                                    | Verified locally |
| C1-R12-05 | Produire l'enveloppe et le sink exacts   | sept fois 400 `VALIDATION_ERROR`, enveloppe fermée, même requestId, un `AdminSecurityEvent` sans acteur, zéro `AuditLog`, cookie ou mutation; canari absent de la réponse, du recorder, du sink et des logs structurés                                                                                              | Verified locally |
| C1-R12-06 | Neutraliser la panne du recorder         | 503 C1 fermé, un appel, zéro sink durable, aucun retry, fallback ou second sink; fixture restaurée dans `finally`                                                                                                                                                                                                   | Verified locally |
| C1-R12-07 | Préserver R3–R11 et les transactions     | wrapper réel PostgreSQL A/B et 47/47; 42 scénarios R11 conservés; rollback, COMMIT inconnu, TOTP, LRU, refresh, révocations, ACL et memberships inchangés                                                                                                                                                           | Verified locally |
| C1-R12-08 | Requalifier API et contrats              | unités 7/7; format/lint/typecheck/tests/build; API 17 fichiers, 96 réussites, 46 conditionnels ignorés; OpenAPI 60/67/137; boundary 7/7; généré byte-identique                                                                                                                                                      | Verified locally |
| C1-R12-09 | Scanner et frontière                     | scanner officiel 385 fichiers, historique actif, 52 immuables, six scripts; quatre fichiers techniques et six documents existants au maximum; aucun changement de dépendance, lockfile, OpenAPI, Prisma, provisioning, workflow ou contrat généré                                                                   | Verified locally |
| C1-R12-10 | Conserver les NON-PASS et limites        | démarrage Docker PowerShell, Prettier, premier typecheck, reproduction rouge, premier montage `.post()` et trois timeouts `AdminRequestPolicy` consignés; après arrêt Docker, reprise isolée 6/6 et suite 96 réussites/46 ignorés; causalité Docker non affirmée; KMS, OSS/JTI/pagination/V8/iOS et C2/C3 inchangés | Traced           |
| C1-R12-11 | Qualifier l'incident npm                 | invocation du `2026-10-08T08:53:14.3124154Z` au code 1, stdout vide et `MODULE_NOT_FOUND` avant analyse; résultat NON CONCLUSIVE, production NON EXÉCUTÉE; bundle absolu Node `v22.18.0`/npm `10.9.3` ensuite qualifié; mécanisme exact de relocalisation non conclu                                                | Traced           |
| C1-R12-12 | Reprendre les audits frais               | appels directs du Node et `npm-cli.js` absolus; audits complet et production au code 0, chacun avec `found 0 vulnerabilities` et stderr vide; index, hashes techniques et lockfile inchangés; C1 reste en revue dans la Draft PR #50, non intégré à `main`                                                          | Verified locally |

## S1.2-03C2-P0 — traçabilité du prérequis contractuel

| ID       | Exigence                                      | Matérialisation P0                                                                                     | Vérification exigée                                              | État                      |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------- |
| C2-P0-01 | Préserver la baseline intégrée C1             | 60 chemins, 67 opérations, 137 schémas; 12 C1 et 15 C2; retraits SUPPORT inchangés                     | inventaires OpenAPI, branche au merge C1, diff/allowlist         | Contract verified locally |
| C2-P0-02 | Rendre l’indisponibilité C2 sûre              | 503 SERVICE_UNAVAILABLE fermé sur les 15 opérations, message générique, détails vides, non retryable   | validation exacte + mutations absence/code/message/details/retry | Contract verified locally |
| C2-P0-03 | Verrouiller authorization/audit par opération | matrice rôles, preuve, purpose, raisons, contexte, sinks, action, classe, entité, snapshots, atomicité | hash sémantique et mutations purpose/sink/contexte/preuve        | Contract verified locally |
| C2-P0-04 | Séparer password reset et MFA recovery        | purpose PASSWORD_RESET XOR MFA_RECOVERY; contexte durable préexistant; audit recovery atomique         | mutation reset=MFA et preuve client refusées                     | Contract verified locally |
| C2-P0-05 | Fermer le JSON pré-contrôleur                 | neuf POST exacts vers 400 VALIDATION_ERROR, même requestId, un SecurityEvent, zéro autre effet         | carte exacte et mutation de retrait                              | Contract verified locally |
| C2-P0-06 | Définir delivery et contrôle mot de passe     | e-mail, code manuel, outbox chiffré, HIBP range/padding fail-closed, Argon2id                          | contrat/ADR; provider réel NON EXÉCUTÉ                           | Contract verified locally |
| C2-P0-07 | Fermer e-mail, invitations et idempotence     | ASCII case-insensitive, pas plus/dot, collisions explicites, remplacement atomique, fenêtre 24 h       | contrat/ADR; concurrence runtime NON EXÉCUTÉE                    | Contract verified locally |
| C2-P0-08 | Borner les trois listes                       | défaut 25/max 50, createdAt/id descendant, cursor authentifié lié, snapshot 15 min, 10k/25 MiB         | paramètres dédiés et mutation cursor non lié                     | Contract verified locally |
| C2-P0-09 | Borner et signer l’export                     | AND, immuable, 10k/25 MiB, pas de troncature, masking positif, JCS/JWS Ed25519 R4                      | mutations bornes/signature; worker/storage NON EXÉCUTÉS          | Contract verified locally |
| C2-P0-10 | Définir le bootstrap sans l’implémenter       | CLI hors API, garde PG, premier SUPER_ADMIN/PENDING_MFA, audit SYSTEM, secrets protégés                | politique générée; CLI/PG NON EXÉCUTÉS                           | Contract verified locally |
| C2-P0-11 | Préparer les frontières runtime futures       | C2a/C2b, allowlists littérales, aucun wildcard/timestamp, reader C1 non élargi, sinks insert-only      | revue architecture/sécurité; SQL NON EXÉCUTÉ                     | Contract verified locally |
| C2-P0-12 | Préserver la frontière de publication         | 17 chemins max, aucun runtime/dépendance/workflow/remote/PR, fournisseurs non qualifiés                | status/diff/manifestes/postflight local et GitHub                | Contract verified locally |

Référence : [ADR-026](../adr/ADR-026-admin-security-c2-runtime-contract.md),
[architecture C2](../architecture/SLICE_1_2_03C2_ADMIN_SECURITY_RUNTIME.md) et
[rapport P0](SLICE_1_2_03C2_ADMIN_SECURITY_CONTRACT_REPORT.md).

## S1.2-03C2-P0-R2 — remédiation locale

| ID       | Exigence                           | Preuve R2                                                                                                                                             | État                      |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| C2-R2-01 | Trois origines SYSTEM exclusives   | schéma existant avec branches autonome, AuditLog+délégant et AdminSecurityEvent sans délégant; trois fixtures valides et combinaisons mixtes refusées | Verified locally          |
| C2-R2-02 | Reset public sans acteur fabriqué  | politique transversale PUBLIC, source AdminSecurityEvent LOGIN/action/entité exactes, liaisons demande/outbox et champs client interdits              | Verified locally          |
| C2-R2-03 | SQL/ACL futurs précis sans runtime | FK `causationSecurityEventId`, CHECK exclusif, RESTRICT, permissions writer/worker minimales documentées; Prisma inchangé                             | Contract verified locally |
| C2-R2-04 | Quinze listes d'erreurs exactes    | table normative et statuts; retrait, ajout, doublon, substitution de même statut et statut erroné refusés                                             | Verified locally          |
| C2-R2-05 | Contrat généré                     | causalité typée et table erreurs/statuts matérialisées uniquement par le générateur officiel                                                          | Verified locally          |
| C2-R2-06 | Nettoyage stopChild                | exception injectée, un seul appel, diagnostic assaini `phase=finally cleanup_error ... action=stop_api`, retour d'échec                               | Verified locally          |
| C2-R2-07 | Préserver R1 historique            | erreur principale/logs séparés; échec CI et cause Docker NON CONCLUSIVE conservés                                                                     | Preserved                 |
| C2-R2-08 | Préserver surface et runtime       | 60/67/137; aucun Prisma, migration, dépendance, workflow, Docker ou runtime C2/C3                                                                     | Scope preserved           |
| C2-R2-09 | Gouvernance pré-écriture           | identité dépôt/PR/branche/base/head/titre/candidat vérifiée avant écriture et comparaison API binaire après; incident PR #50 gardé en deux écritures  | Traced                    |
| C2-R2-10 | Intégration future explicite       | `app.module.ts` et `app.factory.ts` mentionnés comme chemins à autoriser littéralement si nécessaires                                                 | Traced                    |

## S1.2-03C2-P0-R3 — traçabilité F1/F2/F3

| ID       | Exigence                           | Preuve R3                                                                                            | État             |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| C2-R3-01 | Représenter réellement AuditLog v1 | branche v1 avec identifiants historiques non UUID et textes >120, nullités physiques, aucun backfill | Verified locally |
| C2-R3-02 | Ne jamais livrer legacyReason      | colonne exclue de l'allowlist, propriété absente, canari raw rejeté, indicateur de projection vrai   | Verified locally |
| C2-R3-03 | Préserver v2 et causalité R2       | non-nullité classe/contexte/motif, trois contextes, trois branches SYSTEM                            | Verified locally |
| C2-R3-04 | Aligner liste/export et filtres    | même `AdminAuditLogEntry`, v1 incluse par défaut, trois filtres v2-only sans attribution synthétique | Verified locally |
| C2-R3-05 | Fixer tous les motifs AuditLog C2  | dix producteurs HTTP, sept transitions SYSTEM, sources/valeurs exactes, NONE/SecurityEvent séparés   | Verified locally |
| C2-R3-06 | Fermer le rejet du motif client    | après preuve : SECURITY_RESPONSE, operatorReason null, texte invalide non copié, aucun enum-first    | Verified locally |
| C2-R3-07 | Hasher le ZIP final exact          | fixture ZIP, hash attendu, round-trip chiffré, mutation détectée, manifeste seul refusé              | Verified locally |
| C2-R3-08 | Préserver le profil signé          | manifeste JCS/JWS Ed25519 R4 et hashes par entrée inchangés, aucune autoréférence                    | Verified locally |
| C2-R3-09 | Préserver la surface et le scope   | 60 chemins, 67 opérations, 139 schémas ; aucun runtime/Prisma/migration/dépendance/workflow          | Scope preserved  |

## S1.2-03C2-P0-R4 — traçabilité F1–F7

| ID       | Exigence                           | Preuve R4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | État             |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C2-R4-F1 | Résultat et provenance             | union v1/v2/v3 ; historique UNKNOWN sans inference ; v3 conditionnel SUCCESS/null ou REJECTED/code causal ; enum égal à l'image exacte des mappings ; succès download distinct de réception                                                                                                                                                                                                                                                                                                             | Verified locally |
| C2-R4-F2 | Projection sans texte libre        | operatorReason null + indicateur sur trois versions ; canaris email/téléphone/secret/texte refusés ; stockage déclaré inchangé                                                                                                                                                                                                                                                                                                                                                                          | Verified locally |
| C2-R4-F3 | Preuve distincte de l'autorisation | cinq extensions par opération, 15 matrices, sinks avant/après preuve et mutations cookie/rôle/step-up/intégrité                                                                                                                                                                                                                                                                                                                                                                                         | Verified locally |
| C2-R4-F4 | Sources SYSTEM entièrement liées   | sept prédicats typés ; égalité entityId/ressource par action ; annulations create/role/status + audits SYSTEM atomiques dans la transaction initiatrice ; sources invalides refusées                                                                                                                                                                                                                                                                                                                    | Verified locally |
| C2-R4-F5 | Machine export complète            | transition table, lease/fence/owner CAS, deadline tentative immuable 600 s, retry borné avec révocation immédiate owner/lease, reclaim crash seulement avant deadline, watchdog prioritaire à ou après deadline, publication READY atomique, quatre branches unknown-commit dont PROCESSING même fence à resume conditionnel et stale/different generation, audit download avant stream, audit expiry distinct ; six traces de concurrence, douze retry/deadline et quatre d'éligibilité COMMIT inconnu | Verified locally |
| C2-R4-F6 | Invitation/préauth atomiques       | transaction à cinq effets incluant credential Argon2id, cookie post-COMMIT, unknown commit neutre, réponse FIRST_TOTP et reprise login C1                                                                                                                                                                                                                                                                                                                                                               | Verified locally |
| C2-R4-F7 | Valeurs v1 représentables          | DDL réel consigné, textes courts/surlongs, valeur vide, JSONB objet/tableau/scalaires/null, aucun UUID/max/forme inventé, overflow sans partiel                                                                                                                                                                                                                                                                                                                                                         | Verified locally |
| C2-R4-08 | Génération et boundary             | allOf validé à l'exécution et parenthésé dans TypeScript ; v3/export/invitation verrouillés                                                                                                                                                                                                                                                                                                                                                                                                             | Verified locally |
| C2-R4-09 | Surface et portée                  | 60/67/141 ; aucun runtime, Prisma, migration, installation, Docker, workflow ou provider                                                                                                                                                                                                                                                                                                                                                                                                                | Scope preserved  |

Ces états appartiennent à l’instantané prépublication final du 2026-10-13. Les
sept findings restent fermés par les preuves FINAL7, qui ne sont pas couvertes
par la dérogation. Seules les deux lacunes historiques d’archivage ont le
statut **ACCEPTED WITH CTO WAIVER — HISTORICAL EVIDENCE ONLY** ; aucun artefact
absent ni résultat NON-PASS n’est reconstruit ou requalifié.

## S1.2-03C2-P0-R6 — disposition du client transactionnel

| ID       | Exigence                                  | Preuve R6                                                                                                                        | État                    |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| C2-R6-01 | Fermer BEGIN avant callback               | BEGIN borné 2 000 ms ; callback après confirmation ; issue inconnue destructrice sans retry ; late settle sans callback          | Contracted locally      |
| C2-R6-02 | Détruire toute connexion non réutilisable | rejet, deadline, perte de connexion ou état `T`/`E`/inconnu → discard physique exactement une fois ; late settle observationnel  | Contracted locally      |
| C2-R6-03 | Préserver erreurs et cardinalité          | issues BEGIN/primaire/rollback/COMMIT séparées ; libération exactement une ; défaut vers discard                                 | Contracted locally      |
| C2-R6-04 | Séparer COMMIT_UNKNOWN                    | tentative marquée avant driver, accusé borné 2 000 ms ; perte post-tentative exclusivement inconnue, sans rollback/replay        | Contracted locally      |
| C2-R6-05 | Fermer le retry des jobs                  | aucune politique de retry ne permet de rejouer une mutation dont le résultat est inconnu                                         | Contracted locally      |
| C2-R6-06 | Couvrir les six branches terminales       | six traces exactes ; perte de connexion strictement pré-COMMIT ; succès confirmé distinct de la disposition du client            | Contracted locally      |
| C2-R6-07 | Refuser les régressions adversariales     | vingt et une mutations ciblent liveness, BEGIN, bornes, `I` causal, disposition, exclusivité, erreurs, rollback, replay et sink  | Verified by local tests |
| C2-R6-08 | Préserver surface et frontière            | 60 chemins, 67 opérations, 141 schémas ; aucun runtime/Prisma/migration/dépendance/workflow                                      | Scope preserved         |
| C2-R6-09 | Préserver la preuve sous dérogation       | premier brouillon jamais publié couvert seul par waiver ; constats BLOCK historiques inchangés ; gel et candidat finaux exclus   | Waiver scope verified   |
| C2-R6-10 | Qualifier l'entrée de publication         | manifestes indépendants identiques ; patch 84 021 octets ; candidat final 26 378 octets ; publication sous gates, CI non acquise | Preflight verified      |

## S1.2-03C2a — fondations locales de sécurité admin

| ID     | Exigence                                  | Implémentation et preuve attendue                                                                                                                                       | État local final          |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| C2A-01 | Préserver le périmètre                    | Allowlist fermée ; services désactivés ; aucun endpoint, worker, bootstrap métier, SDK fournisseur, dépendance, workflow ou lockfile ajouté                             | Scope preserved           |
| C2A-02 | Modéliser les états C2a                   | Prisma et migration versionnés pour reset, recovery case, invitation, préautorisation, événements, outbox, snapshots et bootstrap                                       | Implemented locally       |
| C2A-03 | Garantir l'atomicité causale              | Contraintes différées sur reset, invitation, expiration, acceptation, annulation et remplacement ; scénarios partiels, arbitraires et permutés attendus en échec        | PostgreSQL real PASS      |
| C2A-04 | Respecter le contrat transactionnel R6    | Bornes monotones ; BEGIN confirmé ; sérialisation callback ; `ReadyForQuery` causal ; validation de commande ; disposition exactement une ; `COMMIT_UNKNOWN` exclusif   | Unit tests passed         |
| C2A-05 | Isoler quatre identités PostgreSQL        | Writer, notification, expiration et bootstrap avec secrets distincts, non héritables et sans login superflu                                                             | Provisioning implemented  |
| C2A-06 | Vérifier les ACL exactes                  | Signature canonique de chaque privilège colonne/relation ; refus de `PUBLIC`, héritage, routines, types, paramètres, gros objets et permutation à cardinalité constante | PostgreSQL real PASS      |
| C2A-07 | Qualifier les frontières de configuration | Activation explicite, variables et fichiers de secrets dédiés, valeurs fail-closed, absence de fuite de secrets dans les sorties                                        | Unit/static checks passed |
| C2A-08 | Prouver PostgreSQL réel                   | PostgreSQL 18.4 éphémère ; migrations A/B ; contamination ; scénarios positifs et négatifs ; empreintes ; stdout/stderr/code séparés                                    | PASS                      |
| C2A-09 | Prouver le nettoyage Docker               | Ressources nommées et labellisées, suppression ciblée même après échec, inventaire conteneurs/volumes/réseaux/images identique avant/après                              | PASS                      |
| C2A-10 | Clore par un gel reproductible            | Deux manifestes indépendants byte-identiques, postflight Git/GitHub, gates applicables et trois revues en lecture seule sur les mêmes octets                            | Verified locally          |

La preuve PostgreSQL réelle qualifie C2A-03, C2A-06, C2A-08 et C2A-09. Elle ne
remplace pas le gate OpenAPI protégé. Le premier résultat 39/48 reste NON-PASS ;
l'avenant ciblé qualifie ensuite exactement 39 modèles historiques et neuf C2a,
avec 60 chemins, 67 opérations, 141 schémas OpenAPI, 379/379 tests
adversariaux, 528/528 tests tooling, génération `--check` et scanner officiel.
Le candidat précédent à 378/378 et 527/527 reste NON-PASS de contre-revue car
un modèle supplémentaire indenté échappait à l'extracteur.
Les onze opérations HTTP et leurs exécuteurs métier restent hors périmètre, non
implémentés et non publiés.

## C2a métier P0 — préconditions transactionnelles et isolation

| ID        | Exigence                                | Matérialisation et vérification                                                                                                                        | État local                    |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| C2A-P0-01 | Projection session strictement minimale | Writer : SELECT JTI/purpose/expiry ; refus verifiedAt, hashes, family, activity, createdAt, SELECT global et écritures step-up                         | PostgreSQL real PASS          |
| C2A-P0-02 | Une capacité C2a par processus          | Quatre profils fermés ; un credential/pool ; variables étrangères, identité renommée et partage C1 refusés ; aucun sélecteur transactionnel public     | Unit + PostgreSQL PASS        |
| C2A-P0-03 | Préserver le démarrage C1               | C2a désactivé ne construit aucun pool ; intégration partagée 12 pass ; frontière C1 PostgreSQL préservée                                               | PASS                          |
| C2A-P0-04 | Qualifier provisioning et contamination | Fresh/upgrade, deux exécutions identiques, rôles exacts, memberships/attributs/ownership/ACL étrangers refusés avant mutation                          | PostgreSQL real PASS          |
| C2A-P0-05 | Préserver les garanties R6              | Requêtes sérialisées, pool max=1, rollback/COMMIT, RFQ causal, discard unique ; suites réelles transaction/boundary 33/33                              | PostgreSQL real PASS          |
| C2A-P0-06 | Traiter causalement la réserve pg       | Trois lectures notification séquentielles ; replay stderr vide ; conclusion bornée à ce parcours, sans qualification générale ni changement de version | Targeted path PASS            |
| C2A-P0-07 | Qualifier les gates proportionnés       | Format/lint/typecheck, config/boundary 15 pass, build API, scanner 396 fichiers, tooling 528/528 ; NON-PASS sandbox et collecteur conservés            | PASS with history preserved   |
| C2A-P0-08 | Ne pas anticiper le métier              | Aucun endpoint, worker, bootstrap CLI, fournisseur, SDK ou dépendance ; huit arbitrages hors dépôt proposés mais non activés                           | Scope preserved; P1–P9 closed |

## C2a métier P1–P9 — traçabilité locale — 2026-10-16

Les lignes P0 ci-dessus décrivent l'instantané du 2026-10-15. Le mandat
ultérieur autorise A1–A8 et l'implémentation P1–P9; les exigences suivantes
décrivent l'état local courant sans requalifier les fournisseurs de production.

| ID          | Exigence                                | Matérialisation et vérification                                                                                                                                                                                  | État local                  |
| ----------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| C2A-P1P9-01 | Monter exactement onze opérations C2a   | Profil HTTP, 11 operationIds contractés; C1 sans C2a; quatre opérations C2b absentes                                                                                                                             | Unit + HTTP/PostgreSQL PASS |
| C2A-P1P9-02 | Préserver preuves, step-up et sinks     | Preuve finale transactionnelle, rôles exacts, step-up ciblé, sink unique par stade, huit POST JSON pré-contrôleur                                                                                                | Real campaign PASS          |
| C2A-P1P9-03 | Garantir idempotence et pagination      | Cinq idempotences à fenêtre exacte fondée sur l'horloge PostgreSQL; deux snapshots stables                                                                                                                       | Real campaign PASS          |
| C2A-P1P9-04 | Rendre les mutations atomiques          | Mutation, source causale, idempotence/outbox et audit sous R6; erreurs domaine conservées; `COMMIT_UNKNOWN` neutre                                                                                               | Unit + PostgreSQL PASS      |
| C2A-P1P9-05 | Borner la notification                  | Lease/fence, cinq tentatives, backoffs autorisés, 10 s provider, `DELIVERY_UNCERTAIN` sans retry aveugle; PostgreSQL durable, Redis opaque                                                                       | Deterministic + real PASS   |
| C2A-P1P9-06 | Expirer sans course                     | Scan 60 s, lot 100, CAS/génération, readiness `>=180 s`, shutdown 30 s, course perdue no-op                                                                                                                      | Unit + real PASS            |
| C2A-P1P9-07 | Bootstrapper sans fuite                 | JSON UTF-8 stdin unique, aucun secret argv/log, garde et audit atomiques, codes 0/1/2/3/4/5, aucune reprise aveugle après issue inconnue                                                                         | Unit + real PASS            |
| C2A-P1P9-08 | Échouer fermé sans faux fournisseur     | Notification, HIBP ou clé absente: refus avant mutation/outbox avec sink requis; adaptateurs marqués `PROVIDER_ACCEPTED_FOR_TEST`                                                                                | Adversarial PASS            |
| C2A-P1P9-09 | Préserver C1 et le moindre privilège    | Quatre identités C2a, ACL exactes, C1 non régressé; INSERT AuditLog sans colonne `bootstrapGuardId` interdite au writer générique                                                                                | PostgreSQL PASS             |
| C2A-P1P9-10 | Fermer localement avec preuves honnêtes | 8 contrôles réussis : 1 contrôle statique et 7 scénarios réels PostgreSQL/Redis/HTTP. API 186 pass + 56 skips; OpenAPI 60/67/141; adversarial 379/379; tooling 530/530; licences/audits PASS; NON-PASS conservés | PASS, publication interdite |
| C2A-P1P9-11 | Rendre le refus post-preuve durable     | Le callback retourne une rejection typée; l'audit est commité avant l'erreur HTTP. Rôle, step-up, idempotence, absent, expiré et dernier SUPER_ADMIN vérifient le sink durable exact                             | PostgreSQL réel PASS        |

Fournisseurs notification/HIBP/keyring de production, charge et panne réseau
distribuée, qualification globale de `pg@8.22.0`, C2b, C3, politique OSS et
déploiement restent hors preuve.

## C2a R1 — remédiation C-05

| ID        | Exigence                            | Matérialisation et vérification                                                                                                                                                                                                                                              | État local             |
| --------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| C2A-C05-1 | Temps PostgreSQL et borne exacte    | `clock_timestamp()` capturé une fois après verrou dans une CTE matérialisée; actif si et seulement si `database_now < expires_at`; intervalle exact de 24 heures et tests avant/à/après la borne                                                                             | PostgreSQL réel PASS   |
| C2A-C05-2 | Réutilisation atomique              | génération monotone sous verrou advisory, unicité clé/génération, historique append-only; clé expirée réutilisable sans réservation permanente                                                                                                                               | PostgreSQL réel PASS   |
| C2A-C05-3 | Concurrence et payload              | même clé concurrente sérialisée; replay de payload identique; conflit de payload différent; ancienne génération incapable d'écraser la suivante                                                                                                                              | Unit + PostgreSQL PASS |
| C2A-C05-4 | Atomicité et moindre privilège      | lookup, mutation, audit et résultat sous R6; rollback y compris après le dernier INSERT idempotent, `COMMIT_UNKNOWN`; ACL writer bornée et refus des identités non autorisées                                                                                                | PostgreSQL réel PASS   |
| C2A-C05-5 | Requalification cumulative          | Foundations 34/34. Métier : 12 contrôles réussis : 1 contrôle statique et 11 scénarios réels PostgreSQL/Redis/HTTP. C1 47/47; API 211 pass + 61 skips conditionnels; format/lint/typecheck/build/OpenAPI/génération/tooling 530/530/scanner/licences PASS; lockfile inchangé | Local PASS             |
| C2A-C05-6 | Limite de signal Windows explicitée | arrêt par canal de preuve et quiescence PASS; signal OS Windows observé comme terminaison sans handler gracieux observable, sans revendiquer la preuve POSIX                                                                                                                 | Limite documentée      |

Les anciens NON-PASS restent archivés. Les audits npm déjà concluants restent
applicables aux mêmes dépendances. Fournisseurs de production NON QUALIFIÉS,
réserve globale `pg@8.22.0`, C2b/C3 et politique OSS inchangés.

## C2a — raccordement CI prépublication

| ID        | Exigence                                      | Matérialisation attendue                                                                                                      | État prépublication |
| --------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| C2A-CI-01 | Exécuter les deux gates C2a en Infrastructure | `db:generate`, gate C1, wrapper Foundations, wrapper métier, puis Compose/lifecycle/santé API préservés                       | Wired; CI pending   |
| C2A-CI-02 | Propager l'échec et isoler les ressources     | Steps non optionnels ; ports, secrets et noms éphémères ; nettoyage ciblé sans prune global                                   | Statically verified |
| C2A-CI-03 | Préserver les compteurs de preuve             | Historique 1 statique + 7 réels ; final local 1 statique + 11 réels ; 61 skips = 11 C2a + 46 C1 + 4 Foundations-P0            | Reconciled          |
| C2A-CI-04 | Ne pas anticiper la CI ni la production       | Linux/CI pending ; signal OS Windows/POSIX NON DEMONSTRATED ; providers NON QUALIFIÉS ; `pg@8.22.0` borné aux chemins exercés | Limits preserved    |

C2b/C3 restent non commencés et la politique OSS reste différée.

## C2a R2 — gate historique C1 autonome

| ID        | Exigence                                 | Matérialisation et preuve                                                                                                                                                                                                                                                                    | État local                           |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| C2A-R2-01 | Figer la référence C1 exacte             | artefact de `d514b87…` ; 36 144 octets ; blob `e02e0cd…` ; SHA-256 `812fe0b4…` ; identité ordonnée des 39 modèles contrôlée                                                                                                                                                                  | Static/adversarial PASS              |
| C2A-R2-02 | Être autonome en checkout CI peu profond | aucune commande `git show`, fetch ou checkout au runtime ; régressions artefact absent/altéré sur fixture sans `.git`                                                                                                                                                                        | Tooling PASS                         |
| C2A-R2-03 | Isoler toute la chaîne C1                | configuration, schéma, trois migrations et lock à empreintes figées dans un workspace unique ; migration C2a absente ; provisioning avec C2a désactivé ; identité root/dossiers/fichiers revérifiée ; substitution refusée sans suppression ; base créée retirée seulement identique et vide | Real A/B + adversarial PASS          |
| C2A-R2-04 | Qualifier les deux parcours historiques  | upgrade A et création vide B : 39 modèles, 40 tables avec historique, trois migrations et projection Prisma/catalogue byte-identique                                                                                                                                                         | PostgreSQL real PASS                 |
| C2A-R2-05 | Préserver le schéma courant et ses gates | sources/config/migrations/client Prisma inchangés ; C1 HTTP courant 47/47 ; Foundations C2a 34/34 ; métier 1 statique + 11 scénarios réels ; C1 47/47                                                                                                                                        | Real sequential PASS                 |
| C2A-R2-06 | Préserver l'historique et les limites    | Infrastructure `39135914973` reste FAILURE, steps C2a skipped ; aucun succès Linux déduit ; signal gracieux Windows/POSIX NON DEMONSTRATED ; fournisseurs NON QUALIFIÉS                                                                                                                      | History and limits preserved         |
| C2A-R2-07 | Fermer par des gates proportionnés       | syntaxe/format/tests ciblés 34/34, tooling 536/536, scanner, contrôles documentaires, allowlist et `git diff --check`; manifestes indépendants et revues finales                                                                                                                             | Closure evidence archived externally |

## C2a R3 — identité Docker et cleanup conditionnel

| ID        | Exigence                                   | Matérialisation et preuve                                                                                                                                                                                                                                                                                       | État local                        |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| C2A-R3-01 | Préserver l'échec CI historique            | log brut `39168610286` archivé ; exception de comparaison et `down` secondaire distingués ; valeurs absentes donc cause historique NON CONCLUSIVE                                                                                                                                                               | History preserved                 |
| C2A-R3-02 | Qualifier l'identité sémantique            | inspect exact `tag@digest`, RepoDigest exigé, ID local distinct accepté, inventaire joint par ID avec représentations multiples                                                                                                                                                                                 | Real Docker + adversarial PASS    |
| C2A-R3-03 | Échouer fermé sur absence indéterminée     | `No such image` exact + `docker info` + sondes tag/repo-digest + inventaire non contradictoire ; JSON vide/multiple/invalide, permission et daemon indisponible refusés                                                                                                                                         | Adversarial PASS                  |
| C2A-R3-04 | Borner le nettoyage d'image                | snapshot après acquisition, ID absent de l'inventaire initial, toutes références et tous conteneurs actifs/arrêtés contrôlés ; retrait par référence exacte seulement ; résidu/ref partagée refusé                                                                                                              | Adversarial + real cleanup PASS   |
| C2A-R3-05 | Conditionner le cleanup du workflow        | instance CI unique ; états atomiques ; aucun down avant prepare ; sous-ensemble partiel ou ensemble complet exact ; identité no-follow du manifeste, des cinq fichiers et des deux répertoires ; substitution byte-identique préservée                                                                          | Workflow adversarial fixture PASS |
| C2A-R3-06 | Rejouer les preuves causalement concernées | régressions R3 finales 5/5 ; tooling 541/541 incluant les 39 contrôles du fichier ; Foundations 34/34 ; métier 1 statique + 11 scénarios réels ; C1 47/47 ; inventaire Docker étranger identique                                                                                                                | Local sequential PASS             |
| C2A-R3-07 | Conserver NON-PASS et limites              | direct final 37/39 et sandboxé 538/541 conservés ; première reprise tooling finalement conclue 541/541 au code 0 malgré son observation initiale incomplète et son chevauchement avec la reprise causale également 541/541 ; Linux/CI R3 non qualifié ; signal OS NON DEMONSTRATED ; fournisseurs NON QUALIFIÉS | Limits and history preserved      |

## C2a R4 — arrêt des runners et preuve POSIX locale

| ID        | Exigence                                   | Matérialisation et preuve                                                                                                                                                                                            | État local                   |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| C2A-R4-01 | Reproduire avant correction                | exécutables compilés Node 22.18.0 sous Linux, PostgreSQL/Redis isolés, stdin parent ouvert, vrai SIGTERM ; outcome sain puis dépassement observé ; fermeture stdin seulement après constat provoque la sortie code 0 | Pre-fix reproduced           |
| C2A-R4-02 | Isoler la cause stdin                      | Nest, pool PostgreSQL et Redis/BullMQ ferment avant outcome ; aucun module ou boundary modifié ; listener de preuve encore actif identifié comme unique handle causal                                                | Cause demonstrated           |
| C2A-R4-03 | Libérer seulement les ressources possédées | listener stdin possédé retiré sur message/terminaison ; pause seulement si flux initialement non actif et aucun listener tiers ; aucun close/destroy                                                                 | Unit + real process PASS     |
| C2A-R4-04 | Borner signaux, quiescence et erreurs      | handlers SIGINT/SIGTERM maintenus dans un `finally` jusqu'après quiescence/close ; le premier candidat retirait trop tôt et reste BLOCK historique ; opération active, répétitions et échec de close couverts        | Review finding closed; 34/34 |
| C2A-R4-05 | Démontrer la sortie POSIX après correction | pour chacun des deux runners : premier vrai SIGTERM Linux, cleanup actif observé, second vrai SIGTERM, fermeture unique, code 0, signal terminal null et aucun SIGKILL                                               | Linux repeated-signal PASS   |
| C2A-R4-06 | Requalifier les surfaces causales          | métier final 1 statique + 11 scénarios réels PASS ; tentative combinée NON-PASS sur watchdog C1 `code=null` ; reprise C1 dédiée 47/47 ; transactionnel 30 pass + 4 skips ; lint, typecheck, build, tooling 541/541   | Selected proofs reconciled   |
| C2A-R4-07 | Préserver historique et limites            | R3 10/12 et deux timeouts conservés ; Windows OS non gracieux séparé ; CI R4 et fournisseurs non qualifiés ; `pg@8.22.0` borné aux chemins exercés                                                                   | Limits and history preserved |

## C2a R5 — résolution Vite et qualification locale

| ID        | Exigence                                   | Matérialisation et preuve                                                                                                                                                                          | État local                   |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| C2A-R5-01 | Éliminer les copies Vite affectées         | pins directs racine/API/Admin `8.1.6` ; singleton lock et physique `node_modules/vite@8.1.6` ; aucune version `8.0.0–8.1.5`                                                                        | Fresh install PASS           |
| C2A-R5-02 | Préserver les consommateurs et peers       | racine, API, Admin, Vitest 4.1.11 et `@vitest/mocker` 4.1.11 résolvent le même nœud ; `npm ls vite --all` et `npm ls --all` code 0                                                                 | Dependency graph PASS        |
| C2A-R5-03 | Fermer le finding scanner                  | override Vitest candidat retiré, autres overrides préservés, lockfile byte-identique ; scanner officiel code 0                                                                                     | Finding closed               |
| C2A-R5-04 | Qualifier la supply-chain                  | audits npm complet et production frais code 0 ; graphe production préservé                                                                                                                         | Supply-chain PASS            |
| C2A-R5-05 | Réutiliser proportionnellement les preuves | snapshots avant/après byte-identiques pour versions, emplacements, intégrités et relations ; API 217 PASS/61 SKIP, Admin 13/13, builds, tooling 541/541 et R4 hôte/Linux 34/34 restent applicables | No causal replay required    |
| C2A-R5-06 | Conserver historique et limites            | quatre candidats NON-PASS/BLOCK archivés ; essais npm/sandbox classés séparément ; PR #52 Draft inchangée ; fournisseurs NON QUALIFIÉS, C2b/C3 non commencés, OSS différée                         | History and limits preserved |

## C2a R6–R9 — verrous ciblés, remédiation et CI publiée

Les lignes R5 ci-dessus sont un instantané historique : Vitest `4.1.11` était
alors la version résolue. L'état courant R8/R9 protège Vite `8.1.6` et Vitest
`4.1.12`.

| ID           | Exigence                              | Matérialisation et preuve                                                                                                                                                                    | État courant                                            |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| C2A-R6-01    | Borner la reproductibilité C1         | projection Prisma `7.9.1` historique, schéma/migrations exacts et garde de non-mutation du lock ; un changement Vite indépendant est accepté sans relâcher les entrées protégées             | Local PASS ; commit `a9603821…`                         |
| C2A-R7-01    | Borner le verrou Foundations          | projections Prisma et `pg@8.22.0`, entrée Vitest protégée, migrations/fresh/upgrade/ACL et garde de mutation ; chaîne C1 47/47 → Foundations 34/34 → métier 1 statique + 11 réels            | Local PASS ; BLOCK audit historique                     |
| C2A-R8-01    | Fermer les advisories Vitest          | Vitest/coverage `4.1.12`, Vite `8.1.6`, scanner adversarial, npm `10.9.3`, audits zéro, signatures/licences, consommateurs et chaîne réelle complète                                         | Published at `12b9faf…`; CI lifecycle BLOCK historique  |
| C2A-R9-01    | Résoudre l'identité lifecycle         | `resetProject(PROJECT_NAME)`, confirmation croisée refusée avant Docker, instance dédiée, persistance, reset, idempotence, API health et cleanup                                             | Published at `fd0f084fc6316c379454ef701307e79471ed92e2` |
| C2A-R9-CI-01 | Qualifier le head source publié       | runs Infrastructure `39818813532`, Launcher Windows `39818813686`, Security `39818813647`, Quality Linux `39818813472`; tentative 1, head exact, merge synthétique `8cc7c81…`, quatre succès | CI PASS                                                 |
| C2A-R9-CI-02 | Préserver la provenance des compteurs | C1 47/47 ; Foundations 34/34 ; métier 1 contrôle statique + 11 scénarios réels ; suite API 217 PASS / 61 SKIP, dont 46 C1, 11 C2a et 4 Foundations-P0                                        | Counts reconciled; SKIP stay SKIP                       |
| C2A-R9-LIM-1 | Conserver incident et limites         | incident/restauration R9 maintenus ; intégrité byte-à-byte et état logique exhaustif préincident NON DEMONSTRATED ; signal Windows NON DEMONSTRATED ; production/fournisseurs non qualifiés  | Limits preserved                                        |
| C2A-R9-SCOPE | Préserver les frontières              | PR #52 `OPEN/Draft`, non fusionnée/non déployée ; C2b/C3 non commencés ; politique OSS différée                                                                                              | Scope preserved                                         |

## C2a R10–R11 — clôture cumulative et remédiation Next.js locale

| ID            | Exigence                                   | Matérialisation et preuve                                                                                                                                                             | État courant                        |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| C2A-R10-01    | Corriger uniquement le format de migration | postimage = préimage privée d'un LF ; SHA-256 `eba1a1e4…5c8a` ; exactement un LF final ; Foundations fresh/upgrade/projections/historique/ACL/transactions/C-05 34/34                 | CLOSED                              |
| C2A-R10-02    | Réconcilier les documents vivants          | état R9 publié séparé du candidat local R10+R11 ; historiques, 61 SKIP et réserves conservés                                                                                          | CLOSED                              |
| C2A-R11-01    | Fermer les advisories Next.js              | Next/env/SWC `16.4.1`, sharp `0.35.5`, aucune copie 16.3.8/16.4.2 ; Admin/Web/UI alignés ; audits complet et production à zéro                                                        | Local PASS                          |
| C2A-R11-02    | Préserver les protections supply-chain     | Vite 8.1.6, Vitest 4.1.12, Prisma/pg inchangés ; singleton/intégrités/parents ; alias tinyglobby 0.2.17 résolu depuis le plugin et emplacement unique vérifié                         | Local PASS                          |
| C2A-R11-03    | Qualifier consommateurs et outillage       | npm ci/ls, scanner et régressions, tooling 554/554, Admin 13/13, Web 10/10, UI 11/11, lint/typecheck/builds, HTTP loopback et optimisation d'image non offensive                      | Local PASS                          |
| C2A-R11-04    | Conserver la provenance des essais         | tooling 552/554, candidats npm et premier smoke restent NON-PASS ; reprises causales séparées et identifiées                                                                          | History preserved                   |
| C2A-R11-05    | Ne pas anticiper publication ou CI         | head PR courant `fd0f084f…` et quatre workflows R9 seulement ; commit/push R10+R11 et quatre workflows R11 encore conditionnels                                                       | Publication/CI R11 NOT YET EXECUTED |
| C2A-R11-LIM-1 | Préserver les réserves cumulatives         | incident R9 ; volumes/état logique préincident et signal Windows NON DEMONSTRATED ; 61 SKIP ; Linux et fournisseurs de production non qualifiés ; C2b/C3 non commencés ; OSS différée | Limits preserved                    |

## C2b — audit et export, candidat local initial du 2026-10-24

| ID           | Exigence                              | Matérialisation et preuve                                                                                                                                                                          | État courant                                                  |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| C2B-API-01   | Exposer quatre opérations exactes     | liste des audits, création/lecture/téléchargement d'export ; contrats 60 chemins, 67 opérations, 141 schémas et 53 modèles Prisma                                                                  | Local implemented                                             |
| C2B-PG-01    | Isoler identités, actions et données  | rôles API/worker, RLS/ACL, six actions littérales, refus croisés et contamination bidirectionnelle, état durable vérifié après refus                                                               | Local PASS                                                    |
| C2B-IDEM-01  | Idempotence et concurrence PostgreSQL | verrou advisory avant lecture, temps PostgreSQL, fenêtre 24 h, même clé/payload, payload différent et concurrence sur une même génération ; nouvelle génération expirée non exercée réellement     | Partial: expired reuse NON DEMONSTRATED                       |
| C2B-EXP-01   | Construire et vérifier l'export       | ZIP, manifeste JCS, JWS Ed25519, SHA-256, objet staging unique vérifié avant `READY`, leases/fencing, trois tentatives, budget et `COMMIT_UNKNOWN`                                                 | Partial: expiry mismatch, host clock and unbounded calls OPEN |
| C2B-REG-01   | Préserver C1 et C2a                   | C1 47/47 et métier C2a 1 statique + 11 scénarios réels passent ; écritures historiques préservées                                                                                                  | Partial: Foundations wrapper NON-PASS                         |
| C2B-QA-01    | Traverser les gates applicables       | format/lint/typecheck/build/OpenAPI 60/67/141/génération/tooling 556/556/scanner/licences PASS ; API mono-worker et officielle : 279 PASS / 68 SKIP chacune ; frontière réelle 10 000 entrées PASS | PASS — terminal GO blocked by separate findings               |
| C2B-SC-01    | Satisfaire le gate vulnérabilités     | audits frais complet/production exécutés sans correction automatique                                                                                                                               | BLOCK: 5 audit complet / 6 production vulnerabilities         |
| C2B-SCOPE-01 | Rester local et conserver les limites | aucun ajout Git, commit, push ou mutation GitHub ; providers/Linux production non qualifiés ; C3 non commencé ; politique OSS différée                                                             | Preserved                                                     |

## C2b R1 — fermeture cumulative locale du 2026-10-24

| ID              | Exigence                                | Matérialisation et preuve                                                                                                                                                               | État courant                          |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| C2B-R1-SIGN-01  | Versionner le profil signé              | manifeste JCS V2 à champs fermés ; règle exacte `READY_PLUS_24_HOURS`; JWS Ed25519 détaché, header fermé, ZIP immuable et `contentSha256` sur les octets finaux                         | PASS                                  |
| C2B-R1-TIME-01  | Faire autorité avec PostgreSQL          | `readyAt` et `expiresAt` produits au même CAS READY, intervalle exact 24 h ; téléchargement, leases et expiration sans décision d'horloge hôte                                          | PASS — real expiration exercised      |
| C2B-R1-IDEM-01  | Réutiliser une clé expirée atomiquement | nouvelle génération, historique conservé, concurrence et payload identique/différent ; rollback global et `COMMIT_UNKNOWN` neutre sans replay                                           | PASS — real PostgreSQL proof          |
| C2B-R1-EXT-01   | Borner les appels externes              | bornes explicites, annulation/isolation, fencing et réconciliation pour stockage, keyring, signature, BullMQ, lecture et cleanup                                                        | PASS — unit and real process proof    |
| C2B-R1-PG-01    | Qualifier la chaîne additive complète   | cinq migrations exactes, fresh/upgrade, projections, ACL, contamination, dispatch six actions et préservation C1/C2a ; migration finale SHA-256 `20c86f96…21704d`                       | PASS                                  |
| C2B-R1-BIZ-01   | Qualifier le runtime réel               | 11/11 scénarios PostgreSQL/Redis/HTTP, quatre opérations, worker processus/BullMQ, frontière 10 000, expiration, lease, idempotence, rollback et `COMMIT_UNKNOWN`                       | PASS                                  |
| C2B-R1-SC-01    | Fermer les advisories autorisés         | body-parser 2.4.0, multer 2.5.0, fast-uri 3.1.9, zod 4.6.6 ; installation propre, `npm ls` code 0, audits zéro, 933 signatures, 193 attestations, 935 licences conformes                | PASS                                  |
| C2B-R1-QA-01    | Traverser les gates applicables         | API 287 PASS/72 SKIP, tooling 567/567, scanner 466 fichiers, OpenAPI 60/67/141, 53 modèles Prisma, format/lint/typecheck/build/génération/licences PASS ; NON-PASS antérieurs conservés | PASS                                  |
| C2B-R1-SCOPE-01 | Rester local et préserver les réserves  | aucun add/commit/push/PR/workflow ; fournisseurs et Linux production non qualifiés ; Windows/R9/installations externes et SKIP conservés ; C3 non commencé ; OSS différée               | GO LOCAL — publication not authorized |

## C2b — raccordement CI prépublication du 2026-10-24

| ID           | Exigence                               | Matérialisation et preuve                                                                                                                                                  | État courant                  |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| C2B-CI-01    | Traverser les validateurs dans l'ordre | workflow C1 → Foundations C2a → métier C2a → runtime C2b → métier C2b → lifecycle → API health ; préparation des images sans valeur de preuve métier                       | PASS local — harness 53/53    |
| C2B-CI-02    | Isoler les campagnes C2b               | deux valeurs `KORA_C2B_INSTANCE` distinctes, dérivées du run et de la tentative, refus de `local`, attestation par le processus exécutant                                  | PASS — two clean campaigns    |
| C2B-CI-03    | Être portable sur le runner Linux      | résolution explicite par `Get-Command` de Docker, Node et npm ; absence des suffixes `docker.exe`, `node.exe` et `npm.cmd` dans les wrappers C2b                           | PASS local — CI still pending |
| C2B-CI-SCOPE | Ne pas annoncer une CI future          | qualification R1 locale conservée ; commit, push, Draft PR et quatre workflows restent conditionnels ; fournisseurs/production, réserves Windows/R9, SKIP et OSS inchangés | Preserved                     |
