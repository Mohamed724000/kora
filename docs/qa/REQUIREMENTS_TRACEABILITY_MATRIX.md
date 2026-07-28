# Matrice de traçabilité des exigences

## Objet

Cette matrice reprend les 68 identifiants de l’artefact source immuable
[KORA_PLUS_Requirements_Traceability_Matrix_V1.xlsx](../source-material/originals/KORA_PLUS_Requirements_Traceability_Matrix_V1.xlsx).
Elle sert de registre vivant pour l’implémentation et la vérification. Elle ne
modifie ni les exigences sources ni les décisions d’architecture applicables.

Les colonnes `Implémentation`, `Vérification` et `Preuve` décrivent l’état réel
du dépôt à la date du présent lot. Sprint 0.1 et Sprint 0.2 ne produisent aucun
code applicatif.

## Exigences produit

| ID | Source officielle (XLSX, colonne B) | Exigence synthétisée | Phase / lot source | Statut de spécification source | ADR ou arbitrage applicable | Implémentation | Vérification | Preuve |
|---|---|---|---:|---|---|---|---|---|
| REQ-P0-01 | CdC §6 ; Engineering §4 | Fondations du schéma de données | P0 | Specified | REG-18 à REG-31 selon le domaine | Not started | Not verified | — |
| REQ-P1-01 | UI/UX §5 | Design system mobile | P1 | specified | Sources UI/UX ; REG-35 | Not started | Not verified | — |
| REQ-P1-02 | Back-Office §8 | Design system administration | P1 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P1-03 | CdC §19 | Données de seed | P1 | specified | Source Engineering ; aucun ADR spécifique | Not started | Not verified | — |
| REQ-P2-01 | CdC §8.1 ; UI/UX §4.6 | Accueil mobile | P2 | corrected v1.1 | ADR-010 ; REG-15 | Not started | Not verified | — |
| REQ-P2-02 | CdC §9.4 ; UI/UX §4.7 | Découverte et recherche | P2 | specified | Source UI/UX | Not started | Not verified | — |
| REQ-P2-03 | UI/UX §4.8 | Parcours par catégorie | P2 | specified | Source UI/UX | Not started | Not verified | — |
| REQ-P2-04 | CdC §6.2 ; UI/UX §4.9 | Détail d’un contenu | P2 | specified | ADR-007/017/021 : `ArtistSupport`, preview ; avis reportés en V2 | Not started | Not verified | — |
| REQ-P2-05 | UI/UX §4.10 | Profil artiste | P2 | specified | ADR-007/014 | Not started | Not verified | — |
| REQ-P2-06 | CdC §4.5 | Web public | P2 | specified | ADR-017 : aucune preview ni lecture web | Not started | Not verified | — |
| REQ-P3-01 | CdC §8.2 ; UI/UX §4.2 | Connexion mobile | P3 | specified | ADR-010 | Not started | Not verified | — |
| REQ-P3-02 | CdC §8.2 ; UI/UX §4.3 | Inscription | P3 | specified | ADR-010 | Not started | Not verified | — |
| REQ-P3-03 | Engineering §5.1.3 ; UI/UX §4.4 | Vérification OTP | P3 | specified | ADR-010 | Not started | Not verified | — |
| REQ-P3-04 | UI/UX §4.5 | Mot de passe oublié | P3 | specified | ADR-010 | Not started | Not verified | — |
| REQ-P3-05 | CdC §17.2 ; Engineering §9.3 | Session mono-appareil | P3 | specified | Source Engineering | Not started | Not verified | — |
| REQ-P4-01 | CdC §13.2 ; UI/UX §4.11 | Sélection du moyen de paiement | P4 | specified | ADR-012/022 : fournisseurs configurés et gate contractuel | Not started | Not verified | — |
| REQ-P4-02 | UI/UX §4.12 | Suivi du statut de paiement | P4 | specified | ADR-012/015 : `PaymentAttempt`, Inbox et Outbox | Not started | Not verified | — |
| REQ-P4-03 | UI/UX §4.13 | Liste des achats | P4 | specified | ADR-016 : accès piloté par `Entitlement` | Not started | Not verified | — |
| REQ-P4-04 | UI/UX §4.14 | Commande et reçu | P4 | specified | ADR-012/013/016 : tentatives, ledger, remboursement et droit | Not started | Not verified | — |
| REQ-P5-01 | CdC §14 ; UI/UX §4.20 | Fidélité mobile | P5 | specified | ADR-013 : effet des remboursements | Not started | Not verified | — |
| REQ-P5-02 | CdC §14.5 ; Back-Office §6.20 | Classement de fidélité | P5 | specified | ADR-013 : un remboursement ne déclasse pas le palier atteint | Not started | Not verified | — |
| REQ-P5-03 | CdC §14.3 ; Back-Office §6.21 | Seuils de fidélité | P5 | specified | Source produit | Not started | Not verified | — |
| REQ-P6-01 | CdC §12.1 ; UI/UX §4.15 | Mini-lecteur | P6 | specified | ADR-017 : `PreviewGrant` et descripteur signé, mobile uniquement | Not started | Not verified | — |
| REQ-P6-02 | UI/UX §4.16 | Lecteur audio complet | P6 | specified | ADR-011/016/017 : contenu, droit et descripteur signé | Not started | Not verified | — |
| REQ-P6-03 | UI/UX §4.17 | Lecteur vidéo | P6 | specified | ADR-011/016/017 | Not started | Not verified | — |
| REQ-P6-04 | UI/UX §4.18 | Lecteur de livre | P6 | specified | ADR-011/016 | Not started | Not verified | — |
| REQ-P7-01 | CdC §12.3 ; Engineering §9.7 | Téléchargement et licence hors ligne | P7 | specified | ADR-018 | Not started | Not verified | — |
| REQ-P7-02 | Engineering §5.6.2 | Révocation hors ligne | P7 | specified | ADR-016/018/020 : le support ne révoque pas le droit ou la session | Not started | Not verified | — |
| REQ-P8-00a | Back-Office §6.1 | Connexion administration | P8 | Corrected V1.1 | ADR-002/005/008/020 | Not started | Not verified | — |
| REQ-P8-00b | Back-Office §6.2 ; Addendum §1.3.2-3 | Enrôlement TOTP | P8 | New V1.1 | ADR-002/005 | Not started | Not verified | — |
| REQ-P8-00c | Back-Office §6.2bis ; Addendum §1.3.4 | Connexion TOTP | P8 | Corrected V1.1 | ADR-002/005/008 | Not started | Not verified | — |
| REQ-P8-00d | Back-Office §6.2ter ; Addendum §1.3.5-6 | Codes de récupération | P8 | New V1.1 | ADR-002/005 | Not started | Not verified | — |
| REQ-P8-00e | Back-Office §6.3 | Session expirée | P8 | specified | ADR-005/008 | Not started | Not verified | — |
| REQ-P8-00f | Back-Office §6.4 ; Addendum §1.3.7 | Récupération d’accès | P8 | Corrected V1.1 | ADR-002/005/008 | Not started | Not verified | — |
| REQ-P8-00g | Back-Office §6.5 | Accès refusé | P8 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P8-01 | Back-Office §6.6 ; Addendum §3 | Tableau de bord administration | P8 | Corrected V1.1 | ADR-003/020 | Not started | Not verified | — |
| REQ-P8-02 | CdC §16.1 ; Back-Office §6.7 | Liste des utilisateurs | P8 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P8-03 | Back-Office §6.8 ; Addendum §5 | Détail utilisateur, blocage et sessions | P8 | Corrected V1.1 | ADR-005/008/020 : le support ne bloque ni ne révoque les sessions | Not started | Not verified | — |
| REQ-P8-04 | CdC §16.1 ; Back-Office §6.9 | Liste des artistes | P8 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P8-05 | CdC §15.1 ; Engineering §5.9.1 | Création d’un compte artiste | P8 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P8-06 | Engineering §5.9.2 ; Back-Office §6.11 ; Addendum §5 | Détail artiste, contenus et paiements | P8 | Corrected V1.1 | ADR-014/020 : `artistRevenueShareBps` et moindre privilège | Not started | Not verified | — |
| REQ-P8-07 | CdC §8.6 ; Engineering §5.9.3 ; Back-Office §6.12 | Liste des contenus | P8 | specified | ADR-020 | Not started | Not verified | — |
| REQ-P8-08 | Engineering §5.9.3-4 ; Back-Office §6.13 | Création, édition et publication d’un contenu | P8 | specified | ADR-011/020 : administration seule au MVP | Not started | Not verified | — |
| REQ-P8-09 | CdC §15.2 ; UI/UX §4.24 | Tableau de bord artiste mobile en lecture seule | P8 | specified | ADR-014 | Not started | Not verified | — |
| REQ-P8-10 | UI/UX §4.24bis | Statistiques artiste | P8 | specified | ADR-014 | Not started | Not verified | — |
| REQ-P8-11 | CdC §15.4 ; UI/UX §4.25 | Demande de paiement artiste | P8 | specified | ADR-014 | Not started | Not verified | — |
| REQ-P9-01 | Back-Office §6.14-15 ; Addendum §5 | Commandes dans l’administration | P9 | corrected v1.1 | ADR-012/020 : plusieurs `PaymentAttempt` immuables | Not started | Not verified | — |
| REQ-P9-02 | Engineering §5.10.7 ; Back-Office §6.16 | Liste des paiements | P9 | specified | ADR-012/013/015/020 | Not started | Not verified | — |
| REQ-P9-03 | Back-Office §6.17 ; Addendum §5 | Rapprochement, nouvelle tentative et remboursement | P9 | corrected | ADR-012/013/015/016 | Not started | Not verified | — |
| REQ-P9-04 | CdC §13.1 ; Engineering §5.4 | Fournisseurs de paiement réels | P9 | specified | ADR-022 : gate contractuel obligatoire | Not started | Not verified | — |
| REQ-P9-05 | Back-Office §6.18 ; Addendum §5 | Soldes et partage de revenus artiste | P9 | corrected | ADR-014 : `artistRevenueShareBps` | Not started | Not verified | — |
| REQ-P9-06 | Engineering §5.10.8 ; Back-Office §6.19 | Workflow des paiements artistes | P9 | specified | ADR-014 | Not started | Not verified | — |
| REQ-P10-01 | CdC §17.1 ; Engineering §9.9 | Watermark | P10 | specified | ADR-011/017/018 | Not started | Not verified | — |
| REQ-P10-02 | CdC §17.1 ; Engineering §9.10 | Mesures anti-capture | P10 | specified | ADR-024 : protection réaliste, sans garantie absolue | Not started | Not verified | — |
| REQ-P10-03 | UI/UX §4.21 | Gestion des sessions sur mobile | P10 | specified | ADR-010 | Not started | Not verified | — |
| REQ-P10-04 | CdC §17 ; Engineering §5.10.9 ; Back-Office §6.22 | Centre de sécurité administration | P10 | specified | ADR-002/005/008/020 | Not started | Not verified | — |
| REQ-P10-05 | CdC §16 ; Addendum §4 | Journal d’audit | P10 | corrected | ADR-004/019 | Not started | Not verified | — |
| REQ-P10-06 | UI/UX §4.22 | Notifications mobile | P10 | specified | ADR-021 : modèles de notification dédiés | Not started | Not verified | — |
| REQ-P10-07 | Back-Office §6.23-24 ; Addendum §5 | Notifications administration | P10 | corrected | ADR-021 : modèles de notification dédiés | Not started | Not verified | — |
| REQ-P10-08 | CdC §16.1 ; Back-Office §6.25 ; Addendum §2.5 | Catalogue de référence et bannières | P10 | corrected | ADR-006/011 | Not started | Not verified | — |
| REQ-P10-09 | CdC §16.1 ; Back-Office §6.26 ; Addendum §2.6 | Configuration de la plateforme | P10 | corrected | ADR-006/014 : `artistRevenueShareBps` | Not started | Not verified | — |
| REQ-P10-10 | UI/UX §4.23 | Support mobile | P10 | specified | ADR-007/020 | Not started | Not verified | — |
| REQ-P11-01 | Engineering §11.6 ; Back-Office §12 | Tests E2E Playwright | P11 | specified | Definition of Done et exigences source | Not started | Not verified | — |
| REQ-P11-02 | Engineering §11.2-3 | Tests widget et golden | P11 | specified | Definition of Done et exigences source | Not started | Not verified | — |
| REQ-P11-03 | Back-Office §12 ; Addendum | Accessibilité et responsive administration | P11 | specified | ADR-020 et Definition of Done | Not started | Not verified | — |
| REQ-P11-04 | CdC §22 | Acceptation du MVP | P11 | specified | Definition of Done | Not started | Not verified | — |
| REQ-P12-01 | Engineering §12 | CI/CD | P12 | specified | Master Blueprint et Definition of Done | Not started | Not verified | — |
| REQ-P12-02 | Engineering §2.9 | Monitoring | P12 | specified | ADR-019 et Threat Model | Not started | Not verified | — |

## Contrôles de gouvernance de Sprint 0.1

| ID | Contrôle | État | Preuve attendue |
|---|---|---|---|
| GOV-S0.1-01 | Baseline clean-room et archive AdminLTE canonique | Vérifié | Rapport validé du Lot 00C et manifeste de baseline |
| GOV-S0.1-02 | Seize artefacts de gouvernance autorisés, complets et cohérents | Verified | Validation documentaire de Sprint 0.1 |
| GOV-S0.1-03 | Dépôt Git local initialisé sur `main` | Verified | Métadonnées Git locales |
| GOV-S0.1-04 | Premier commit local unique | Verified | Commit `44505233361ecd9b13dbae82deb69e5c47f0d65e` |
| GOV-S0.1-05 | Remote officiel unique ; aucun tag ou hook actif | Verified | `origin` vers `https://github.com/Mohamed724000/kora.git` |
| GOV-S0.1-06 | Aucun secret ou artefact applicatif introduit | Verified | Scans de Sprint 0.1 |

## Contrôles de gouvernance de Sprint 0.2

| ID | Contrôle | État | Preuve attendue |
|---|---|---|---|
| GOV-S0.2-01 | Contrat racine privé et versions verrouillées | Verified | `package.json`, `.nvmrc` et `package-lock.json` ; revue CTO PASS sur PR #1 |
| GOV-S0.2-02 | Validation Node/npm sans dépendance | Verified | `npm.cmd run env:check` retourne le code 0 ; revue CTO PASS sur PR #1 |
| GOV-S0.2-03 | Neuf zones canoniques réservées sans package applicatif | Verified | Inventaire des zones et scan des manifestes enfants ; revue CTO PASS sur PR #1 |
| GOV-S0.2-04 | Zéro dépendance, code métier ou source immuable modifiée | Verified | Lockfile vide, scans du dépôt et manifeste 52/52 ; revue CTO PASS sur PR #1 |

## Règles de mise à jour

- Une exigence ne passe à `Implémentée` qu’avec une preuve versionnée.
- Une exigence ne passe à `Vérifiée` qu’après exécution du contrôle prévu et
  enregistrement de son résultat.
- Une évolution contradictoire avec une source immuable exige une décision
  explicite du Product Owner et, lorsque nécessaire, un nouvel ADR.
- Les identifiants sources ne sont ni renommés ni réutilisés.
