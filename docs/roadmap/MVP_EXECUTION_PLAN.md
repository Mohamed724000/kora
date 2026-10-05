# KORA+ Final — MVP Execution Plan

Statut : **APPROUVÉ — PLAN VIVANT**
Méthode : lots séquentiels et vertical slices contract-first
Autorité : [Master Execution Blueprint](MASTER_EXECUTION_BLUEPRINT.md)

Ce document consolide le plan V2 du Resolution Pack avec le séquencement
clean-room approuvé le 2026-07-28. Les anciens titres Sprint 0A/0B et les
réparations d’un Flutter historique sont conservés uniquement comme historique.

## État des gates et lots

| Gate ou lot         | Objectif                                      | Statut                                                                       |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Gate 0              | Sources approuvées et readiness clean room    | Completed                                                                    |
| Lot 00              | Preflight read-only                           | Completed                                                                    |
| Lot 00B             | Remédiation documentaire                      | Completed                                                                    |
| Lot 00C             | Canonicalisation AdminLTE                     | Completed                                                                    |
| S0.1                | Gouvernance et Git                            | Completed                                                                    |
| S0.2                | Contrat monorepo et versions                  | Completed                                                                    |
| S0.3                | Fondations applicatives                       | Closed and merged                                                            |
| S0.4                | Infrastructure locale                         | Closed and merged                                                            |
| S0.5                | CI, sécurité et observabilité                 | Closed and merged                                                            |
| M0.1                | Dependency Governance                         | Closed and merged                                                            |
| M0.2                | Supply-chain Security Hotfix                  | Closed and merged                                                            |
| S0.6                | Foundation Gate                               | Closed and merged                                                            |
| Slice 1 / S1.1      | Contrats, données cibles et expérience audio  | Closed and merged                                                            |
| Slice 1 / S1.2-01   | Contract & Data Readiness Gate                | Closed and merged                                                            |
| Slice 1 / S1.2-02   | Baseline PostgreSQL et contraintes SQL        | Closed and merged — PR #43                                                   |
| Slice 1 / S1.2-03A  | Frontière PostgreSQL runtime en lecture seule | Closed and merged — PR #45                                                   |
| Slice 1 / S1.2-03B  | Admin Security Contract Gate, sans runtime    | Closed and merged — PR #48, merge `c97992ca2c82bc4f22f9222ea98ed53714fede4c` |
| Slice 1 / S1.2-03C1 | Auth admin, TOTP et sessions runtime          | R5 published in Draft PR #50; R6 local snapshot validated 2026-10-05         |
| Slice 1 / S1.2-03C2 | Recovery, audit, invitations et RBAC runtime  | Not started — separate authorization required                                |
| Slice 1 / S1.2-03C3 | Interface d'authentification Admin            | Not started — separate authorization required                                |
| Slice 1 / S1.2-03D  | Artist API                                    | Not started                                                                  |
| Slice 1 / S1.2-03E  | Artist Admin UI                               | Not started                                                                  |
| Slice 1 / S1.2-03F  | Audio Draft API                               | Not started                                                                  |
| Slice 1 / S1.2-03G  | Audio Draft Admin UI                          | Not started                                                                  |
| Slice 1 / S1.2-03H  | Controlled Upload                             | Not started                                                                  |
| Slice 1 / S1.2-03I  | Mux, Inbox et Outbox                          | Not started                                                                  |
| Slice 1 / S1.2-03J  | Publication et archivage                      | Not started                                                                  |
| Slice 1 / S1.2-03K  | Catalogue public et détail                    | Not started                                                                  |
| Slice 1 / seed      | Seed/licences distinct                        | Not started                                                                  |
| Slices suivantes    | Fonctionnalités produit ultérieures           | Not started                                                                  |

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

Statut : **In progress — S1.2-02 closed — S1.2-03A closed and merged —
S1.2-03B closed and merged — S1.2-03C1-R5 published in Draft PR #50 with four
green workflows — R6 local prepublication snapshot validated on 2026-10-05 —
production key provider not qualified — C2/C3 not started**

R3 est publié au head `b0792934aa2f9d6f6d481517f384825874d72402`, parent R2
`59972cc0614842627c8c17717605345eaae277c4`, arbre
`87e41d9304820a1ebf8808fc783a5407a8c2105d`. La Draft PR #50 totalise quatre
commits, 78 fichiers et `+16965/-642`. Infrastructure `37190396720`, Launcher
Windows `37190396716`, Security `37190396718` et Quality Linux `37190396709`
sont tous `pull_request/completed/success`, tentative 1, sur ce head exact.

La revue CTO terminale ultérieure maintient **BLOCK** sur un finding **HIGH**. Cinq findings R3 sont
clos ; le finding de sink d'échec restait partiellement corrigé pour certaines
pannes de `refresh`, `revokeCurrent` et `revokeOther`. R4 conserve maintenant
le contexte prouvé par invocation, sans sujet client inventé ni état mutable
partagé, et préserve le traitement du COMMIT inconnu.

La validation R4 finale couvre PostgreSQL A/B et 30/30 tests réels, puis l'API
avec 17 suites, 87 tests réussis et 29 `skipped`, ainsi qu'OpenAPI 60/67/137 et
la génération inchangée. Les onze fichiers techniques R3 relatifs notamment à
PostgreSQL/Infrastructure restent figés ; R4 ne touche que trois fichiers
Auth/tests et six documents autorisés. Dans l'instantané local prépublication
du 2026-10-04, R4 était non indexé, non commité et non publié ; après cet
instantané, l'état Git/GitHub fait foi. La clôture séparée de l'incident
matériel 03A, à sémantique préservée et de cause **NON CONCLUSIVE**, ne modifie
ni la roadmap ni l'ordre de C2/C3. Aucune capacité C2 ni interface C3 n'est
autorisée par ce statut.

R4 est publié au head `cdc020caa8b06d74af816dc072e778e25e020699`; ses quatre
workflows `37242762675`, `37242762612`, `37242762666` et `37242762665`
réussissent en tentative 1. La revue terminale suivante maintient **BLOCK** sur
deux findings de routage d'audit : perte de contexte recovery après preuve sur
les trois opérations enrollment, et sink erroné de la liste des sessions avant
ou après la liaison user/session/JTI complète.

R5 ferme localement ces deux findings. Le wrapper final passe 34/34 tests réels
sur les douze opérations avec PostgreSQL A/B et Redis. Les contrôles API passent
avec 90 tests réussis et 33 conditionnels `skipped`, puis build; OpenAPI reste
à 60/67/137 et les audits npm frais restent à zéro vulnérabilité. R5 ne change
ni roadmap, modèle, migration, dépendance, workflow, contrat ni critères
d'acceptation. Il reste non indexé, non commité et non publié; la PR #50 reste
Draft. La politique open source est différée et non installée, le fournisseur
de clés de production **NON QUALIFIÉ**, la recommandation JTI séparée, la
pagination **NON CONCLUSIVE**, et C2/C3 `Not started`.

R5 est ensuite publié au head `89323beb1ebbae9a488456db5d1dc2cb19215dd6`,
arbre `43b4448ed68f4093dc3e6c636257dae100d4d755`. Ses quatre workflows
`37317920495`, `37317920363`, `37317920190` et `37317920587` réussissent en
tentative 1. La PR #50 reste `OPEN`, Draft, `CLEAN/MERGEABLE` et non fusionnée,
avec six commits et 78 fichiers.

R6 ferme localement le finding de réutilisation d'une connexion après échec
pré-COMMIT suivi d'un rollback non confirmé. Le client est détruit lors de son
unique libération; les deux erreurs restent agrégées, sans retry ni changement
de la sémantique COMMIT inconnu. Un pool PostgreSQL réel dédié `max=1` prouve le
retrait et le remplacement du backend, l'absence de la mutation abandonnée et
la réussite saine suivante. Le parcours HTTP distinct prouve 503 neutre,
rollback métier, un seul rejet contextuel et aucun succès contradictoire.

La validation finale couvre 13/13 tests writer, 36/36 parcours réels dans le
wrapper et 17 suites API avec 93 tests réussis et 35 conditionnels `skipped`,
plus lint, typecheck, build, audits npm à zéro et scanner officiel sur 384
fichiers. R6 ne change ni roadmap, contrat, service Auth/session, modèle,
migration, ACL, provisioning, wrapper, dépendance, lockfile, workflow ni
critère d'acceptation. Il reste local, non indexé, non commité et non publié;
la décision de publication R6 puis la revue terminale C1 restent distinctes.
La politique open source demeure différée et non installée, le fournisseur de
clés de production **NON QUALIFIÉ**, la recommandation JTI séparée, la
pagination **NON CONCLUSIVE**, et C2/C3 `Not started`.

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

Statut : **Closed and merged — PR #45 — technical baseline R8 preserved — post-merge workflows green**

Dans la chronologie R0 à R9 ci-dessous, les mentions `Draft`, ouverte ou non
fusionnée sont des instantanés historiques rattachés au head cité ; elles ne
décrivent pas l’état courant après la clôture post-fusion.

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

R4 est ensuite publié au commit
`ebcd3fc02c15b0ee9cf679978ab197e9865a1737`. Launcher Windows `35402506744`,
Security `35402506756` et Quality Linux `35402506746` réussissent ;
Infrastructure `35402506742` échoue parce que le smoke exige un code de
propriété absent de l’état PostgreSQL observé. Dans l’instantané prépublication
R5 du 2026-09-18, l’oracle est corrigé sans changer l’attestation API : l’erreur
typée, l’attribut administratif et les droits d’écriture restent obligatoires.
À la date de cet instantané, R5 n’était ni commité ni publié, aucun rerun
n’avait été lancé et S1.2-03B restait `Not started`.

R5 est ensuite publié au commit
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`, parent
`ebcd3fc02c15b0ee9cf679978ab197e9865a1737`, avec 10 fichiers et
`+350/-105`. Infrastructure `35454834845`, Launcher Windows `35454834879`,
Security `35454834839` et Quality Linux `35454834904` sont tous
`pull_request/completed/success` sur ce head exact. La PR #45 reste ouverte,
Draft et non fusionnée.

L’instantané historique local prépublication R6 du 2026-09-20 ajoute le refus de tout droit
effectif `SET` ou `ALTER SYSTEM` accordé au runtime ou à `PUBLIC`, sans
normalisation des ACL globales du cluster. Il limite aussi l’exception de
`SELECT` par défaut au propriétaire explicite de la base : la même ACL d’un
rôle tiers est refusée sans mutation, puis sa future table reste illisible
après remédiation explicite. Deux
bases indépendantes valident chacune 23 provisionnements réussis, 16 refus à
signature inchangée, quatre réparations de redélégation et huit refus `42501`.
À la date de cet instantané, R6 n’était ni commité ni publié et aucun SHA ou
Run ID R6 futur n’y était affirmé.

R6 est ensuite publié au commit
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, parent
`afaa652b7446b78ae35fb0bf6f4944af5625cef6`, arbre
`c7c0c733bd28bacce41206290590c6f9fc043f2a`, avec 13 fichiers et
`+498/-97`. Infrastructure `36125459701`, Launcher Windows `36125459563`,
Security `36125459520` et Quality Linux `36125459526` sont tous
`pull_request/completed/success` sur ce head exact. La PR #45 compte alors
7 commits, 31 fichiers et `+4700/-201` ; elle reste ouverte, Draft et non
fusionnée.

L’instantané historique local prépublication R7 du 2026-09-25 ferme les deux
findings CTO post-R6. Les large objects sont attestés hors schéma : propriété,
ACL `SELECT`/`UPDATE`, `PUBLIC`, grant options et default ACL PostgreSQL 18
`L`. Les default ACL `L` du propriétaire sont normalisées ; celles d’un tiers
et les ACL courantes dangereuses sont refusées sans mutation. La reprise
byte-finale a aussi fermé `PUBLIC EXECUTE` sur les routines `pg_catalog`
`lo_*`/`loread`/`lowrite` et impose `lo_compat_privileges=off`. La connexion
Prisma doit observer `session_replication_role=origin`; les réglages
persistants de portée base, rôle ou rôle/base sont refusés avant mutation et
testés sur une nouvelle connexion.

Deux bases PostgreSQL 18.4 indépendantes valident chacune 36 provisionnements
réussis, 27 refus à signature inchangée, quatre réparations de redélégation,
une normalisation de default ACL `L`, une ACL tierce de routine préservée,
trois refus de réglages persistants de réplication, un refus de
`lo_compat_privileges=on` et douze refus `42501`. Au moment de cet instantané, R7 est local, non commité et
non publié ; aucun SHA ou Run ID R7 futur n’est affirmé, aucun Ready ou merge
n’est effectué et S1.2-03B reste `Not started`.

R7 a ensuite été publié au head
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, parent
`80e8a397b19a98bd85f5ef6fcd2afe8ef4407ab0`, arbre
`50d8cdea797ff50b6fb1cb784c6cefa8904a18d2`, avec 13 fichiers et
`+1158/-88`. Infrastructure `36167761862`, Launcher Windows `36167761974`,
Security `36167761909` et Quality Linux `36167761881` sont tous
`pull_request/completed/success` sur ce head exact. La PR #45 reste ouverte,
Draft, `CLEAN/MERGEABLE` et non fusionnée.

L’instantané historique local prépublication R8 du 2026-09-26 étend la
frontière aux ACL relationnelles et de colonnes de `pg_largeobject` et
`pg_largeobject_metadata`, y compris les droits directs, `PUBLIC`, hérités et
les grant options. Il conserve le `SELECT` système standard non redélégable de
`PUBLIC` sur les métadonnées, sans autoriser la lecture des chunks. Il refuse
aussi tout override propriétaire/migrateur des deux paramètres sensibles qui
pourrait masquer un défaut cluster dangereux. Sur deux bases PostgreSQL 18.4,
104 provisionnements réussissent, 86 états dangereux sont refusés à signature
inchangée et 24 ACL de catalogue brutes sont rejetées par les deux garde-fous :
14 grants effectifs, quatre ACL non effectives persistées et six ACL `SELECT`
de métadonnées redondantes avec la visibilité standard de `PUBLIC`. Huit
défauts globaux masqués sont refusés et 24 opérations interdites rendent
`42501`. R8 reste local, non indexé, non commité et non
publié dans cet instantané daté ; aucun SHA ou Run ID R8 futur n’est affirmé,
aucun Ready ou merge n’est effectué et S1.2-03B reste `Not started`.

R8 est ensuite publié au commit
`82d1655f3f6700f4bbfac76413e2b0de0757b7a9`, parent
`3b4e9e2fdf6d2fd53c08ad48edc20e8328e2411e`, arbre
`8e1e648feb20e092ba50c2783611232a96407051`, message
`fix(security): attest PostgreSQL catalog ACLs and masked settings`, avec 13
fichiers et `+1374/-68`. Infrastructure `36260566060`, Launcher Windows
`36260566119`, Security `36260566203` et Quality Linux `36260566159` sont tous
`pull_request/completed/success` sur ce head exact. Le workflow Security a
exécuté les audits npm complet et production à zéro vulnérabilité et le
contrôle de licences sur 1 141 paquets, sans paquet non déclaré ou non approuvé.

Dans l’état historique observé après R8, le cumul était de 9 commits, 31
fichiers et `+7076/-201`, et la PR #45 demeurait ouverte, Draft,
`CLEAN/MERGEABLE` et non fusionnée. Les axes CTO architecture/données et
sécurité/intégrité PostgreSQL concluaient GO. La baseline technique publiée
reste R8.

R9 a ensuite publié la réconciliation documentaire au commit
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`, parent direct de R8. Ses workflows
`pull_request` Infrastructure `36277785889`, Launcher Windows `36277785803`,
Security `36277785832` et Quality Linux `36277785782` ont tous conclu
`completed/success` sur ce head exact.

La PR #45 est désormais fusionnée et fermée dans `main` au merge
`8e2e9252a0ac6faa1a7aa44e08e82e07317f4d86`, arbre
`d1ccbc5587f136baf2247a4055544477ec344555`, avec les parents ordonnés
`95bdfcf30a14e05ae90b09150cf289e1e0343c0d` puis
`fc3c3e75f4b7eed3f879bd47fc7fdd2765eb1e66`. Les 10 commits et 31 fichiers de
la PR sont préservés. Les workflows post-fusion `push/main` Infrastructure
`36278873811`, Launcher Windows `36278873882`, Security `36278873863` et
Quality Linux `36278873968` ont tous conclu `completed/success` sur ce merge.
Aucun tag, release ou déploiement n’a été créé ; la branche et le worktree
S1.2-03A sont préservés.

S1.2-03A est entièrement clôturé. La présente réconciliation documentaire
consigne les preuves post-fusion ; son état de publication est vérifiable dans
GitHub et ne modifie pas la baseline technique S1.2-03A. S1.2-03B reste
`Not started` et exige une autorisation CTO séparée.

Périmètre validé dans cet instantané historique :

- compte propriétaire/migrateur distinct du rôle API runtime ;
- rôle runtime `LOGIN`, `NOINHERIT`, sans attribut administratif, membership,
  propriété, option de redélégation, DDL, écriture table, privilège de séquence,
  type ou exécution de routine dans tout schéma non système de la base courante ;
- aucun droit PostgreSQL `SET` ou `ALTER SYSTEM` sur un paramètre, directement
  ou via `PUBLIC`, avec ou sans option de redélégation ;
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
  `SET ROLE` propriétaire, `SET session_replication_role = replica` et
  `INSERT`/`UPDATE`/`DELETE` métier, ainsi que `lo_create`, `lo_from_bytea`,
  `lo_put` et `lo_open`.

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

## Gate S1.2-03B

Dans l’instantané historique prépublication du 2026-09-29, le gate contractuel
Admin Security fixe la frontière à 60 chemins / 67
opérations. Les opérations futures portent explicitement `S1.2-03C1` ou
`S1.2-03C2`. Le modèle, les migrations, le XOR SQL et la concurrence nécessaires
à chaque runtime sont des prérequis de C1/C2 ; C3 est exclusivement l'interface
d'authentification Admin. Cette validation locale n'autorisait ni runtime, ni
migration, ni interface et ne change pas le statut `Not started` des trois lots
C, ni des lots D à K ou du lot seed/licences distinct.

### Instantané historique local prépublication S1.2-03B-R1

R0 est publié au commit
`a1002b37b26feb456e2b11df87c20e671c4c20ae`. La PR #48 reste ouverte, Draft,
non fusionnée et décrite « CI en attente ». Après les succès R0 Infrastructure
`36572630270`, Launcher Windows `36572630257` et Quality Linux `36572630225`,
Security `36572630278` a explicitement imprimé trois avis :
`GHSA-qw65-cvwx-89v3`, `GHSA-58mr-gqgx-xq4g` et
`GHSA-3pph-fpjx-jg34`. Le diagnostic R1 du graphe R0 a aussi confirmé
`GHSA-hrr3-gc8f-f4qj` sans que cet avis ait été imprimé dans le log Security
R0.

R1 remplace localement ces résolutions par `fast-uri@3.1.8` et
`multer@2.4.0`, renforce la borne du scanner à `<3.1.8` et retire
causalement `concat-stream`/`typedarray`. Audits, signatures, licences,
scanner, tests, builds et smokes applicables passent. Les sept nœuds WASM
signalés textuellement `extraneous` restent les mêmes après deux installations :
ce sont des branches optionnelles de plateforme déjà verrouillées dans R0,
non modifiées par R1, avec `npm ls` au code 0 et sans paquet invalide.

La surface contractuelle reste byte-identique à 60 chemins, 67 opérations et
137 schémas. Aucun endpoint, runtime, modèle, migration, workflow, interface ou
capacité produit n’est ajouté. R1 reste local, non indexé, non commité et non
publié ; les lots S1.2-03C1/C2/C3 demeurent `Not started` et toute publication
requiert une décision CTO distincte.

### État historique postpublication R1 et réconciliation documentaire R2

R1 est publié au commit
`3c1e0a067c1c977dcc7a85e4baa892ebdcc0b82e`, parent
`a1002b37b26feb456e2b11df87c20e671c4c20ae`, arbre
`c87ca8400af2e421931533e2e6b6853680360800`, message
`fix(security): remediate S1.2-03B supply-chain findings`, avec 10 fichiers et
`+358/-78`. Son empreinte agrégée est
`8298eb4de428fa578ed34af3f5ce0f5d80979ea02f124f78a3f8a603d3bbf659`.
Security `36642550938`, Infrastructure `36642550943`, Launcher Windows
`36642550958` et Quality Linux `36642551010` sont tous
`pull_request/completed/success` sur ce head exact.

Les preuves locales R1 — 1 130 signatures, 198 attestations sans invalide,
licences 1 132/0/0, deux installations reproductibles, sept artefacts WASM
qualifiés et validations API/Flutter/Infrastructure — restent distinctes des
preuves CI : audits complet et production à zéro, licences 1 139/0/0, scanner
358 fichiers avec historique actif et 52 sources immuables, et lockfile
déterministe. Les signatures npm ne sont pas affirmées comme exécutées en CI.

La PR #48 demeure ouverte, Draft, `MERGEABLE` et non fusionnée ; son cumul est
de 2 commits, 20 fichiers et `+8291/-1220`. La capacité publiée reste le contrat
60 chemins/67 opérations/137 schémas, sans runtime, migration ou interface.
S1.2-03C1/C2/C3 restent `Not started`. R2 est une réconciliation limitée à six
documents, sans octet technique ni capacité nouvelle. Son état de publication
fait foi dans Git et GitHub ; elle n'autorise aucun passage au lot suivant.

### État publié R2 et instantané local prépublication S1.2-03B-R3 — 2026-10-01

R2 est publié au commit documentaire
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, parent R1, avec six documents et
`+271/-74`. Infrastructure `36707322816`, Quality Linux `36707322868` et
Launcher Windows `36707322988` réussissent. Security `36707322818` échoue à
l'audit sur `minimatch@10.2.6 > brace-expansion@5.0.9`, devenu concerné par
trois avis dont la borne sûre commune est 5.0.12. Aucun octet technique R2
n'est causal.

R3 impose localement `brace-expansion@5.0.12`, puis traite séparément l'alerte
Next apparue après R2 en alignant `next`, `eslint-config-next` et tous leurs
paquets de support sur 16.3.8. Le lockfile ne gagne ni ne perd de nœud et
change exactement 13 versions causales. Deux installations propres,
audits/signatures/licences, scanner, outillage, format, lint, typecheck, tests
et builds applicables passent localement. Les essais de lockfile avec drift et
les deux incidents réseau de signatures ne sont pas comptés comme succès.

La surface restait byte-identique à 60 chemins, 67 opérations et 137 schémas.
À la date de cet instantané, R3 était local, non indexé, non commité et non
publié. La PR #48 était ouverte, Draft et non fusionnée. Aucun rerun ou
changement GitHub n'avait été effectué ; S1.2-03C1/C2/C3 restaient
`Not started`. Après cet instantané, l'état de publication et de CI fait foi
dans Git et GitHub.

### Baseline R3 publiée et instantané local prépublication S1.2-03B-R4 — 2026-10-01

R3 est publié au commit
`1a6c4efeb169e89ccf989004559f4e0c1af80af3`, parent R2
`6bc344c4eca7065089a6f6af6a9d47a98bf76b0f`, arbre
`031101296c44d18d7f1a2ab1f917ac1432023f6d`, avec 13 fichiers et
`+893/-117`. Les quatre workflows R3 sont
`pull_request/completed/success` en tentative 1. Avant la publication R4, la PR
#48 était `OPEN`, Draft, `CLEAN` et non fusionnée, avec 4 commits, 23 fichiers
et `+9342/-1298`.

R4 corrige deux findings CTO sans changer la séquence des lots : le contrat
distingue désormais le payload JCS UTF-8 du signing input RFC 7515 et de la
sérialisation JWS détachée, interdit `b64=false`, et la gouvernance qualifie les
anciens états R1/R2 d'historiques. Dans cet instantané, R4 était local, non
commité et non publié, sans SHA ni Run ID futur. Il n'ajoutait aucun runtime,
modèle, migration, workflow, dépendance ou interface ; S1.2-03C1/C2/C3
restaient `Not started`. Après cet instantané, l'état de publication et de CI
fait foi dans Git et GitHub.

La validation ciblée R4 conserve 60/67/137, prouve Ed25519 sur le signing input
RFC 7515, produit le contrat généré byte-identique, et termine avec 274/274
tests OpenAPI+Contracts et 367/367 tests tooling. Les validations Contracts,
documentation, scanner officiel avec historique, allowlist et whitespace sont
vertes. Les audits npm complet et production frais terminent au code 0 avec
zéro vulnérabilité. Signatures, licences, builds applicatifs, Flutter et
PostgreSQL ne sont pas rejoués pour les surfaces inchangées.
