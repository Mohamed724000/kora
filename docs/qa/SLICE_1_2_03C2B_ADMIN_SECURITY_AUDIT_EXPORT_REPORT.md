# S1.2-03C2b — rapport local audit et export

## Statut

**R3 PUBLIÉ DANS LA PR #53 DRAFT AVEC QUATRE WORKFLOWS VERTS — CORRECTION
DOCUMENTAIRE R4 DE G-QA-01 — AUCUNE FUSION NI QUALIFICATION DE PRODUCTION.**

Baseline publiée R3 : branche `codex/c2b-admin-audit-export-runtime`, head
`e1ec2ffded6f6b2edc9a2a5ad7135501412263ec`, arbre
`16fa1a75726c6b892b4dd33cbda7455312b2858b`, sur la base intégrée
`029e30bbc795f3d9c153782bc04e45e9f5a03f8a`. La PR #53 reste `OPEN/Draft`.
Le présent rapport relie la qualification locale R3 du 2026-10-26 à sa
publication et réconcilie le finding documentaire G-QA-01. Il ne vaut ni
fusion ni qualification de production.

## Périmètre matérialisé

Le candidat couvre exactement les opérations `listAdminAuditLogs`,
`createAdminAuditLogExport`, `getAdminAuditLogExport` et
`downloadAdminAuditLogExport`, ainsi que les continuations internes
`buildAdminAuditLogExport` et `expireAdminAuditLogExport`. Il ajoute cinq
modèles Prisma C2b, une migration additive, deux identités PostgreSQL, les
frontières NestJS, les ports de stockage/signature, le worker et des adaptateurs
de test déterministes. C3 n'est pas commencé.

## Dispatch de causalité

La matrice normative qualifiée est :

| Identité de connexion          | Actions autorisées                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `kora_admin_c2b_audit_api`     | `listAdminAuditLogs`, `createAdminAuditLogExport`, `getAdminAuditLogExport`, `downloadAdminAuditLogExport` |
| `kora_admin_c2b_export_worker` | `buildAdminAuditLogExport`, `expireAdminAuditLogExport`                                                    |

Le trigger combine identité et action. Toute action hors allowlist, nulle ou
malformée est refusée pour une identité C2b. Toute action réservée C2b est
refusée depuis un autre rôle. Une action autorisée traverse encore les
contrôles de contexte, résultat, causalité, ressource et liens référentiels.
Les écritures C1/C2a non réservées continuent vers leurs gardes historiques.

La campagne runtime finale atteste :
`C2B_AUDIT_DISPATCH_PASS actions=6 actual_logins=4 denials_durable=true
c1_c2a_preserved=true`. Les cinq migrations passent fresh/upgrade, les ACL et
la contamination sont exercées, puis seules les ressources de campagne sont
nettoyées. La première migration `22P02`, la campagne intermédiaire aux enums
dédiés et les variantes automatiquement refusées conservent leur statut
historique NON-PASS ou partiel.

## Profil signé et temps PostgreSQL

Le profil signé C2b est explicitement versionné `2`. Son manifeste JCS contient
exactement `createdAt`, `entries`, `expirationRule`, `exportId` et `version` ;
`expirationRule` vaut littéralement `READY_PLUS_24_HOURS`. Il ne prétend pas
signer une échéance absolue inconnue avant READY.

Le ZIP final immuable est couvert par un JWS détaché Ed25519 à header fermé et
par `contentSha256` calculé sur ses octets exacts. Le staging est relu et
vérifié avant le CAS READY. Lors de ce CAS, PostgreSQL établit une seule fois
`readyAt` et `expiresAt` depuis le même instant, avec exactement
`expiresAt = readyAt + interval '24 hours'`. Ces valeurs sont immuables et
utilisées par les réponses, les read leases, le téléchargement et
l'expiration. Une vérification hors ligne démontre l'intégrité du ZIP et sa
règle de validité ; elle ne démontre pas l'instant READY ni l'expiration
opérationnelle du serveur.

## Garanties métier observées

- projection fidèle des audits, sans `legacyReason` exposé ;
- snapshots et pagination bornés ; la frontière réelle crée et vérifie
  exactement 10 000 entrées, en 2 145 ms lors de la première campagne finale
  puis 2 460 ms dans la traversée terminale ordonnée ;
- fenêtre idempotente PostgreSQL stricte de 24 h, concurrence même payload,
  conflit payload différent et réutilisation atomique d'une clé expirée dans
  une nouvelle génération, sans écrasement des générations historiques ;
- rollback de l'export, du snapshot, du résultat idempotent et de l'audit comme
  une seule unité ;
- `COMMIT_UNKNOWN` renvoyé sous forme neutre sans replay de mutation, avec une
  seule génération durable et un wakeup borné de réconciliation ;
- expiration positive d'un export réellement READY, calculée selon l'heure
  PostgreSQL, audit unique atomique, `contentSha256` conservé, nouveau
  téléchargement refusé et lease déjà acquis protégé ;
- stockage, keyring, signature, BullMQ et cleanup encadrés par les bornes et
  signaux d'annulation qualifiés ; lease, fencing, trois tentatives et backoff
  préservés ;
- worker exécuté comme processus réel et parcours PostgreSQL/Redis/BullMQ
  observé ; le drain de wakeups coalescés empêche une progression perdue.

La campagne métier finale passe **11 scénarios réels sur 11** et atteste les
quatre opérations HTTP, le processus worker, BullMQ, l'intégrité, l'expiration,
l'idempotence et les frontières transactionnelles.

## Supply-chain

Le graphe final qualifie `body-parser@2.4.0`, `multer@2.5.0`,
`fast-uri@3.1.9` et `zod@4.6.6` selon leurs parents exacts. Les projections
protégées Prisma `7.9.1` et `pg@8.22.0` restent inchangées ; seule la fermeture
transitive autorisée de `fast-uri` évolue dans la projection concernée.

Une fixture propre porte exactement les mêmes `package.json` et
`package-lock.json` que le candidat, SHA-256 respectifs
`9760394e41def31e9b5aa2370a12076e3ca179fa52c1012fe1ec6f0ed436ebe6` et
`841cfbb18e903cb26bec4f1cd8e32618191547fdb93b7ba35ae01f67509df934`.
L'installation propre et `npm ls --all` terminent au code 0 ; les quatre
versions protégées sont résolues, les audits complet et production trouvent
zéro vulnérabilité, 933 paquets ont une signature de registre vérifiée et 193
une attestation. L'inventaire de licences couvre 935 paquets, sans licence
absente ou non approuvée.

Le `npm ls --all` lancé dans le worktree après les campagnes reste NON-PASS :
son `node_modules` antérieur contient les anciennes versions protégées et des
paquets optionnels extraneous. Il n'est pas sélectionné comme preuve du lock.
La fixture propre byte-identique est la preuve sélectionnée. Le premier audit
de signatures de cette fixture, bloqué par `ENOTFOUND` Sigstore dans le
sandbox, reste NON-PASS réseau ; sa reprise réseau autorisée passe au code 0.

## Gates et traversée cumulative

Résultats concluants sur les octets candidats :

- format workspace, lint, typecheck et build API : PASS ;
- tests API : 40 fichiers PASS, un fichier SKIP ; 287 assertions PASS et 72
  SKIP ; ces SKIP ne sont pas reclassés PASS ;
- OpenAPI : 60 chemins, 67 opérations, 141 schémas et 53 modèles Prisma
  protégés, dont 39 historiques, neuf C2a et cinq C2b ;
- généré contractuel officiel en mode `--check` : PASS ;
- tooling 567/567 (résultat R1 historique), scanner officiel sur 466 fichiers
  et licences : PASS ;
- C1 réel 47/47 et métier C2a 1 contrôle statique + 11 scénarios réels :
  PASS dans la traversée terminale, dont une nouvelle non-régression C1 47/47
  après le métier C2a ;
- Foundations courant : chaîne exacte de cinq migrations, fresh/upgrade,
  projections, ACL et garanties transactionnelles : PASS dans la campagne
  runtime C2b finale ;
- runtime C2b et métier C2b 11/11 sur PostgreSQL/Redis/HTTP réels : PASS ;
- inventaire Docker étranger préservé et cleanup limité aux ressources de
  campagne : PASS.

Les anciens NON-PASS demeurent archivés : verrou Foundations à quatre
migrations, audits rouges, preuves d'expiration/idempotence absentes,
divergence du premier profil signé, appels externes non bornés, erreurs du
wrapper Windows, permissions SQL manquantes, wakeup coalescé et dépassements
de la borne de commit à 10 000 entrées. Le correctif final optimise le trigger
de complétude snapshot sans relâcher la borne de 2 s et passe sur une nouvelle
campagne propre.

## Verdict et limites

Les findings R1 sont fermés sur un même candidat : chaîne de migrations,
profil signé V2, temps PostgreSQL, expiration positive, réutilisation
idempotente expirée, bornes externes et supply-chain. Le verdict est **GO
LOCAL C2b R1**. Il ne vaut ni publication ni qualification de production.

Les fournisseurs et Linux de production restent NON QUALIFIÉS. Le signal
Windows, les limites préincident R9, les installations persistantes externes
et les SKIP historiques conservent leur portée. La politique OSS reste
différée. Aucun fichier n'est indexé ; aucun commit, push, PR, workflow, Ready,
merge, tag, release ou déploiement C2b n'est effectué.

## Raccordement CI prépublication

Infrastructure appelle désormais les wrappers runtime et métier C2b après C1,
Foundations C2a et le métier C2a, puis poursuit vers lifecycle et API health.
Les deux étapes reçoivent des instances explicites distinctes et non locales.
Les wrappers résolvent Docker, Node et npm par leur exécutable disponible, sans
suffixe Windows codé en dur ; leurs refus, sorties, attestations et cleanup
restent bloquants.

Cette adaptation de harnais ne remplace pas les preuves R1 : le profil signé
reste V2, `READY_PLUS_24_HOURS` demeure la règle exacte et la vérification hors
ligne n'atteste pas l'heure READY PostgreSQL. La régression ciblée passe 53/53 ;
le runtime repasse les cinq migrations, cinq modèles, deux identités et six
actions, puis le métier repasse 11/11 avec worker et BullMQ. Le tooling
prépublication courant passe 569/569. Le gel prépublication est établi par deux
manifestes byte-identiques : 73 entrées et 8 923 octets.
Les audits frais complet et production concluent au code 0 avec zéro
vulnérabilité et stderr vide. Le candidat doit encore être publié par un
commit/push unique et recevoir quatre workflows verts. Aucun de ces résultats
futurs n'est affirmé ici.

## R2 — portabilité POSIX du provisionnement

Le run Infrastructure `40112550483`, tentative 1 sur le head R1
`8fcefbdce37e463e4d70e47d20608f5c7528e416`, reste un **NON-PASS
historique**. C1, Foundations C2a, métier C2a et la préparation Compose y ont
réussi. Le runtime C2b a ensuite appliqué les cinq migrations, puis Docker a
refusé l'exécution directe du provisionneur monté en lecture seule et conservé
au mode Git `100644` : `exec: ... permission denied`. Le métier C2b,
lifecycle et API health ont donc été `skipped` dans ce run ; ils ne sont pas
reclassés PASS.

R2 conserve le montage en lecture seule et invoque, dans chacun des deux
wrappers, `docker exec <conteneur> sh
/usr/local/bin/kora-provision-postgresql-runtime.sh` par quatre arguments
distincts. Aucun `chmod`, `sh -c`, privilège, copie exécutable ou masquage
d'échec n'est ajouté. Une régression comportementale exécute les invocations
réelles extraites des wrappers avec un faux Docker : elle vérifie le conteneur,
`sh`, le chemin exact, le montage `readonly` et la propagation bloquante d'un
code 23.

La preuve Linux utilise un fichier réellement `0644`, stocké dans un volume
Docker et remonté en lecture seule : l'exécution directe est refusée, tandis
que `sh /proof/provision.sh` réussit et toute écriture via le montage échoue.
Sur deux instances neuves et explicitement non locales, le wrapper runtime
passe les cinq migrations, le provisioning des huit frontières, les six
actions, les ACL et refus durables ; le wrapper métier passe build API et
11/11 scénarios PostgreSQL/Redis/HTTP avec processus worker et BullMQ. Les
inventaires avant/après sont identiques : 4 conteneurs, 8 volumes, 5 réseaux
et 4 images.

La syntaxe PowerShell et la régression ciblée passent. Le tooling complet
passe 570/570 et le scanner officiel 466 fichiers avec historique. Les audits
npm frais complet et production terminent au code 0 avec zéro vulnérabilité et
stderr vide. Le lancement direct initial de `npm.cmd` par le collecteur reste
une erreur de lancement `spawn EINVAL`, distincte de la reprise qualifiée via
`cmd.exe /d /s /c`. La publication R2, les quatre workflows du futur commit et
la réconciliation finale du corps de PR restent à obtenir ; aucun succès CI
R2 futur n'est affirmé dans cet état local.

## R3 publié — fermeture de S-PG-01, S-PG-02 et S-PG-03 ; R4 documentaire

Le dernier paragraphe R2 ci-dessus est conservé comme instantané local
prépublication. R2 a ensuite été publié au head `b4868b9…`. Infrastructure
`40116489202`, Launcher Windows `40116489279`, Security `40116489218` et
Quality Linux `40116489201` sont `completed/success`, tentative 1, sur ce head
et le checkout synthétique `b3eb477df8ad68c4136155d66c4856799c9de324`.

La revue cumulative qui suit cette publication demeure un **BLOCK historique**
sur quatre findings. R3 corrige localement les trois findings PostgreSQL :
génération initiale 0 ; lease/deadline PostgreSQL réévaluées après verrou ;
backoffs exacts 30/120 ; trois tentatives maximum ; fencing et réconciliation
exacte. `lastTransitionRefHash` est un marqueur interne de transition. Son ACL
accorde au seul worker C2b exactement `SELECT` et `UPDATE` sur la colonne, et
la garde différée exige la transition durable et son audit terminal exact dans
la même transaction.

Le wrapper runtime final passe fresh/upgrade, cinq migrations, projections,
provisioning, ACL et préservation C1/C2a. Le premier wrapper métier de reprise
reste un NON-PASS terminal 12/14, terminé avant le redémarrage Windows. Les
deux candidats suivants restent NON-PASS 13/14 : ils ont révélé une forme
d'erreur puis une préimage temporelle incorrectes dans le harnais. Après
correction bornée du seul test autorisé, la campagne
`c2b-business-r3-reconcile-04` passe 14/14, avec worker processus, BullMQ,
courses READY/watchdog, heartbeat après verrou, état durable et cleanup ciblé.

Sur les mêmes octets, les tests repository/worker passent 42/42, l'API passe
40 fichiers avec 300 tests réussis et 75 SKIP, tooling 570/570 et le scanner
466 fichiers. Format, lint, typecheck, build, génération Prisma, OpenAPI
60/67/141, génération contractuelle, `git diff --check` et les audits npm
complet/production à zéro passent. Les stderr Prisma informatifs sont conservés
et ne sont pas reclassés comme vides.

L'inventaire étranger post-redémarrage conserve quatre conteneurs, huit
volumes et quatre images ; les IDs, montages et états des services observés
restent inchangés. Chaque instance R3 est absente après cleanup. La phrase de
non-publication du candidat local constituait un instantané historique
antérieur au commit R3.

R3 est publié au commit `e1ec2ffded6f6b2edc9a2a5ad7135501412263ec` dans la
PR #53 toujours `OPEN/Draft`. Les workflows pull request Infrastructure
`40312158372`, Launcher Windows `40312158476`, Security `40312158263` et
Quality Linux `40312158291` sont `completed/success`, tentative 1, sur ce head
et le checkout synthétique
`8aab8daca9ae26b157456bc7aa7025d95a7832c1`. Infrastructure conserve les
décompositions exactes C1 47/47, Foundations 34/34, C2a 1 contrôle statique +
11 scénarios réels et C2b 14/14 ; ces résultats ne transforment pas les 75 SKIP
API en PASS.

La revue cumulative postpublication conclut GO pour Backend et Security sur
les octets techniques R3, mais BLOCK pour Governance/QA sur le seul finding
G-QA-01 : les documents vivants décrivaient encore R3 comme local. La
correction documentaire R4 ferme cette contradiction sans modifier un fichier
technique ni requalifier rétroactivement un incident ou un NON-PASS.
Fournisseurs et Linux de production restent NON QUALIFIÉS ; clés de production,
signal Windows, limites préincident R9, installations persistantes externes et
perte réelle de l'accusé réseau lors de `COMMIT_UNKNOWN` restent NON
DEMONSTRATED. C3 reste hors preuve. Les NON-PASS 12/14, 13/14 et 13/14
demeurent historiques, les 75 SKIP restent des SKIP et la politique OSS
demeure différée.
