# ADR-026 — Admin Security C2 Runtime Contract

Statut : **ACCEPTED POUR LE PRÉREQUIS CONTRACTUEL S1.2-03C2-P0 — RUNTIME NON
IMPLÉMENTÉ — PUBLICATION CONTRACTUELLE SANS AUTORISATION RUNTIME**

Date : 2026-10-09

## Contexte

S1.2-03B a figé 60 chemins, 67 opérations, 137 schémas et 27 opérations
Admin Security réparties entre C1 (12) et C2 (15). C1 est intégré à main par
le merge commit dc97eeef72c4e299988ed19d66460011a8551cf3, sans
déploiement. C2 doit conserver cette surface tout en fermant les ambiguïtés de
preuve, d’audit, d’indisponibilité, de livraison, de pagination, d’export et de
frontière PostgreSQL avant toute implémentation.

Le présent ADR complète ADR-004, ADR-019 et ADR-025. Il ne crée ni runtime,
modèle Prisma, migration, rôle PostgreSQL, compte administrateur, worker,
fournisseur, interface ou déploiement.

## Décision

### Surface et indisponibilité

Les 15 opérations C2 existantes sont conservées sans ajout de chemin ou de
schéma. Chacune déclare 503 SERVICE_UNAVAILABLE au moyen de l’unique réponse
fermée AdminServiceUnavailable :

- message public « Service temporairement indisponible. » ;
- détails vides et retryable=false ;
- aucune dépendance, exception, secret ou issue transactionnelle divulguée ;
- rollback des effets non committés lorsque le rollback est confirmé ;
- résultat neutre lorsque l’accusé de COMMIT est inconnu, sans succès, secret,
  retry automatique, second sink ou affirmation de rollback.

### Autorisation et audit par opération

Le serveur recharge toujours le compte, le rôle, la session et
authorizationVersion. Aucun champ client, cookie, sélecteur ou identifiant
n’est une preuve de contexte d’audit.

| Opération                   | Rôles                     | Purpose step-up   | Motifs clients                           | Sink de succès après preuve | Contexte / classe        |
| --------------------------- | ------------------------- | ----------------- | ---------------------------------------- | --------------------------- | ------------------------ |
| requestAdminPasswordReset   | public                    | N/A               | N/A                                      | AdminSecurityEvent          | aucun / LOGIN            |
| resetAdminPassword          | public + contexte serveur | N/A               | N/A                                      | AuditLog                    | ADMIN_RECOVERY / LOGIN   |
| createAdminRecoveryCase     | SUPER_ADMIN, SUPPORT      | N/A               | ACCOUNT_RECOVERY, SECURITY_RESPONSE      | AuditLog                    | ADMIN_SESSION / BUSINESS |
| listAdminRecoveryCases      | SUPER_ADMIN, SUPPORT      | N/A               | N/A                                      | aucun                       | ADMIN_SESSION / BUSINESS |
| getAdminRecoveryCase        | SUPER_ADMIN, SUPPORT      | N/A               | N/A                                      | aucun                       | ADMIN_SESSION / BUSINESS |
| approveAdminRecoveryCase    | SUPER_ADMIN               | RECOVERY_APPROVAL | ACCOUNT_RECOVERY, SECURITY_RESPONSE      | AuditLog                    | ADMIN_SESSION / BUSINESS |
| listAdminAuditLogs          | SUPER_ADMIN               | N/A               | N/A                                      | AuditLog                    | ADMIN_SESSION / EXPORT   |
| createAdminAuditLogExport   | SUPER_ADMIN               | AUDIT_EXPORT      | AUDIT_EXPORT                             | AuditLog                    | ADMIN_SESSION / EXPORT   |
| getAdminAuditLogExport      | SUPER_ADMIN               | N/A               | N/A                                      | AuditLog                    | ADMIN_SESSION / EXPORT   |
| downloadAdminAuditLogExport | SUPER_ADMIN               | AUDIT_EXPORT      | N/A                                      | AuditLog                    | ADMIN_SESSION / EXPORT   |
| createAdminInvitation       | SUPER_ADMIN               | INVITATION        | INVITATION_ADMINISTRATION                | AuditLog                    | ADMIN_SESSION / BUSINESS |
| acceptAdminInvitation       | public                    | N/A               | N/A                                      | AdminSecurityEvent          | aucun / BUSINESS         |
| listAdminUsers              | SUPER_ADMIN               | N/A               | N/A                                      | aucun                       | ADMIN_SESSION / BUSINESS |
| changeAdminUserRole         | SUPER_ADMIN               | ROLE_CHANGE       | ROLE_ADMINISTRATION                      | AuditLog                    | ADMIN_SESSION / BUSINESS |
| changeAdminUserStatus       | SUPER_ADMIN               | STATUS_CHANGE     | STATUS_ADMINISTRATION, SECURITY_RESPONSE | AuditLog                    | ADMIN_SESSION / BUSINESS |

Avant preuve, un rejet utilise exactement un AdminSecurityEvent. Après preuve,
le rejet conserve le sink de l’opération : AuditLog pour les opérations
auditées, aucun sink supplémentaire pour les lectures déclarées NONE, et
AdminSecurityEvent pour les deux flux publics sans contexte. Les mutations
critiques et leur AuditLog sont atomiques.

L’action HTTP stable est l’operationId. Les transitions asynchrones portent
une action SYSTEM distincte et une causalité explicite; elles ne réutilisent
pas l’action HTTP. Les snapshots sont des projections masquées positives,
adaptées à l’action. Les champs inconnus sont omis ou masqués.

### Causalité SYSTEM typée

Un `AuditLog` SYSTEM conserve `systemExecutionRefHash`, un acteur nul et
exactement une des trois origines suivantes :

1. autonome : aucun événement causal et aucun administrateur délégant ;
2. délégation administrateur prouvée : `causationEventId` référence un
   `AuditLog` légitime et `delegatedByAdminUserId` est obligatoire ;
3. continuation du reset public : `causationSecurityEventId` référence
   l'`AdminSecurityEvent` initial, sans `causationEventId` ni délégant.

Pour `requestAdminPasswordReset`, l'événement initial `LOGIN` d'action
`requestAdminPasswordReset`, la demande durable et l'outbox chiffré sont créés
atomiquement. Le worker de notification revalide le type `AdminSecurityEvent`,
l'action, la classe, l'entité `ADMIN_PASSWORD_RESET_REQUEST` et les liaisons à
la demande et à l'outbox avant d'écrire son action SYSTEM. Un identifiant
arbitraire ne suffit pas. Cette livraison ne peut pas être requalifiée en
action autonome et aucun délégant n'est déduit de l'e-mail, du destinataire,
de `subjectAdminUserId` ou d'une identité client. La réponse publique conserve
l'anti-énumération et n'expose aucun identifiant interne de causalité.

Le futur modèle SQL ajoutera une colonne nullable
`AuditLog.causationSecurityEventId` de même type que
`AdminSecurityEvent.id`, une clé étrangère `ON DELETE RESTRICT ON UPDATE
RESTRICT`, et une contrainte CHECK imposant les trois combinaisons exclusives
ci-dessus lorsque `context = SYSTEM`; hors SYSTEM, ce nouveau champ reste nul.
La relation `causationEventId -> AuditLog.id` existante reste distincte. La
demande de reset et l'outbox devront conserver une liaison non commandable par
le client vers l'événement source. Le writer de demande pourra insérer dans
les trois stores dans une seule transaction; le worker aura seulement le
SELECT des colonnes de liaison requises et l'INSERT sans RETURNING dans
`AuditLog`, jamais UPDATE/DELETE sur les sinks. Prisma, migration, rôles et
grants restent inchangés dans P0/R2 et exigent un mandat runtime littéral.

### Password reset et séparation des recovery contexts

Le succès de resetAdminPassword utilise AuditLog en contexte ADMIN_RECOVERY;
l’acteur est prouvé par un contexte opaque serveur lié à l’admin actif. Le
purpose est strictement PASSWORD_RESET, en XOR avec MFA_RECOVERY. Aucun champ
client ne prouve cette distinction.

Le reset est one-shot. Dans une transaction critique unique, il consomme le
contexte, remplace le mot de passe Argon2id, incrémente authorizationVersion,
révoque toutes les sessions et écrit l’audit. Il ne crée aucune session,
n’enrôle pas de TOTP, ne contourne pas le MFA et préserve l’enrôlement TOTP
ainsi que les codes de secours.

Le contexte durable doit préexister à cette transaction; un contexte créé
seulement dans la transaction ensuite rollbackée est interdit. Le modèle futur
doit utiliser un discriminateur de purpose dédié sans inventer de
recoveryCodeId. Avant preuve, l’échec va à AdminSecurityEvent; après preuve, à
AuditLog ADMIN_RECOVERY. Un COMMIT inconnu reste neutre, sans second sink ni
retry aveugle.

### JSON pré-contrôleur

Les neuf POST JSON C2 — requestAdminPasswordReset, resetAdminPassword,
createAdminRecoveryCase, approveAdminRecoveryCase,
createAdminAuditLogExport, createAdminInvitation, acceptAdminInvitation,
changeAdminUserRole et changeAdminUserStatus — normalisent seulement la
syntaxe JSON malformée causale en 400 VALIDATION_ERROR.

La réponse conserve le même requestId, une enveloppe Admin fermée, un unique
AdminSecurityEvent, zéro AuditLog, cookie, secret ou mutation métier.
ADMIN_RECOVERY_INVALID reste un rejet métier distinct. Les 413, 415, URIError,
autres familles, autres routes, GET et préfixes ne sont pas reclassés. Une
panne du recorder rend un 503 neutre, sans retry, fallback ou double sink.

### Listes d'erreurs C2 exactes

L'ordre et le contenu sont normatifs; ajout, retrait, doublon, substitution ou
changement du statut canonique sont interdits :

| operationId                 | Codes exacts                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| requestAdminPasswordReset   | VALIDATION_ERROR, RATE_LIMITED, SERVICE_UNAVAILABLE                                                                                                           |
| resetAdminPassword          | VALIDATION_ERROR, ADMIN_RECOVERY_INVALID, RATE_LIMITED, SERVICE_UNAVAILABLE                                                                                   |
| createAdminRecoveryCase     | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, IDEMPOTENCY_CONFLICT, SERVICE_UNAVAILABLE                                                                         |
| listAdminRecoveryCases      | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, SERVICE_UNAVAILABLE                                                                                               |
| getAdminRecoveryCase        | AUTH_REQUIRED, FORBIDDEN, RECOVERY_CASE_NOT_FOUND, SERVICE_UNAVAILABLE                                                                                        |
| approveAdminRecoveryCase    | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, RECOVERY_CASE_NOT_FOUND, RECOVERY_CASE_CONFLICT, IDEMPOTENCY_CONFLICT, RECOVERY_CASE_EXPIRED, SERVICE_UNAVAILABLE |
| listAdminAuditLogs          | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, SERVICE_UNAVAILABLE                                                                                               |
| createAdminAuditLogExport   | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, IDEMPOTENCY_CONFLICT, SERVICE_UNAVAILABLE                                                                         |
| getAdminAuditLogExport      | AUTH_REQUIRED, FORBIDDEN, AUDIT_EXPORT_NOT_FOUND, SERVICE_UNAVAILABLE                                                                                         |
| downloadAdminAuditLogExport | AUTH_REQUIRED, FORBIDDEN, AUDIT_EXPORT_NOT_FOUND, AUDIT_EXPORT_NOT_READY, AUDIT_EXPORT_EXPIRED, SERVICE_UNAVAILABLE                                           |
| createAdminInvitation       | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, IDEMPOTENCY_CONFLICT, SERVICE_UNAVAILABLE                                                                         |
| acceptAdminInvitation       | VALIDATION_ERROR, ADMIN_INVITATION_INVALID, RATE_LIMITED, SERVICE_UNAVAILABLE                                                                                 |
| listAdminUsers              | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, SERVICE_UNAVAILABLE                                                                                               |
| changeAdminUserRole         | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, ADMIN_USER_NOT_FOUND, IDEMPOTENCY_CONFLICT, LAST_SUPER_ADMIN_PROTECTED, SERVICE_UNAVAILABLE                       |
| changeAdminUserStatus       | VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN, ADMIN_USER_NOT_FOUND, IDEMPOTENCY_CONFLICT, LAST_SUPER_ADMIN_PROTECTED, SERVICE_UNAVAILABLE                       |

Les statuts canoniques restent : validation et rejets métier indiqués à 400,
AUTH_REQUIRED à 401, FORBIDDEN à 403, NOT_FOUND à 404, conflits à 409,
expirations à 410, RATE_LIMITED à 429 et SERVICE_UNAVAILABLE à 503. Une erreur
de même statut ne peut pas remplacer un code normatif.

### Livraison, mots de passe et e-mails

Reset et invitation utilisent l’e-mail et un code saisi manuellement; aucun
secret n’est placé dans un lien. Un port de notification et un outbox durable
sont requis. État métier, payload outbox chiffré et sink sont écrits dans la
même transaction. Le code brut n’est jamais persisté, loggé ou audité; son
clair n’existe que pendant le transport.

Le worker revalide expiration, révocation et remplacement. L’accusé fournisseur
est séparé du commit de demande; la livraison incertaine est représentée et
aucune garantie d’e-mail exactly-once n’est affirmée. Un 202 signifie
« accepté durablement », jamais « livré », sans oracle temporel de compte.

Avant acceptation d’un mot de passe, le port de compromission interroge HIBP
Pwned Passwords par préfixe SHA-1 avec padding. Ni mot de passe ni hash complet
n’est envoyé. Indisponibilité ou réponse inutilisable échoue en mode fermé.
SHA-1 sert uniquement à la recherche distante; Argon2id reste le stockage.
L’entrée est l’UTF-8 exact sans normalisation Unicode. P0 n’appelle aucun
fournisseur et n’ajoute aucun SDK.

Les e-mails C2 sont comparés en ASCII insensible à la casse, tout en préservant
l’orthographe de livraison acceptée. Aucun rewriting plus/dot n’est appliqué;
espaces et formes ambiguës sont refusés. La future migration exécute un
préflight de collisions avec exactement la comparaison du login, sans merge,
suppression ou réécriture automatique.

Une invitation vers un compte existant est un conflit. Une seule invitation
valide existe par e-mail canonique. Une demande distincte remplace
atomiquement l’ancienne invitation et sa livraison en attente. Même clé
d’idempotence et même payload renvoient le même résultat sans nouveau code ni
livraison.

Les six mutations C2 idempotentes ont une fenêtre de 24 heures et une portée
acteur + opération + clé + digest payload. Un payload différent rend 409. Un
rejeu recharge l’autorisation courante, n’étend aucune expiration et ne rend
jamais un secret.

### Pagination et export d’audit

Les trois listes C2 ont une limite par défaut de 25, maximale de 50, et l’ordre
createdAt DESC, id DESC. Le curseur opaque authentifié est lié au principal, à
l’opération et aux filtres. Un curseur invalide, incompatible ou expiré rend
400 VALIDATION_ERROR.

Le serveur matérialise, dans une transaction cohérente, une projection sûre;
l’autorisation est rechargée à chaque page. Le snapshot vit 15 minutes et est
borné à 10 000 entrées ou 25 MiB UTF-8. Le dépassement exige des filtres plus
restrictifs, sans troncature. Le snapshot d’audit précède l’événement de lecture
pour éviter son auto-inclusion. Ces durées sont techniques, non une politique
de rétention légale.

Les filtres d’export sont combinés par AND. Le snapshot est immuable, borné à
10 000 entrées et 25 MiB UTF-8 non compressés, sans troncature. Le stockage est
privé, chiffré et référencé de façon opaque; aucune URL signée n’est rendue.
L’artefact dérivé expire 24 heures après READY et seul cet artefact est
supprimé.

Le masking utilise une allowlist positive par action et exclut secret, e-mail
brut, IP brute et justification libre. Les clés Ed25519, JWT et de chiffrement
sont distinctes. Le profil JCS/JWS Ed25519 de R4 reste inchangé. PostgreSQL est
la source de vérité; les claims/retries worker sont bornés et idempotents; un
COMMIT inconnu se réconcilie sans retry aveugle.

Avant le premier octet de téléchargement, autorisation, step-up AUDIT_EXPORT,
intégrité et audit durable sont confirmés. Après démarrage du stream, une panne
interrompt le flux : aucune enveloppe JSON ni faux audit de complétion.

### Bootstrap et frontière PostgreSQL future

Le bootstrap futur est un CLI hors OpenAPI avec garde singleton PostgreSQL. Il
refuse tout admin existant et crée le premier SUPER_ADMIN/PENDING_MFA, sans
TOTP, code de secours ou session. Les secrets arrivent par stdin protégé ou
secret store, jamais par argument ou sortie. Création, garde et AuditLog SYSTEM
autonome sont atomiques. La sortie ne contient que des identifiants et statuts
non secrets. Un COMMIT inconnu reste neutre et sans retry. Une identité
bootstrap dédiée et au moindre privilège est requise.

Les futurs rôles C2 n’élargissent jamais le reader C1. Propriété, membership
dans les deux orientations, PUBLIC, default grants, grant option et RETURNING
sur les sinks sont interdits. Les sinks ont INSERT seulement; la lecture
d’audit passe par une projection masquée; writer et worker n’obtiennent que les
tables, colonnes et transitions nécessaires.

C2a regroupe onze opérations reset/invitation/recovery/users/RBAC et le
bootstrap hors API. C2b regroupe quatre opérations audit/export. La cible
finale conserve 15 C2 + 12 C1. Ce découpage n’autorise aucun runtime.

Les allowlists proposées sont littérales dans le contrat OpenAPI. Aucun
wildcard ni timestamp de migration n’est inventé. Le chemin de migration reste
absent et devra être nommé littéralement par un futur mandat CTO avant toute
écriture.

## Fournisseurs et limites

Notification, HIBP, stockage d’export et fournisseur de clé de signature de
production sont **NON QUALIFIÉS**. La politique OSS reste différée. C3 n’est
pas commencé. Les preuves PostgreSQL, Redis, Docker, HTTP réel, builds
applicatifs, Flutter et navigateur sont **NON EXÉCUTÉES** dans P0.

## Conséquences

- Le générateur expose adminC2ContractPolicies, les listes/statuts exacts C2
  et les 27 opérations.
- Le validateur verrouille sémantiquement la politique C2 et refuse les
  affaiblissements de 503, purpose, sink/contexte, preuve client, XOR reset,
  causalité SYSTEM typée, listes d'erreurs, carte JSON, curseur, bornes export,
  signature et qualification fournisseur.
- L’inventaire R3 est de 60 chemins, 67 opérations et 139 schémas ; les deux
  schémas supplémentaires nomment les projections AuditLog v1/v2. Les cinq retraits historiques de SUPPORT
  restent inchangés.
- Toute implémentation C2 exige un mandat distinct, une migration littérale,
  des identités/ACL dédiées et des preuves runtime réelles.

## Amendement C2-P0-R3 — motifs déterministes et intégrité de l'export

Tout producteur C2 de `AuditLog` sélectionne le motif depuis la table normative
suivante. `SERVER_FIXED` ignore tout motif client ; `VALIDATED_CLIENT_ONLY`
emploie seulement une valeur explicitement présente et autorisée, sans premier
enum ni défaut silencieux.

| Producteur HTTP             | Source                | Valeur(s) admise(s)                      |
| --------------------------- | --------------------- | ---------------------------------------- |
| resetAdminPassword          | SERVER_FIXED          | ACCOUNT_RECOVERY                         |
| createAdminRecoveryCase     | VALIDATED_CLIENT_ONLY | ACCOUNT_RECOVERY, SECURITY_RESPONSE      |
| approveAdminRecoveryCase    | VALIDATED_CLIENT_ONLY | ACCOUNT_RECOVERY, SECURITY_RESPONSE      |
| listAdminAuditLogs          | SERVER_FIXED          | AUDIT_EXPORT                             |
| createAdminAuditLogExport   | VALIDATED_CLIENT_ONLY | AUDIT_EXPORT                             |
| getAdminAuditLogExport      | SERVER_FIXED          | AUDIT_EXPORT                             |
| downloadAdminAuditLogExport | SERVER_FIXED          | AUDIT_EXPORT                             |
| createAdminInvitation       | VALIDATED_CLIENT_ONLY | INVITATION_ADMINISTRATION                |
| changeAdminUserRole         | VALIDATED_CLIENT_ONLY | ROLE_ADMINISTRATION                      |
| changeAdminUserStatus       | VALIDATED_CLIENT_ONLY | STATUS_ADMINISTRATION, SECURITY_RESPONSE |

Après preuve serveur, un motif client absent ou invalide produit un audit de
rejet avec `reasonCode=SECURITY_RESPONSE`, `operatorReason=null` et sans copie
du texte invalide. La colonne de compatibilité physique `AuditLog.reason`
reçoit le littéral serveur exact `C2_RUNTIME`, jamais un texte client, et reste
absente des projections. Avant preuve, le sink est `AdminSecurityEvent` et ne
porte aucun motif SQL. `requestAdminPasswordReset` et
`acceptAdminInvitation` restent `AdminSecurityEvent`; les lectures recovery et
users déclarées `NONE` ne reçoivent aucun `reasonCode` SQL.

| Transition SYSTEM                                 | Origine R2            | Source validée                                  | reasonCode                |
| ------------------------------------------------- | --------------------- | ----------------------------------------------- | ------------------------- |
| PASSWORD_RESET_NOTIFICATION_DELIVERY_SYSTEM_AUDIT | PUBLIC_PASSWORD_RESET | événement de demande reset + outbox             | ACCOUNT_RECOVERY          |
| INVITATION_NOTIFICATION_DELIVERY_SYSTEM_AUDIT     | ADMIN_DELEGATION      | audit createAdminInvitation + outbox            | INVITATION_ADMINISTRATION |
| EXPORT_BUILD_SYSTEM_AUDIT                         | ADMIN_DELEGATION      | audit createAdminAuditLogExport                 | AUDIT_EXPORT              |
| EXPORT_EXPIRY_SYSTEM_AUDIT                        | AUTONOMOUS            | horloge d'expiration export                     | AUDIT_EXPORT              |
| RECOVERY_CASE_SERVER_CANCELLATION_SYSTEM_AUDIT    | ADMIN_DELEGATION      | audit allowlisté create-recovery ou rôle/statut | ACCOUNT_RECOVERY          |
| RECOVERY_CASE_SERVER_EXPIRATION_SYSTEM_AUDIT      | AUTONOMOUS            | horloge d'expiration recovery case              | ACCOUNT_RECOVERY          |
| ADMIN_BOOTSTRAP_SYSTEM_AUDIT                      | AUTONOMOUS            | garde singleton du CLI bootstrap                | SECURITY_RESPONSE         |

Chaque transition SYSTEM fixe `operatorReason=null`. L'expiration serveur d'un
recovery case, déjà déclarée comme transition SYSTEM, est arbitrée ici dans le
même domaine que son annulation : `ACCOUNT_RECOVERY`.

`contentSha256` est le SHA-256 hexadécimal minuscule des octets exacts du ZIP
final immuable, après assemblage et avant chiffrement de stockage. Il inclut
`manifest.json` et `manifest.sig`. Les mêmes octets doivent être retrouvés
après déchiffrement et former exactement le corps du téléchargement, sans
recompression ni reconstruction. Le ciphertext, le manifeste seul, les seuls
payloads, les en-têtes et le framing HTTP sont exclus. Le hash est conservé en
état `EXPIRED` après suppression de l'artefact dérivé. Pour éviter toute
autoréférence, `contentSha256` est absent du ZIP et de son manifeste ; le profil
JCS/JWS Ed25519 R4 et les hashes par entrée restent inchangés.
