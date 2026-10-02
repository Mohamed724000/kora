# S1.2-03B — Admin Security Contract Gate

Statut : **R4 VALIDÉ LOCALEMENT LE 2026-10-01 — ÉTAT DE PUBLICATION COURANT
DANS GIT/GITHUB — CONTRAT UNIQUEMENT**

Décision associée : [ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md)

## Résultat verrouillé

La surface OpenAPI passe de 34 chemins / 40 opérations à exactement 60 chemins
/ 67 opérations. Les 34 chemins et 40 opérations antérieurs restent
structurellement identiques, sauf le retrait intentionnel de `SUPPORT` sur cinq
lectures Artist/Audio/Media. Les 27 opérations nouvelles sont réparties en 12
opérations `S1.2-03C1` et 15 opérations `S1.2-03C2`.

S1.2-03B ne livre aucun contrôleur, service, worker, migration, changement
Prisma, seed, interface ou dépendance. Il prépare les slices runtime futures.

## Inventaire C1 — authentification et sessions

| Méthode | Chemin                                                       | `operationId`                  |
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

## Inventaire C2 — récupération, audit et administration

| Méthode    | Chemin                                               | `operationId`                                        |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------- |
| POST       | `/api/v1/admin/auth/password/reset-requests`         | `requestAdminPasswordReset`                          |
| POST       | `/api/v1/admin/auth/password/reset`                  | `resetAdminPassword`                                 |
| POST / GET | `/api/v1/admin/recovery-cases`                       | `createAdminRecoveryCase` / `listAdminRecoveryCases` |
| GET        | `/api/v1/admin/recovery-cases/{caseId}`              | `getAdminRecoveryCase`                               |
| POST       | `/api/v1/admin/recovery-cases/{caseId}/approve`      | `approveAdminRecoveryCase`                           |
| GET        | `/api/v1/admin/audit-logs`                           | `listAdminAuditLogs`                                 |
| POST       | `/api/v1/admin/audit-log-exports`                    | `createAdminAuditLogExport`                          |
| GET        | `/api/v1/admin/audit-log-exports/{exportId}`         | `getAdminAuditLogExport`                             |
| GET        | `/api/v1/admin/audit-log-exports/{exportId}/content` | `downloadAdminAuditLogExport`                        |
| POST       | `/api/v1/admin/invitations`                          | `createAdminInvitation`                              |
| POST       | `/api/v1/admin/auth/invitations/accept`              | `acceptAdminInvitation`                              |
| GET        | `/api/v1/admin/users`                                | `listAdminUsers`                                     |
| POST       | `/api/v1/admin/users/{adminUserId}/role-changes`     | `changeAdminUserRole`                                |
| POST       | `/api/v1/admin/users/{adminUserId}/status-changes`   | `changeAdminUserStatus`                              |

## Classes de sécurité

- `PUBLIC` : `security: []`, Origin exact et corps JSON strict. Le login ne
  reçoit aucun double-submit cookie/header et renvoie un 401 générique pour
  compte inconnu, mot de passe incorrect, compte désactivé ou verrouillé, avec
  comportement temporel comparable. Il rejette aussi les requêtes Fetch
  Metadata cross-site. Demande/consommation de reset et acceptation
  d'invitation appliquent aussi un timing comparable entre compte ou code
  inconnu, expiré, consommé, révoqué et état de compte.
- `PREAUTH` : une unique exigence OpenAPI contient ensemble
  `adminPreAuthCookie`, `adminCsrfCookie` et `adminCsrfHeader` câblé sur
  `X-Kora-CSRF`. Des exigences séparées seraient un OR et sont rejetées.
- `REFRESH` : une unique exigence contient ensemble `adminRefreshCookie`,
  `adminCsrfCookie` et `adminCsrfHeader`.
- `ADMIN_SESSION` : bearer `adminSession`, rôle serveur, statut actif et
  `authorizationVersion`. Les opérations marquées imposent un step-up de cinq
  minutes et une justification.

Toutes les mutations de navigateur exigent une correspondance Origin exacte.
Les requêtes avec corps n'acceptent que `application/json`. Le RBAC est deny by
default ; audit et exports sont `SUPER_ADMIN` uniquement. La révocation d'une
session tierce exige `SUPER_ADMIN`, step-up et justification. Les changements
de rôle/statut sur soi-même sont interdits et le dernier super-admin actif est
protégé.

## Données sensibles et réponses

Le QR TOTP est livré par POST, une seule fois, en `image/png`, avec
`Cache-Control: no-store` et `X-Content-Type-Options: nosniff`. Le seed et toute
URI de provisioning sont interdits dans JSON, logs et audit. Une répétition
retourne 409 `SENSITIVE_RESPONSE_ALREADY_DELIVERED`.

Les réponses JSON utilisent des enveloppes fermées `{data, meta}` ; les 204,
le QR et le contenu d'export binaire sont les seules exceptions. L'export est
un téléchargement authentifié `application/zip`, en pièce jointe et `no-store`
sans URL signée. Ses états publics sont 404 absent, 409 non prêt et 410 expiré.

Les opérations idempotentes exactes sont : création et confirmation
d'enrôlement, livraison QR, rotation des codes, création/approbation d'un
dossier de récupération, invitation, changements de rôle/statut et création
d'export. Une même clé avec un payload différent retourne 409. Les réponses
secrètes ne sont jamais rejouées et retournent 409.

Les réponses qui livrent une pré-session, un access token ou des codes à
affichage unique imposent aussi `Cache-Control: no-store` et
`X-Content-Type-Options: nosniff`. Les profils de rate limit sont distincts et
verrouillés pour mot de passe, TOTP, refresh et récupération ; chaque 429
porte `Retry-After`, sans journaliser de clé de partition brute.

## Audit, récupération et bootstrap futurs

Les parcours sans contexte d'audit prouvé — login initial, création/livraison
d'enrôlement, demande de reset et acceptation d'invitation — écrivent un futur
`AdminSecurityEvent`, succès comme échec, sans fabriquer d'acteur. Dès qu'une
session ou un contexte de récupération est prouvé, les mutations critiques et
leur `AuditLog` sont atomiques. Pour chaque opération, le contrat sépare le sink
du succès de celui de l'échec : tout échec sans contexte prouvé rejoint
`AdminSecurityEvent`, y compris TOTP, recovery code, refresh et reset invalides.
La lecture et l'export restaurent les filtres
ADR-004 administrateur/action/entité/date et les preuves ADR-019 : entité,
avant/après masqués, corrélation, causalité et délégation éventuelle. L'union
générée impose l'acteur non nul pour `ADMIN_SESSION` et `ADMIN_RECOVERY`, et un
acteur nul avec référence système pour `SYSTEM`. Un traitement autonome impose
causalité et délégant nuls ; un traitement délégué exige les deux ensemble.

L'export ZIP masque les PII et contient `manifest.json`, canonisé selon RFC 8785
JCS, ainsi que `manifest.sig`, signature JWS compacte détachée Ed25519. Le
payload est exactement les octets UTF-8 de ce manifeste canonique. L'en-tête
protégé UTF-8 contient exactement `alg=EdDSA` et `kid=signatureKeyId`; le signing
input RFC 7515 est l'ASCII de `BASE64URL(protected)`, un point, puis
`BASE64URL(payload)`, sans padding. Le profil `b64=false` est interdit. La forme
détachée transmise est `protected..signature` et le vérificateur reconstruit le
payload depuis `manifest.json`.

Le manifeste lie export, échéances, chemin relatif normalisé, taille et SHA-256
de l'ensemble exact des entrées payload, en excluant `manifest.json` et
`manifest.sig`. Les chemins absolus, traversants, à backslash ou dupliqués sont
refusés ; toute entrée manquante ou non listée invalide le ZIP. La clé publique
est résolue dans le trust bundle du déploiement par `signatureKeyId`; les
anciennes clés restent vérifiables jusqu'à expiration de tous les exports
concernés. Le téléchargement reste bearer + step-up, sans URL signée ni
capacité dans l'URL.
L'expression « export signed » d'ADR-004 désigne donc l'intégrité vérifiable du
contenu, pas son mode de transport.

Le dossier de récupération est annulable sans ajouter une 28e opération : la
création d'un dossier remplaçant annule atomiquement tout dossier `PENDING` du
même sujet, et la politique serveur annule un dossier si créateur ou sujet
devient inéligible. Chaque transition `PENDING → CANCELLED` porte une raison
serveur et un `AuditLog`; aucune route d'annulation autonome n'est prétendue.

Le premier administrateur sera provisionné en C2 par une commande
`admin:bootstrap` one-shot, contrôlée et auditée, hors OpenAPI, sans seed, sans
endpoint public et sans secret versionné. C1 ne pourra utiliser que des fixtures
éphémères de test. Aucune commande ni aucun compte n'est créé par 03B.

TOTP est figé à RFC 6238/HMAC-SHA-256, six chiffres, pas de 30 secondes,
tolérance d'un pas passé et futur et refus du rejeu. Le secret de 256 bits cible
un chiffrement enveloppe AES-256-GCM avec gestionnaire de clés externe, AAD,
version et rotation internes. Les pré-sessions et enrôlements expirent en dix
minutes, le contexte `MFA_RECOVERY` en dix minutes, le reset en quinze minutes
et l'invitation en vingt-quatre heures.

## Génération et garde-fous

`adminSecurityOperations` matérialise dans la frontière TypeScript la méthode,
le chemin, l'`operationId`, la slice, la classe de sécurité, les rôles, le
step-up, les sinks d'audit succès/échec, le profil de rate limit, Fetch
Metadata, le timing public, le manifeste signé, l'idempotence, les paramètres,
les schémas et media types, ainsi que les en-têtes de requête et de réponse. Le
validateur verrouille l'inventaire, les
statuts, les enveloppes, les AND de sécurité, les filtres, l'XOR d'audit, les
rôles et les propriétés sensibles. Les tests adversariaux mutent chaque
dimension et exigent un rejet fail-closed.
