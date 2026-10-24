# S1.2-03C2b — rapport local audit et export

## Statut

**CANDIDAT LOCAL NON INDEXÉ — R1 QUALIFIÉ — GO LOCAL, PUBLICATION NON
AUTORISÉE.**

Baseline : branche `codex/c2b-admin-audit-export-runtime`, HEAD
`029e30bbc795f3d9c153782bc04e45e9f5a03f8a`, arbre
`a32f8332e80c18c565521418fe197619f8fb56d9`. Ce rapport ne vaut ni commit,
publication, fusion ni qualification de production.

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
