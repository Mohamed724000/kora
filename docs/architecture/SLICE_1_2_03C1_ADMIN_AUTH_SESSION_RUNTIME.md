# S1.2-03C1 — Admin Auth and Session Runtime

Statut : **INSTANTANÉ LOCAL PRÉPUBLICATION R3 DU 2026-10-04 — R2 ÉTAIT LE
DERNIER HEAD PUBLIÉ DANS LA DRAFT PR #50 NON FUSIONNÉE — REVUE CTO TERMINALE
BLOCK — R3 VALIDÉ LOCALEMENT ET NON PUBLIÉ À CET INSTANT — APRÈS CET
INSTANTANÉ, GIT/GITHUB FONT FOI — FOURNISSEUR DE CLÉS DE PRODUCTION NON
QUALIFIÉ — C2/C3 NOT STARTED**

Date : 2026-10-04

Décisions : [ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md) et
contrat [S1.2-03B](SLICE_1_2_03B_ADMIN_SECURITY_CONTRACT_GATE.md).

## Périmètre fermé

C1 implémente seulement les douze opérations du contrat déjà publié. Aucun
bootstrap administrateur, reset, récupération assistée, invitation, changement
de rôle/statut C2, export d'audit ou écran C3 n'est ajouté.

| Méthode | Route                                                        | `operationId`                  |
| ------- | ------------------------------------------------------------ | ------------------------------ |
| POST    | `/api/v1/admin/auth/login`                                   | `loginAdmin`                   |
| POST    | `/api/v1/admin/auth/totp/enrollments`                        | `createAdminTotpEnrollment`    |
| POST    | `/api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr`      | `deliverAdminTotpEnrollmentQr` |
| POST    | `/api/v1/admin/auth/totp/enrollments/{enrollmentId}/confirm` | `confirmAdminTotpEnrollment`   |
| POST    | `/api/v1/admin/auth/totp/verify`                             | `verifyAdminTotp`              |
| POST    | `/api/v1/admin/auth/recovery-codes/verify`                   | `verifyAdminRecoveryCode`      |
| POST    | `/api/v1/admin/auth/recovery-codes/rotate`                   | `rotateAdminRecoveryCodes`     |
| POST    | `/api/v1/admin/auth/step-up`                                 | `stepUpAdminSession`           |
| POST    | `/api/v1/admin/auth/sessions/refresh`                        | `refreshAdminSession`          |
| DELETE  | `/api/v1/admin/auth/sessions/current`                        | `revokeCurrentAdminSession`    |
| GET     | `/api/v1/admin/auth/sessions`                                | `listAdminSessions`            |
| POST    | `/api/v1/admin/auth/sessions/{sessionId}/revocations`        | `revokeAdminSession`           |

La surface publique reste à 60 chemins, 67 opérations et 137 schémas. Les 15
opérations C2 et l'interface C3 restent absentes du runtime.

## Composants

- `AdminAuthModule` assemble le contrôleur, les services auth/session, le
  repository, la crypto, la policy HTTP, le rate limit et le provider de clés.
- `AdminAuthController` expose exactement les douze routes contractuelles.
- `AdminAuthService` porte login, enrollment, TOTP, recovery, rotation et
  step-up ; `AdminSessionService` porte familles, JWT, refresh, liste et
  révocation.
- `AdminAuthRepository` utilise uniquement du SQL paramétré à travers le writer
  dédié. Les sinks n'emploient ni `RETURNING` ni lecture implicite.
- `AdminAuthCrypto` porte CSPRNG, TOTP, Argon2id, AES-GCM, QR et JWT RS256.
- `AdminRequestPolicy` ferme JSON, Origin, Fetch Metadata, cookies et CSRF.
- `AdminRateLimitService` utilise un client Redis distinct de BullMQ.

## Frontières PostgreSQL

Deux identités, secrets et pools distincts sont obligatoires. Le pool lecteur
03A reste le client Prisma général ; le writer C1 n'est jamais exposé comme
client Prisma. Les deux frontières sont attestées avant `application.init()`.
Le health historique agrège leurs probes PostgreSQL sans exposer de champ KMS.

Le lecteur ne reçoit que `SELECT` sur les projections suivantes :

- `Customer(id)` ;
- `AdminUser(id, role, status, authorizationVersion, totpEnabledAt)` ;
- `AdminSession(id, adminUserId, authorizationVersion, lastTwoFactorAt,
lastActivityAt, expiresAt, absoluteExpiresAt, revokedAt, createdAt,
updatedAt, stepUpPurpose, stepUpVerifiedAt, stepUpExpiresAt)`.

Le writer reçoit des droits de colonnes C1 seulement sur `AdminUser`,
`AdminSession`, `AdminRecoveryCode`, les six tables C1 et
`AdminIdempotencyRecord`. `AuditLog` et `AdminSecurityEvent` sont
`INSERT`-only ; aucun `SELECT`, `UPDATE`, `DELETE` ou `RETURNING` n'est accordé.
Aucune default ACL de table, permission C2, ownership, membership, grant option
ou privilège via `PUBLIC` n'est autorisé.

## Modèle et migration

La migration unique
`20261002170022_admin_auth_session_runtime/migration.sql` ajoute :

- `AdminPreAuthContext` ;
- `AdminTotpEnrollment` ;
- `AdminRecoveryContext` ;
- `AdminRefreshToken` ;
- `AdminRecoveryCodeBatch` ;
- `AdminSecurityEvent`.

Le schéma compte 39 modèles et 40 tables avec `_prisma_migrations`. Les 33
modèles historiques sont préservés, hors extensions C1 approuvées. Les lignes
AuditLog historiques restent en version 1 avec leurs absences réelles ; les
nouveaux inserts sont imposés en version 2. Aucun backfill DML ni arrêt du
trigger append-only n'est effectué.

Les contraintes SQL matérialisent notamment les FK composites `RESTRICT`, le
XOR des contextes, l'immuabilité des bindings et expirations absolues, les
marqueurs monotones, le compteur TOTP croissant, un batch recovery actif par
acteur, dix codes à `COMMIT`, la chaîne refresh génération +1, les fenêtres
idle/absolue, le plafond de trois familles, et les XOR d'audit.

## Transactions et concurrence

L'ordre de verrouillage est utilisateur, contexte/enrollment, puis
session/token. Les ensembles de sessions sont verrouillés par identifiant
croissant pour supprimer les cycles de révocations croisées. Le rate limit
Redis applicable précède toute mutation PostgreSQL, y compris la mise à jour
d'activité. Sinks de sécurité et mutation critique partagent la transaction ;
un échec sans contexte prouvé produit un `AdminSecurityEvent`, tandis qu'un
contexte session ou recovery prouvé produit l'`AuditLog` contractuel avant la
réponse d'erreur.
Les secrets, QR, codes, cookies et tokens ne sont livrés qu'après confirmation
du `COMMIT`. Le matériel CSRF destiné à cette livraison est toutefois calculé
avant le `COMMIT`, afin qu'une panne de clé annule toute mutation associée.

- Un rejeu TOTP ne peut pas franchir le compteur global, y compris après
  changement de seed.
- Une récupération consomme code et préauth, révoque les familles et produit
  seulement un contexte borné ; la session naît à la confirmation du nouveau
  facteur.
- La rotation recovery consomme le TOTP inline, le compteur, le batch,
  l'idempotence et l'audit dans la même transaction.
- La quatrième famille évince la LRU déterministe
  `lastActivityAt, createdAt, id` sous verrou utilisateur.
- Le refresh tourne une famille existante. Un replay ou perdant révoque
  durablement la famille avant `AUTH_REFRESH_INVALID`.
- Une perte d'accusé de `COMMIT` est un résultat inconnu, distinct d'un rollback
  confirmé ; aucun retry aveugle ni affirmation « zéro effet » n'est produit.

## Cryptographie et clés

- JWT RS256, `kid` résolu dans un trust bundle, issuer/audience/type exacts et
  durée maximale 15 minutes ; le signing input JWS est signé directement.
- TOTP RFC 6238 SHA-256, six chiffres, 30 secondes, fenêtre ±1 et compteur
  `uint64` anti-rejeu.
- Seed 256 bits, DEK AES-256-GCM, nonce/AAD/tag/version et enveloppement. Une
  preuve TOTP valide sous une ancienne clé ré-enveloppe atomiquement le secret
  sous la clé active.
- Refresh opaque 256 bits ; dix recovery codes, sélecteurs/verifiers CSPRNG et
  Argon2id 64 MiB/t3/p1 avec sels uniques.

`TestEphemeralAdminKeyProvider` génère de vraies clés RSA et d'enveloppe en
mémoire, supporte rotation et injection de panne, et n'est injectable que par
le harness. Aucune variable de production ne l'active. Sans fournisseur
qualifié, une requête C1 valide reçoit le 503 contractuel fermé, tandis que le
health historique reste disponible après attestation PostgreSQL.

## Transport, Redis et observabilité

Les cookies sont `__Host-*`, `Secure`, host-only, `Path=/` et
`SameSite=Strict`, avec `HttpOnly` selon le contrat. Le parser refuse doublons,
ambiguïtés et contrôles. Origin HTTPS exact, Fetch Metadata, JSON et
double-submit CSRF sont vérifiés avant le service.

Le rate limit combine IP et digest/contexte HMAC sans PII brute. Les profils
sont password 5/15 min, TOTP 5/5 min, refresh 10/min et recovery 5/h. Le script
Lua est atomique ; avant mutation PostgreSQL, `WAITAOF 1 0` est exécuté sur la
même connexion avec timeout positif borné. Cette preuve de persistance locale
n'est ni une transaction distribuée ni une garantie de cohérence forte.

La sanitation traverse Pino, Sentry et les enveloppes d'erreur pour password,
OTP, seeds, URI otpauth, QR, recovery, refresh, CSRF, cookies, Authorization,
JWT, enveloppes et clés internes. Les tests n'émettent aucun appel Sentry
réseau.

## Limites et séquencement

La dépendance dev vulnérable `braces@3.0.3`, auparavant atteinte uniquement par
`@next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8`, est
retirée par l'override strictement scoped du seul import `fast-glob` du plugin
vers l'alias officiel `tinyglobby@0.2.17`. Cette substitution n'est pas une
compatibilité générale : elle est qualifiée uniquement parce que les
configurations ESLint effectives Web, Admin et UI ne définissent pas
`settings.next.rootDir`. Toute future apparition de cette propriété, y compris
un répertoire littéral, un slash final, un tableau ou un motif avec braces,
fait échouer le gate `security:next-root-dirs` et exige une nouvelle
qualification.

**C1 production / KMS externe / signature de production : NON QUALIFIÉS.** Le
choix cloud, SDK, compte et coût relève d'une décision Produit/déploiement
distincte. Dans l'instantané prépublication daté du 2026-10-04, R2 était publié
dans la Draft PR #50 et le correctif R3 restait local, sans indexation, commit,
push, changement de PR, release ou déploiement. Après cet instantané, l'état
Git/GitHub fait foi. Une décision CTO séparée reste requise avant tout Ready,
fusion ou déploiement ; C2 et C3 restent `Not started`.

## Validation locale

Le gate isolé a validé l'upgrade legacy sans DML, la construction depuis une
base vide et l'égalité des deux catalogues finaux
(`5b2bf03fbe7fc292ff48102e7bbdd66f63a2b0a62b698e350f8122575ab88120`).
Il a observé 39 modèles, 40 tables avec `_prisma_migrations`, trois migrations,
douze refus de contraintes et les ACL lecteur/writer exactes. Le parcours HTTP
sur PostgreSQL et Redis réels a réussi 18 tests sur 18 et exercé les douze
opérations, les courses, les pannes et le nettoyage ciblé des ressources.

Le complément Infrastructure exécute aussi les gates génériques sur une
instance Compose éphémère dont le projet, les volumes, le réseau, les ports et
le répertoire de secrets sont distincts du projet local par défaut. Depuis un
volume vide, `infra:up` attend PostgreSQL/Redis, applique les migrations sous
le propriétaire/migrateur, puis provisionne et vérifie les rôles reader/writer.
Le reset supprime uniquement les deux volumes étiquetés de cette instance,
rejoue migrations et provisionnement, et compare toutes les ressources Docker
étrangères avant/après. `infra:verify-api` atteste ensuite le refus du
propriétaire par la frontière runtime, l'acceptation des pools dédiés, la
stabilité du PID API et les transitions Redis/PostgreSQL panne puis
récupération, sans secret dans les réponses ou les logs.

Les gates API format, lint, typecheck, tests et build passent ; le build compilé
émet et vérifie une signature RS256 avec JOSE réel et rejette une signature
altérée. OpenAPI reste à 60 chemins, 67 opérations et 137 schémas. Deux
installations exactes ont conservé le lockfile et chargé le prebuild Argon2id.
Le gate Next/ESLint utilise le plugin réellement installé depuis chaque cwd,
préserve les règles existantes et vérifie leurs diagnostics positifs/négatifs.
Les audits npm bruts complet et production terminent à zéro vulnérabilité ; les
signatures, attestations et licences du graphe aliasé sont vérifiées.
Le détail, les incidents intermédiaires et les limites se trouvent dans le
[rapport QA C1](../qa/SLICE_1_2_03C1_ADMIN_AUTH_SESSION_RUNTIME_REPORT.md).

## Instantané local prépublication R3 du 2026-10-04

À cet instant, R2 était le dernier head publié au commit
`59972cc0614842627c8c17717605345eaae277c4`, parent
`efb14d1d075dac50ff081b6ef3c1cce516de01e0`, arbre
`a4e721cf14350655c9d7a94baae28a5f4edb298d`, avec trois fichiers et
`+96/-1`. La Draft PR #50 reste ouverte, Draft et non fusionnée ; son cumul est
de trois commits, 78 fichiers et `+15279/-641`. Les quatre workflows R2 ont
réussi sur ce head exact : Infrastructure `37160117048`, Launcher Windows
`37160117009`, Security `37160117045` et Quality Linux `37160117042`.

La revue CTO terminale a néanmoins conclu **BLOCK** : les attestations de
membership ne couvraient pas `roleid`, cinq comportements Auth/audit divergeaient
du contrat et les champs vivants n'avaient pas été réconciliés avec la
publication. R3 borne sa correction aux deux orientations PostgreSQL, aux cinq
findings Auth et aux documents vivants. La liaison JTI transactionnelle demeure
une recommandation non bloquante distincte ; la pagination des sessions reste
**NON CONCLUSIVE**. Ni l'une ni l'autre n'est présentée comme une correction R3.

La politique open source reste différée. Le fournisseur de clés de production
reste **NON QUALIFIÉ** et aucune capacité C2/C3 n'est anticipée. Les résultats
R3 sont validés localement sur le gel des 19 fichiers autorisés : le wrapper C1
final réussit PostgreSQL A/B et 26/26 tests HTTP/PostgreSQL/Redis, avec quatre
refus de membership entrante ; `infra:verify` et `infra:verify-api` réussissent
sur l'instance isolée ; lint, typecheck, 83 tests API exécutés, build, OpenAPI
60/67/137, Contracts 7/7, tooling 403/403 et scanner officiel 384 fichiers
passent. Les 25 tests API hors harness qui restent `skipped` sont annoncés comme
tels. Les premières tentatives non concluantes du wrapper (22/24) et du gate
Infrastructure ne sont pas comptées comme succès. Dans cet instantané daté, R3
était local, non indexé, non commité et non publié. Après cet instantané, l'état
réellement observé dans Git et GitHub fait foi.
