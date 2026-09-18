# KORA+ Final — MVP Execution Plan

Statut : **APPROUVÉ — PLAN VIVANT**
Méthode : lots séquentiels et vertical slices contract-first
Autorité : [Master Execution Blueprint](MASTER_EXECUTION_BLUEPRINT.md)

Ce document consolide le plan V2 du Resolution Pack avec le séquencement
clean-room approuvé le 2026-07-28. Les anciens titres Sprint 0A/0B et les
réparations d’un Flutter historique sont conservés uniquement comme historique.

## État des gates et lots

| Gate ou lot         | Objectif                                      | Statut                            |
| ------------------- | --------------------------------------------- | --------------------------------- |
| Gate 0              | Sources approuvées et readiness clean room    | Completed                         |
| Lot 00              | Preflight read-only                           | Completed                         |
| Lot 00B             | Remédiation documentaire                      | Completed                         |
| Lot 00C             | Canonicalisation AdminLTE                     | Completed                         |
| S0.1                | Gouvernance et Git                            | Completed                         |
| S0.2                | Contrat monorepo et versions                  | Completed                         |
| S0.3                | Fondations applicatives                       | Closed and merged                 |
| S0.4                | Infrastructure locale                         | Closed and merged                 |
| S0.5                | CI, sécurité et observabilité                 | Closed and merged                 |
| M0.1                | Dependency Governance                         | Closed and merged                 |
| M0.2                | Supply-chain Security Hotfix                  | Closed and merged                 |
| S0.6                | Foundation Gate                               | Closed and merged                 |
| Slice 1 / S1.1      | Contrats, données cibles et expérience audio  | Closed and merged                 |
| Slice 1 / S1.2-01   | Contract & Data Readiness Gate                | Contract and data gate complete   |
| Slice 1 / S1.2-02   | Baseline PostgreSQL et contraintes SQL        | Closed and merged — PR #43        |
| Slice 1 / S1.2-03A  | Frontière PostgreSQL runtime en lecture seule | Draft PR #45 — R2 published/green |
| Slice 1 / S1.2-03B+ | Fonctionnalités runtime métier du pilote      | Not started                       |
| Slices suivantes    | Fonctionnalités produit ultérieures           | Not started                       |

## Sprint 0 — Clean-room foundation

### S0.1 — Gouvernance et Git

Livrables :

- documents d’autorité et documents vivants reliés ;
- règles d’agents et de contribution ;
- registre des 40 arbitrages et Decision Log consolidés ;
- matrice de traçabilité vivante, Definition of Done et Threat Model ;
- manifeste SHA-256 des sources immuables ;
- Git local sur `main` ;
- premier commit seulement avec identité Git préexistante.

Sortie actuelle : baseline gouvernée publiée sur `main`, aucun code applicatif
et aucune dépendance.

### S0.2 — Contrat monorepo et versions

Statut : **Completed**

Livré dans le périmètre autorisé :

- politique Node 22.18.0 et npm 10.9.3 ;
- workspaces npm explicites pour web, administration, API et packages partagés ;
- mobile Flutter maintenu hors des npm workspaces ;
- commandes communes avec état `NON EXÉCUTÉ` explicite en l’absence
  d’application ;
- arborescence canonique réservée sous `apps`, `packages`, `infra` et `assets` ;
- lockfile racine reproductible, sans dépendance ;
- aucun package métier ni début de Sprint 0.3.

### S0.3 — Fondations applicatives

Statut : **Closed and merged**

Livré dans le périmètre autorisé :

- shell mobile Flutter avec Riverpod, GoRouter et cinq onglets canoniques ;
- shells Next.js séparés pour le web public et l’administration ;
- shell NestJS sous `/api/v1`, health checks et limites Prisma/Redis explicites ;
- packages partagés étroits pour les contrats, la configuration et l’UI ;
- format, lint, typecheck, tests, builds non mobiles et smokes applicatifs ;
- états de fondation et goldens mobiles, sans comportement métier ;
- aucune migration, file BullMQ, logique financière ou intégration fournisseur.

Les gates CTO, Product Owner et juridique/licences sont fermés pour le
périmètre S0.3. Les quatre captures runtime Web/Admin sont versionnées avec
leurs dimensions et SHA-256. L’approbation visuelle porte uniquement sur le
shell de fondation et ne valide pas le design final de KORA+.

La fusion a été effectuée via la
[PR #2](https://github.com/Mohamed724000/kora/pull/2), avec le merge commit
[`d3f837c93044d0b514c2abd732c559cdd6543a96`](https://github.com/Mohamed724000/kora/commit/d3f837c93044d0b514c2abd732c559cdd6543a96).

Réserve non bloquante : le build iOS n’est pas exécutable sous Windows. Une
validation sur macOS reste obligatoire avant toute release iOS.

### S0.4 — Infrastructure locale

Statut : **Closed and merged**

- PostgreSQL et Redis locaux ;
- health checks et volumes nommés ;
- reset strictement ciblé ;
- aucune topologie de production.

La fusion a été effectuée via la
[PR #5](https://github.com/Mohamed724000/kora/pull/5), au merge commit
[`8c3e65e2bcbffb53050b61cab4b953f108491db1`](https://github.com/Mohamed724000/kora/commit/8c3e65e2bcbffb53050b61cab4b953f108491db1).

### S0.5 — CI, sécurité et observabilité

Statut : **Closed and merged**

- mêmes validations en local et CI ;
- analyse de secrets et dépendances ;
- logs structurés et redaction ;
- Sentry sûr sans DSN ;
- validation OpenAPI et rollback de fondation.

La fusion a été effectuée via la
[PR #6](https://github.com/Mohamed724000/kora/pull/6), au merge commit
[`c080ec0529e758203d4326f7ec5b0b0159cbdad7`](https://github.com/Mohamed724000/kora/commit/c080ec0529e758203d4326f7ec5b0b0159cbdad7).

Les gates de maintenance pré-S0.6 M0.1 et M0.2 ont ensuite été fusionnés aux
merge commits
[`79ceddc6cbf04b3d213001417da0841044af8206`](https://github.com/Mohamed724000/kora/commit/79ceddc6cbf04b3d213001417da0841044af8206)
et
[`40a224edc1dc018a080b6c188a804e361e96b5ef`](https://github.com/Mohamed724000/kora/commit/40a224edc1dc018a080b6c188a804e361e96b5ef).

### S0.6 — Foundation Gate

Statut : **Closed and merged — PASS WITH RESERVATIONS accepted**

Validation indépendante QA, sécurité et design. Aucun validateur ne corrige
silencieusement un défaut. La baseline exacte auditée est
`40a224edc1dc018a080b6c188a804e361e96b5ef`. Les réserves sont limitées aux
capacités externes ou de plateforme documentées dans le
[rapport S0.6](../qa/SPRINT_0_6_FOUNDATION_GATE_REPORT.md). La PR #28 a été
fusionnée au commit `a602fd38f32d018867c8a058deace0325b4a7c31`. Ce gate ne
démarrait ni Slice 1 ni aucune exigence produit.

## Slice 1 — Audio purchase pilot

Statut : **In progress — S1.2-02 closed — S1.2-03A Draft PR #45, R2 published and green — business runtime not started**

Parcours cible :

`Home public → catalogue → fiche audio → auth contextuelle → téléphone/mot de passe/OTP →
Order → PaymentAttempt sandbox → Entitlement → Mes achats → lecture signée →
création du contenu par l’administration`

Travaux contract-first :

- contrats OpenAPI et modèle cible ;
- catalogue audio administrable ;
- auth téléphone E.164/mot de passe/OTP, session mono-appareil et step-up ;
- paiement sandbox, Inbox/Outbox et ledger ;
- Entitlement et Mes achats ;
- descriptor de lecture signé ;
- E2E et réconciliation.

Gate : un achat audio sandbox complet, réconcilié, sans URL média brute.

### S1.1 — Audio Pilot Contract, Data & Experience Gate

Livré sans runtime métier ni migration :

- contrat OpenAPI des 32 chemins et 38 opérations du pilote, enveloppes,
  erreurs, ensembles d’authentification, clients,
  transitions et invariants ;
- types partagés générés et gate de dérive ;
- schéma Prisma cible à 30 modèles, sans migration ni seed ;
- contexte OTP serveur borné pour relier preuve password, appareil, client et
  session selon le parcours, sans exposer l’existence d’un compte ;
- machines d’état et invariants finance/média documentés et testés ;
- politique artiste `FLOOR_SETTLEMENT_WITH_ARTIST_CARRY_V1` prouvée en `BigInt`
  par artiste et Settlement, avec carry séquencé, relations composites et audit
  cible ;
- primitives Flutter premium, mobile guest-first et golden Windows à 341 px ;
- primitives administration light-only, accessibles et responsives ;
- Threat Model et traçabilité réconciliés.

Les détails sont consignés dans le
[contrat et modèle S1.1](../architecture/SLICE_1_1_AUDIO_PILOT_CONTRACT_AND_DATA_MODEL.md),
le [système d’expérience](../ux/SLICE_1_1_AUDIO_EXPERIENCE_SYSTEM.md) et le
[rapport de gate](../qa/SLICE_1_1_CONTRACT_DATA_UX_GATE_REPORT.md).

S1.1 est fermé et fusionné dans la baseline de départ de S1.2-01.

### S1.2-01 — Contract & Data Readiness Gate

Le gate prépare les contrats et le modèle cible sans runtime métier ni migration :

- OpenAPI 1.2.0 à 34 chemins, 40 opérations, 87 schémas et 18 invariants ;
- représentation de couverture publique contrôlée et versionnée, sans emplacement privé ;
- compteur de ventes réglées réel, strictement nul avant P4 ;
- provenance administrateur serveur pour `Artist` et `AudioContent`, avec future immutabilité SQL obligatoire ;
- cible TOTP, sessions, récupération et audit administrateur conforme aux ADR ;
- Inbox Mux authentifiée, chiffrée, durable, corrélée par références privées uniques et incapable de publier ;
- republication append-only après archivage ;
- Prisma à 33 modèles cibles, sans migration ni seed ;
- types TypeScript et gates négatifs réconciliés.

Les détails sont consignés dans le
[document d’architecture S1.2-01](../architecture/SLICE_1_2_01_CONTRACT_AND_DATA_READINESS_GATE.md)
et le
[rapport de validation](../qa/SLICE_1_2_01_CONTRACT_AND_DATA_READINESS_GATE_REPORT.md).

### S1.2-02 — Canonical PostgreSQL Baseline and SQL Constraints

La baseline, dont la preuve locale prépublication date du 2026-09-15,
matérialise les 33 modèles canoniques dans deux migrations versionnées :
génération Prisma déterministe puis contraintes PostgreSQL. Les
garanties SQL couvrent notamment publication active unique et médias `READY`,
provenance administrateur immuable, références fournisseur attribuables une
fois, preuves append-only, isolation par FK composites, bornes arithmétiques,
machines d’état, ledger équilibré et conservation artiste floor/carry.

La validation applique deux fois les migrations sur deux bases vides distinctes,
contrôle 33 tables, 54 FK, 133 index, 47 `CHECK`, 33 fonctions et 45 triggers,
exécute les tests positifs/négatifs, compare une signature structurelle identique
et supprime les seules bases éphémères créées. Le détail et la classification des
garanties figurent dans le
[document d’architecture S1.2-02](../architecture/SLICE_1_2_02_POSTGRESQL_BASELINE.md).

Le runtime S1.2-03 reste **Not started** : aucun catalogue, auth administrateur,
paiement, webhook, upload, Entitlement ou playback runtime n’est livré par cette
baseline.

État post-fusion constaté le 2026-09-15 : la PR #43 est fusionnée et fermée dans
`main` au merge `4a1f4306871cac661fa12d4f326495fc43cddbb4`, parents ordonnés
`dfb6445cb157b03142b7f1b01952fa76fdef16f9` puis
`2022f5a229c8cb5138205f5fb02d37ea344ef73b`, arbre
`95a9036ec5e287b78cdd2771010509d24292fa29`. L’unique commit S1.2-02 publié
`2022f5a229c8cb5138205f5fb02d37ea344ef73b` et ses 14 fichiers sont préservés.
Les workflows post-fusion `push/main` Infrastructure `34986168463`, Launcher
Windows `34986168571`, Security `34986168621` et Quality Linux `34986168424`
ont tous conclu `completed/success`. Aucun tag, release ou déploiement n’a été
créé ; aucun endpoint, service, worker, seed, runtime métier ou interface n’est
livré. L’analyse S1.2-03 demeure une proposition soumise à une décision séparée
et n’autorise ni ne démarre S1.2-03A.

Ces constats restent la preuve historique de la clôture S1.2-02. Une
autorisation Product Owner séparée du 2026-09-16 a ensuite démarré S1.2-03A
depuis le merge `main` `95bdfcf30a14e05ae90b09150cf289e1e0343c0d`, après la
fusion de la PR #44 et les quatre workflows `push/main` réussis.

### S1.2-03A — PostgreSQL Least-Privilege Runtime Boundary & Prisma Adapter

Statut : **Draft PR #45 open — R3 published — four R3 workflows green — R4 validated locally — R4 publication authorized — not merged**

L’instantané local prépublication du 2026-09-16 a été validé avant indexation,
commit, push ou création de PR. Ces absences décrivent uniquement cet instantané
historique. La Draft PR #45 avait pour head initial publié
`974d7afa9d4dc9ceb88a35bd5bd7ae3f477cb875`. Ses runs initiaux ont réussi pour
Security `35119052015` et échoué pour Infrastructure `35119052104`, Launcher
Windows `35119052049` et Quality Linux `35119052101`, faute de génération du
client Prisma après `npm ci`. Ces échecs R0 sont historiques. La correction R1
a été publiée au head
`41b3d8f33a637108814208258a3e99b105be1afc`. Launcher Windows `35155026009`,
Security `35155025993` et Quality Linux `35155026016` y ont réussi ; l’échec
historique Infrastructure R1 `35155026285` venait du smoke qui lançait encore
l’API avec le propriétaire/migrateur, que le garde a correctement refusé. Dans
son instantané local antérieur au commit, le correctif R2 conservait les migrations
sous le propriétaire, vérifiait ce refus puis lançait l’API avec le rôle runtime
provisionné. Cette preuve locale R2 du 2026-09-16 est historique et n’annonçait
aucun résultat CI futur.

R2 a ensuite été publié au head
`9d163cc34caa57cd671b6783048d89dde6d18069`. Infrastructure `35162113781`,
Launcher Windows `35162113686`, Security `35162113920` et Quality Linux
`35162113691` ont tous conclu `pull_request/completed/success` sur ce head
exact. La PR #45 reste ouverte, Draft et non fusionnée ; aucun passage en Ready
ou merge n’est autorisé et S1.2-03B reste `Not started`.

L’instantané local prépublication de la réconciliation R3 du 2026-09-17 a été
établi alors qu’aucun commit, push, changement de PR ou rerun R3 n’avait été
effectué ; aucun SHA ou Run ID R3 futur n’y était affirmé.

R3 a ensuite été publié au head
`8f8c447b9badd3c8bd330982a1c0e7ef38e246cf`. Infrastructure `35209186465`,
Launcher Windows `35209186447`, Security `35209186482` et Quality Linux
`35209186464` ont tous conclu `pull_request/completed/success`. La revue CTO
a maintenu la PR en Draft et bloqué la fusion sur le compteur historique R1 et
la couverture des schémas hors `public`. Le corps de PR porte désormais le
compteur R1 exact `+118/-42`, sans modifier son cumul R3
`4 commits, 28 fichiers, +2761/-187`.

Dans l’instantané historique local prépublication du 2026-09-18, le correctif
R4 étend l’attestation à tous les schémas non système de la base courante, aux
types, aux options de redélégation et à toute propriété enregistrée. Un état
dangereux tiers, y compris un default ACL d’un autre propriétaire dans `public`,
est refusé par l’API et le provisionneur ; sa signature reste inchangée. Au
moment de cet instantané, aucun commit, push, rerun, Ready ou merge R4 n’avait
été effectué.

Périmètre livré localement :

- compte propriétaire/migrateur distinct du rôle API runtime ;
- rôle runtime `LOGIN`, `NOINHERIT`, sans attribut administratif, membership,
  propriété, option de redélégation, DDL, écriture table, privilège de séquence,
  type ou exécution de routine dans tout schéma non système de la base courante ;
- droits effectifs bornés à `CONNECT`, `USAGE` du schéma `public` et `SELECT`
  sur les tables canoniques, après révocation des droits hérités de `PUBLIC` ;
- pool PostgreSQL unique connecté à Prisma 7.9.1 par
  `@prisma/adapter-pg` 7.9.1 et partagé par la readiness ;
- génération Prisma 7.9.1 systématique avant build, typecheck et tests API,
  avec un test de contrat empêchant une dépendance à un client préexistant ;
- attestation bloquante avant `application.init()` et fermeture contrôlée si
  le compte reçu est privilégié ou dispose de droits inattendus, directement
  ou via `PUBLIC`, sur `public` ou un autre schéma non système ;
- provisioning local idempotent et validateur isolé sur deux bases PostgreSQL
  18.4 indépendantes ; les états tiers dangereux sont refusés de façon
  déterministe sans réécriture d’ACL ou de propriété ;
- preuves négatives `42501` pour DDL, `TRUNCATE`, modification de trigger,
  `SET ROLE` propriétaire et `INSERT`/`UPDATE`/`DELETE` métier.

Le lot ne modifie ni `schema.prisma`, ni les migrations S1.2-02, ni OpenAPI,
les contrats générés ou les workflows. Il ne livre aucun endpoint, flux métier,
authentification Admin, seed, interface, média ou paiement. Toute capacité
d’écriture future exige un rôle serveur distinct, borné à son cas d’usage et
une autorisation de lot séparée ; elle ne doit pas élargir le rôle de lecture
S1.2-03A.

Avant toute nouvelle chaîne visible du futur runtime mobile, un lot autorisé
devra intégrer `AppLocalizations`, les ressources de langues et leurs tests de
fallback. Ce gate est planifié mais non commencé ; il n’ajoute ici ni manifeste,
dépendance ni infrastructure i18n.

## Slices suivantes

| Slice                                 | Contenu                                                                        | Statut      |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------- |
| 2 — Discovery & Public Web            | Recherche, catégories, tendances, SEO et deep links ; aucun achat/playback web | Not started |
| 3 — Library & Media Types             | Albums, favoris, playlists, historique, vidéo, podcast et livre                | Not started |
| 4 — Secure Offline                    | Chunks chiffrés, reprise, licence liée appareil et révocation                  | Not started |
| 5 — Artist Finance                    | Earnings immuables, soutien, soldes, retraits et réconciliation                | Not started |
| 6 — Loyalty, Notifications & Security | Paliers, préférences, delivery et opérations sécurité                          | Not started |

## Gates bêta et production

### Bêta

- certification sandbox ;
- tests 3G, faible mémoire et accessibilité ;
- remboursements, chargebacks et réconciliation ;
- droits, vie privée, sauvegarde, restauration et rollback ;
- validation visuelle sur appareils réels.

### Production

- stratégie stores et contrats paiement/SMS ;
- secrets/KMS et environnements isolés ;
- tests de pénétration et charge ;
- audit financier indépendant ;
- déploiement progressif et runbooks.

## V2

- billetterie et QR ;
- avis, notes et modération ;
- VdoCipher ou DRM matériel avancé ;
- WebAuthn, wallet et recommandation avancée.

## Règles permanentes

- OpenAPI avant clients.
- Modèles financiers avant migrations.
- Order avant PaymentAttempt ; règlement avant Entitlement.
- Descriptors signés avant player complet.
- Licences avant offline.
- Réconciliation avant paiements réels.
- Aucun lot ou feature ne passe à `In progress` sans autorisation explicite.
