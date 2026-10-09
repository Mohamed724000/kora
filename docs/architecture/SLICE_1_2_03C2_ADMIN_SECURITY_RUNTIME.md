# S1.2-03C2 — Admin Security Runtime Contract

Statut : **PRÉREQUIS CONTRACTUEL P0 VALIDÉ — RUNTIME NON IMPLÉMENTÉ**

Date : 2026-10-09

Autorité : [ADR-026](../adr/ADR-026-admin-security-c2-runtime-contract.md),
[ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md), ADR-004 et
ADR-019.

## Frontière P0

P0 modifie uniquement le contrat OpenAPI, son validateur, son générateur, la
frontière Contracts et la documentation autorisée. L’inventaire demeure :

- 60 chemins, 67 opérations et 137 schémas ;
- 12 opérations C1 intégrées et inchangées ;
- 15 opérations C2 contractées, sans route runtime ;
- cinq retraits historiques de SUPPORT inchangés ;
- aucun Prisma, migration, provisioning, rôle PostgreSQL, dépendance, lockfile,
  workflow, interface, appel fournisseur ou déploiement.

Le contrat généré expose adminC1ContractPolicies,
adminC2ContractPolicies et adminSecurityOperations. Il n’est jamais édité à la
main.

## Matrice d’exécution C2

| operationId                 | Preuve/roles                     | Step-up           | Justification                                              | Sink succès / échec prouvé            | Action / classe / entité                     |
| --------------------------- | -------------------------------- | ----------------- | ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| requestAdminPasswordReset   | public, aucun contexte           | N/A               | N/A                                                        | SecurityEvent / SecurityEvent         | même operationId / LOGIN / reset request     |
| resetAdminPassword          | contexte PASSWORD_RESET serveur  | N/A               | N/A                                                        | AuditLog recovery / AuditLog recovery | même operationId / LOGIN / admin user        |
| createAdminRecoveryCase     | session + SUPER_ADMIN ou SUPPORT | N/A               | recovery, raison requise                                   | AuditLog / AuditLog                   | même operationId / BUSINESS / recovery case  |
| listAdminRecoveryCases      | session + SUPER_ADMIN ou SUPPORT | N/A               | N/A                                                        | NONE / NONE                           | même operationId / BUSINESS / snapshot cases |
| getAdminRecoveryCase        | session + SUPER_ADMIN ou SUPPORT | N/A               | N/A                                                        | NONE / NONE                           | même operationId / BUSINESS / recovery case  |
| approveAdminRecoveryCase    | session + SUPER_ADMIN            | RECOVERY_APPROVAL | recovery, raison requise                                   | AuditLog / AuditLog                   | même operationId / BUSINESS / recovery case  |
| listAdminAuditLogs          | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit snapshot   |
| createAdminAuditLogExport   | session + SUPER_ADMIN            | AUDIT_EXPORT      | AUDIT_EXPORT, raison requise                               | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| getAdminAuditLogExport      | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| downloadAdminAuditLogExport | session + SUPER_ADMIN            | AUDIT_EXPORT      | N/A serveur                                                | AuditLog / AuditLog                   | même operationId / EXPORT / audit export     |
| createAdminInvitation       | session + SUPER_ADMIN            | INVITATION        | INVITATION_ADMINISTRATION, raison requise                  | AuditLog / AuditLog                   | même operationId / BUSINESS / invitation     |
| acceptAdminInvitation       | public, invitation one-shot      | N/A               | N/A                                                        | SecurityEvent / SecurityEvent         | même operationId / BUSINESS / invitation     |
| listAdminUsers              | session + SUPER_ADMIN            | N/A               | N/A serveur                                                | NONE / NONE                           | même operationId / BUSINESS / users snapshot |
| changeAdminUserRole         | session + SUPER_ADMIN            | ROLE_CHANGE       | ROLE_ADMINISTRATION, raison requise                        | AuditLog / AuditLog                   | même operationId / BUSINESS / admin user     |
| changeAdminUserStatus       | session + SUPER_ADMIN            | STATUS_CHANGE     | STATUS_ADMINISTRATION ou SECURITY_RESPONSE, raison requise | AuditLog / AuditLog                   | même operationId / BUSINESS / admin user     |

Tout échec avant preuve produit exactement un AdminSecurityEvent. Les actions
SYSTEM de worker sont distinctes de l’operationId HTTP et lient leur événement
causal ainsi que l’administrateur délégant. Les snapshots before/after sont des
projections masquées positives propres à l’action.

## États et atomicité

### Reset

Le contexte PASSWORD_RESET durable existe avant la transaction critique et ne
peut être remplacé par MFA_RECOVERY. La transaction consomme le contexte,
change le mot de passe Argon2id, incrémente authorizationVersion, révoque les
sessions et écrit AuditLog ADMIN_RECOVERY. TOTP et codes de secours sont
préservés. Aucun enrollment, session ou bypass MFA n’est créé.

### Recovery assistée

La création annule atomiquement les dossiers PENDING antérieurs du sujet,
persiste le nouveau dossier, l’idempotence et l’audit. L’approbation exige un
SUPER_ADMIN distinct avec step-up RECOVERY_APPROVAL et consomme le dossier
one-shot. Les transitions serveur d’annulation/expiration ont leur propre
action SYSTEM et causalité.

### Invitation

La comparaison e-mail est ASCII case-insensitive, sans rewriting plus/dot, avec
orthographe de livraison préservée. Compte existant : conflit. Une seule
invitation valide existe par e-mail canonique. Le remplacement révoque
atomiquement l’invitation précédente et sa livraison en attente.

### Idempotence

Les six mutations déclarées idempotentes conservent 24 heures une clé portée
par acteur, opération, clé et digest du payload. Même payload : même résultat,
sans nouveau secret ni delivery. Payload différent : 409. Le rejeu recharge
l’autorisation et ne prolonge aucune expiration.

## JSON malformé et 503

Les neuf POST JSON exacts de l’ADR-026 mappent seulement l’erreur causale
entity.parse.failed/SyntaxError/statut 400/POST/route exacte/application-json
vers 400 VALIDATION_ERROR. Le requestId est conservé; un seul SecurityEvent est
requis; AuditLog, cookies, secrets et mutations sont absents. 413, 415,
URIError, GET, autres routes, préfixes et autres erreurs traversent inchangés.

Les 27 opérations Admin déclarent le même 503 fermé. Pour C2, un échec du
recorder, d’une dépendance requise ou d’une durabilité critique retourne ce 503
sans fuite. Rollback confirmé et issue COMMIT inconnue restent distincts;
aucune issue inconnue n’est retentée aveuglément.

## Notification et compromission du mot de passe

Le futur NotificationPort accepte un message sans secret dans une URL. Le code
clair est éphémère. État métier, outbox chiffré et sink durable partagent une
transaction. Le worker revalide expiration, révocation et remplacement avant
delivery; son acknowledgement est distinct du commit initial. L’état permet
une livraison incertaine sans promesse exactly-once.

Le futur PasswordCompromisePort applique l’API range HIBP : préfixe SHA-1
seulement, padding activé, jamais le mot de passe ou le hash complet. Une panne
ou réponse inutilisable échoue en mode fermé. SHA-1 n’est pas un mécanisme de
stockage; Argon2id reste obligatoire. L’UTF-8 exact n’est pas normalisé.

P0 ne sélectionne, n’installe ni n’appelle aucun provider ou SDK.

## Pagination C2

listAdminRecoveryCases, listAdminAuditLogs et listAdminUsers utilisent les
paramètres dédiés AdminC2Cursor et AdminC2Limit :

- défaut 25, maximum 50 ;
- ordre createdAt DESC puis id DESC ;
- curseur opaque authentifié lié au principal, à l’opération et aux filtres ;
- 400 VALIDATION_ERROR pour curseur invalide, incompatible ou expiré ;
- snapshot serveur de projection sûre, transaction cohérente ;
- rechargement de l’autorisation à chaque page ;
- durée 15 minutes ;
- maximum 10 000 entrées ou 25 MiB UTF-8 ;
- dépassement explicite « restreindre les filtres », sans troncature.

Pour l’audit, le snapshot est matérialisé avant l’écriture de l’événement de
lecture. Ces limites ne définissent aucune rétention légale.

## Export d’audit

Les filtres sont AND et partagent les bornes de snapshot : 10 000 entrées,
25 MiB UTF-8 non compressés, aucune troncature. Le ZIP privé chiffré est
référencé de façon opaque, jamais par URL signée. Il expire 24 heures après
READY; sa suppression ne touche pas la source AuditLog PostgreSQL.

La projection est une allowlist par action. Secret, e-mail brut, IP brute,
justification libre et champ inconnu non approuvé ne sont pas exportés. Le
profil signé R4 reste RFC 8785 JCS UTF-8 puis JWS detached Ed25519 avec entrée
de signature RFC 7515; b64=false demeure interdit. Clé Ed25519, clé JWT et clé
de stockage sont séparées.

Le worker revendique des jobs bornés/idempotents. Un COMMIT inconnu est
réconcilié. Avant le premier octet, autorisation, step-up AUDIT_EXPORT,
intégrité et audit durable sont établis. Après le premier octet, une panne
interrompt le stream sans JSON ni faux succès d’audit.

## Bootstrap CLI futur

Le CLI hors OpenAPI :

1. acquiert un garde singleton PostgreSQL ;
2. refuse si un AdminUser existe ;
3. crée exactement un SUPER_ADMIN/PENDING_MFA ;
4. ne crée ni TOTP, recovery codes ou session ;
5. reçoit les secrets via stdin protégé ou secret store ;
6. écrit création, garde et AuditLog SYSTEM autonome atomiquement ;
7. n’affiche que des identifiants et statuts non secrets ;
8. neutralise un COMMIT inconnu, sans retry ;
9. emploie une identité bootstrap future dédiée et minimale.

P0 ne crée ni commande, compte, rôle ou permission.

## Livraison future C2a/C2b

C2a contient onze opérations reset, invitation, recovery, users et RBAC, plus
le bootstrap hors API. C2b contient quatre opérations audit/export. La somme
reste 15 C2 et les 12 opérations C1 ne sont pas modifiées.

Allowlist C2a proposée :

- apps/api/src/admin-security/admin-security.module.ts
- apps/api/src/admin-security/admin-security.controller.ts
- apps/api/src/admin-security/admin-security.service.ts
- apps/api/src/admin-security/admin-security.repository.ts
- apps/api/src/admin-security/admin-notification.port.ts
- apps/api/src/admin-security/admin-password-compromise.port.ts
- apps/api/src/admin-security/admin-notification.worker.ts
- apps/api/src/admin-security/admin-bootstrap.command.ts
- apps/api/test/admin-security-c2a.integration.spec.ts
- apps/api/prisma/schema.prisma

Allowlist C2b proposée :

- apps/api/src/admin-security/admin-audit-query.service.ts
- apps/api/src/admin-security/admin-audit-export.service.ts
- apps/api/src/admin-security/admin-audit-export.worker.ts
- apps/api/test/admin-security-c2b.integration.spec.ts
- apps/api/prisma/schema.prisma

Ces listes sont des propositions de décision future, non des autorisations de
runtime. Aucun wildcard n’est utilisé. Aucun chemin de migration n’est nommé :
le futur mandat doit fournir son chemin littéral exact, sans timestamp inventé.

## Identités et ACL PostgreSQL futures

Le reader C1 n’est jamais élargi. Les identités C2a writer, notification
worker, C2b audit reader/export worker et bootstrap sont séparées par besoin.
Elles ne reçoivent ni ownership, membership dans l’une ou l’autre orientation,
PUBLIC/default grant, grant option ou droits transverses.

Les sinks AuditLog/AdminSecurityEvent sont INSERT-only et sans RETURNING. Les
lectures d’audit passent par une projection masquée. Chaque writer/worker ne
reçoit que les tables, colonnes et transitions nécessaires. Les noms réels,
grants SQL, modèle Prisma et migration restent à décider et tester dans les
lots runtime.

## Gates futurs

Avant toute publication runtime : migration littérale, tests PostgreSQL des
deux orientations de membership, ACL et absence de droits implicites; preuves
HTTP réelles des 15 opérations; concurrence, idempotence, rollback et COMMIT
inconnu; Redis/worker/outbox; provider adapters et failure modes; scanner,
licences, audits et builds applicables.

Dans P0, PostgreSQL, Redis, Docker, HTTP réel, API build, Flutter, navigateur
et fournisseurs sont **NON EXÉCUTÉS**.
