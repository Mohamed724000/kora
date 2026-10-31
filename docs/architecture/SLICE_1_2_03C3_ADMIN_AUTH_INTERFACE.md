# S1.2-03C3 — Interface d'authentification Admin

Statut : **CANDIDAT LOCAL L0–L5 IMPLÉMENTÉ — A-02 GO LOCAL/CI —
QUALIFICATION TECHNIQUE LOCALE GO FINAL BORNÉ — FIREFOX WINDOWS GO BORNÉ —
APPROBATION VISUELLE PRODUCT OWNER BORNÉE — C3-PUB-SC-01 FERMÉ LOCALEMENT —
NON INDEXÉ, NON PUBLIÉ, NON DÉPLOYÉ**

Date : 2026-10-31

Baseline : merge C2b `c47a1507dce6ea7333ce7e372f9bd34aa548c81b`,
arbre `063f2c7ab5cdf9df489332263e4b3184adf90330`.

Autorités : [ADR-025](../adr/ADR-025-admin-auth-session-audit-contexts.md),
[ADR-026](../adr/ADR-026-admin-security-c2-runtime-contract.md), contrat
OpenAPI intégré et décision A-02 du mandat C3.

Ce document décrit le candidat local courant. Il ne qualifie ni publication,
ni hébergement, ni certificat, ni réseau, ni fournisseur de production.

## Périmètre fermé

C3 consomme treize opérations intégrées. Il ne crée aucun endpoint.

| Méthode et chemin same-origin                                     | `operationId`                  | Parcours                                              |
| ----------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `POST /api/v1/admin/auth/login`                                   | `loginAdmin`                   | `/login`                                              |
| `POST /api/v1/admin/auth/totp/enrollments`                        | `createAdminTotpEnrollment`    | `/2fa/setup`                                          |
| `POST /api/v1/admin/auth/totp/enrollments/{enrollmentId}/qr`      | `deliverAdminTotpEnrollmentQr` | QR éphémère                                           |
| `POST /api/v1/admin/auth/totp/enrollments/{enrollmentId}/confirm` | `confirmAdminTotpEnrollment`   | session et dix codes single-display                   |
| `POST /api/v1/admin/auth/totp/verify`                             | `verifyAdminTotp`              | `/2fa/verify`                                         |
| `POST /api/v1/admin/auth/recovery-codes/verify`                   | `verifyAdminRecoveryCode`      | `/2fa/recovery`, sans session avant nouvel enrôlement |
| `POST /api/v1/admin/auth/recovery-codes/rotate`                   | `rotateAdminRecoveryCodes`     | `/compte/securite`, TOTP inline                       |
| `POST /api/v1/admin/auth/sessions/refresh`                        | `refreshAdminSession`          | bootstrap et renouvellement                           |
| `DELETE /api/v1/admin/auth/sessions/current`                      | `revokeCurrentAdminSession`    | déconnexion courante                                  |
| `GET /api/v1/admin/auth/sessions`                                 | `listAdminSessions`            | sessions du compte courant                            |
| `POST /api/v1/admin/auth/password/reset-requests`                 | `requestAdminPasswordReset`    | `/recuperation`                                       |
| `POST /api/v1/admin/auth/password/reset`                          | `resetAdminPassword`           | `/recuperation/reinitialiser`                         |
| `POST /api/v1/admin/auth/invitations/accept`                      | `acceptAdminInvitation`        | `/invitation/accepter`                                |

La table fermée est portée par
`apps/admin/lib/auth/admin-auth-proxy-policy.ts`. Le proxy refuse avant appel
amont toute méthode ou route absente, query string, encodage ambigu, double
slash, slash inverse ou traversal.

`stepUpAdminSession`, la révocation ciblée d'une autre session, la création
d'invitation, users/RBAC/statuts, la récupération assistée et les quatre
opérations C2b audit/export restent hors interface C3.

## Frontière A-02 locale/CI

La topologie qualifiée est :

`navigateur -> Nginx HTTPS contrôlé -> BFF Next privé -> API privée mTLS`.

- Nginx ne relaie aucun header client par défaut. Il reconstruit une allowlist,
  remplace la provenance par l'adresse de son pair réseau et ne consulte aucun
  `Forwarded`, `X-Forwarded-*` ou `X-Real-IP` fourni par le navigateur.
- Seul Nginx publie un port hôte. Le BFF, l'API, PostgreSQL et Redis restent
  sur les réseaux dédiés non publiés décrits par `infra/c3/compose.yaml`.
- Le BFF exige une provenance unique et canonique, puis vérifie CA, identité
  DNS/SAN, EKU et empreinte serveur avec `rejectUnauthorized=true`.
- L'API exige une socket TLS autorisée, le SAN URI exact
  `spiffe://kora.local/c3/admin-bff`, l'EKU client et l'empreinte leaf exacte.
  Une provenance absente, multiple, ambiguë ou malformée échoue fermée.
- Le profil historique `DIRECT` C1/C2 reste distinct : il refuse le header
  interne et utilise `socket.remoteAddress`.

La clôture A-02 archivée démontre Admin 50/50, API 38/38 et configuration
20/20, deux buckets IP distincts, le maintien du bucket sujet, l'absence
d'effet des headers forgés, l'inaccessibilité directe du BFF et les refus de
certificats absents, expirés, étrangers ou d'une autre identité. Cette preuve
reste locale/CI ; aucun CDN, NAT, certificat ou réseau de production n'est
qualifié.

## BFF, cookies et résultat incertain

- Les mutations exigent l'`Origin` exact et `Sec-Fetch-Site=same-origin`.
- Le BFF reconstruit uniquement les cookies requis parmi préauth, refresh et
  CSRF. Doublons, formes invalides et contextes incompatibles sont refusés.
- La matrice `Set-Cookie` impose noms, cardinalité, `Secure`, `Path=/`, absence
  de `Domain`, `SameSite=Strict` et `HttpOnly`, sauf pour le cookie CSRF.
- L'access token ne réside qu'en mémoire React. Aucun token n'est placé dans
  SSR/RSC, storage, URL ou BroadcastChannel.
- Le proxy applique une deadline bornée et aucun retry automatique. Une issue
  réseau ou un COMMIT incertain n'est jamais transformé en succès.
- Le refresh est coordonné par Web Locks. BroadcastChannel ne transporte que
  l'invalidation et la génération ; sans Web Locks, le client échoue fermé.
- `returnTo` est limité à `/` et `/compte/securite`.

## Frontières de rendu

Le `RootLayout` est neutre : métadonnées globales `noindex`, skip-link et
`AdminSessionProvider`, sans dashboard. Le groupe `(auth)` utilise
`AuthLayout` et `PublicSessionBoundary`. Le groupe `(protected)` ne rend le
`DashboardLayout` qu'après `ProtectedSessionBoundary` et refresh réel. Le rôle
JWT ne sert qu'à l'affichage ; l'API demeure l'autorité d'autorisation.

Les états Next globaux restent anonymes :

- `loading.tsx` utilise un `main` neutre, `aria-busy` et un statut poli ;
- `error.tsx` masque les détails, place le focus sur `main`, utilise une alerte
  assertive et ne relance que le rendu, jamais une mutation d'authentification ;
- `not-found.tsx` offre un lien explicite vers `/login`, sans navigation
  protégée ni redirection vers le tableau de bord ;
- le probe `KORA_C3_GLOBAL_STATE_PROBE=1` traverse les vraies boundaries Next
  en qualification seulement et n'ajoute aucune capacité métier.

## Unicode et correction C2a révélée par C3

Le mot de passe est validé entre 12 et 128 points de code Unicode exacts, sans
trim, normalisation, troncature, comptage en octets UTF-8, unités UTF-16 ou
graphèmes. Connexion, reset et invitation sont alignés ; les formulaires ne
réintroduisent pas une borne HTML incompatible.

Le parcours réel de resets successifs a révélé une requête C2a parente non
terminalisée. Le candidat corrige `consumePasswordReset` dans la transaction
existante : contexte exact consommé, requête parente correspondante marquée
par `revokedAt` au même instant, credential changé, `authorizationVersion`
incrémentée, sessions révoquées et audit inséré. Les cardinalités décisives
doivent chacune valoir un. L'ancien outbox `DELIVERED` reste inchangé. La
demande suivante crée ses propres identifiants sans faux remplacement ; un
seul reset concurrent réussit et un échec d'audit rollbacke toutes les
mutations. Aucun schéma, migration, trigger, ACL ou contrat n'est modifié.

## Preuves avant fermeture ciblée Firefox — instantané historique

| Contrôle                    | Résultat sélectionné                                    | Portée ou limite                                                                                  |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A-02                        | GO local/CI                                             | production non qualifiée                                                                          |
| Tooling ciblé               | 143/143 PASS                                            | scanner et sélection navigateur, avec régressions adversariales                                   |
| Tooling complet             | 573/573 PASS                                            | candidat technique final                                                                          |
| Admin unitaires             | 16 fichiers, 115 tests PASS                             | warning sourcemap non bloquant                                                                    |
| Admin lint/typecheck/build  | code 0                                                  | Next.js 16.4.1, 14 routes                                                                         |
| API format/lint/typecheck   | code 0                                                  | TypeScript 5.9.3, mêmes sources runtime                                                           |
| API tests/build/fail-closed | 344 PASS, 76 SKIP ; build 0 ; startup attendu code 1    | 42 suites PASS, 1 suite SKIP ; démarrage sans configuration refusé avant écoute                   |
| OpenAPI/génération          | 60 chemins, 67 opérations, 141 schémas ; check courant  | aucun changement contractuel                                                                      |
| Scanner officiel final      | code 0, 526 fichiers                                    | `history=true`, `immutable=52`, six scripts d'installation qualifiés                              |
| Licences                    | 824 paquets, 0 non déclaré, 0 non approuvé              | Nginx traité séparément                                                                           |
| Signatures                  | 822 signatures, 191 attestations                        | preuve npm courante                                                                               |
| Chromium candidat final     | 18/18 PASS                                              | projet `chromium-c3`, retries 0, un worker                                                        |
| WebKit candidat final       | 3/3 PASS                                                | projet `webkit-public-smoke`, trois scénarios publics                                             |
| Firefox Windows             | sonde instrumentée NON-PASS ; 0/3 exécuté               | `Browser.newPage()` reçoit deux onglets ; URL du second et attribution exclusive NON DEMONSTRATED |
| Visual candidat final       | 1/1 PASS ; neuf PNG byte-identiques à v54               | deux états DOM synthétiques ; validation Product Owner en attente                                 |
| Redaction et secret scan    | probe synthétique attendu ; 176 textes, 196 sentinelles | zéro violation ; neuf PNG exclus explicitement                                                    |
| Cleanup candidat final      | code 0, inventaire `SEMANTIC_IDENTICAL`                 | aucun conteneur, volume, réseau ou répertoire temporaire de campagne                              |
| Wrapper candidat final      | code 0                                                  | mode local borné Chromium/WebKit ; le mode `Complete` reste le défaut                             |
| Audits npm complet/prod     | codes 0, zéro vulnérabilité                             | installation propre du lock final                                                                 |

Le graphe sélectionné remplace la chaîne Nest CLI par le build direct
`typescript@5.9.3` et le watch borné `concurrently@10.0.6`. Nest CLI,
`fork-ts-checker-webpack-plugin`, `deepmerge` et `cosmiconfig` sont absents du
graphe final. Le scanner protège l'override exact
`js-yaml@4.3.0 -> js-yaml@4.3.2`, l'installation unique
`node_modules/js-yaml@4.3.2` et le parent
`@eslint/eslintrc@3.3.6 -> js-yaml@^4.3.0`. Le premier NON-PASS sur le parent
historique `cosmiconfig` reste archivé.

Dans cet instantané historique, la campagne ne transformait pas Firefox en
PASS : elle sélectionnait explicitement Chromium et WebKit, tandis que
`Complete` demeure le mode par
défaut du wrapper et de la CI. La sonde Firefox fraîche lance le navigateur,
mais échoue avant navigation à `browser.newPage()` avec
`Unexpected number of tabs in the new window: 2`. Les trois scénarios Firefox
restent **NON EXÉCUTÉS**.

L'image Nginx reste épinglée à l'index `f45171d3…edc26` et à l'enfant amd64
`f9238a4a…6f24`. Docker Scout signale brutement `CVE-2026-107891` sur
`musl@1.2.6-r3` avec une borne générique/edge `r6`, alors que le tracker
officiel Alpine 3.24/main classe `1.2.6-r3` corrigé. Le faux positif
d'affectation par confusion de branche est donc démontré, sans waiver ni
suppression du résultat brut. Le SBOM 26/808, ses conclusions
`licenseConcluded=NOASSERTION`, la provenance `reproducible=false` et
l'absence de qualification production restent inchangés.

## Décision locale avant fermeture ciblée — instantané historique

Verdict alors constaté : **QUALIFICATION TECHNIQUE LOCALE PARTIELLE — BLOCK
GLOBAL**.

Les blockers supply-chain npm et affectation Nginx sont fermés sur le candidat
exact. Deux écarts demeuraient :

1. Firefox Windows reste NON-PASS avant navigation et ses trois scénarios sont
   NON EXÉCUTÉS ; une correction ne pourra être qualifiée qu'avec une cause
   démontrée et un nouveau contrôle ciblé ;
2. l'approbation visuelle explicite du Product Owner manque encore pour les
   neuf captures, dont loading et unavailable sont des états synthétiques.

Fournisseurs, clés, certificats, infrastructure et Linux de production restent
NON QUALIFIÉS. La politique OSS générale demeure différée. Aucune publication,
intégration ou déploiement n'est autorisé par cette qualification.

## Mise à jour de clôture ciblée Firefox — 2026-10-31

Cette section supersède uniquement l'état courant Firefox et le verdict local
ci-dessus ; les NON-PASS antérieurs restent historiques. La sonde visible a
identifié les deux cibles réelles : `about:blank` et la page de premier
lancement `https://www.mozilla.org/en-US/privacy/firefox/`. La préférence de
profil de campagne `datareporting.policy.firstRunURL=''`, limitée au seul
projet Firefox, supprime causalement cette seconde cible sans désactiver
télémétrie, Safe Browsing ou protection contre le pistage.

Sur Windows, le cache personnel Playwright reste NON QUALIFIÉ : son lancement
headless échoue avec `SideBySide/33` et `mozglue`, tandis qu'un cache isolé
byte-identique passe. La cause profonde de cette différence dépendante du
chemin reste **NON CONCLUSIVE**. Le wrapper sélectionne donc explicitement le
cache isolé, vérifie Firefox 157/révision 1555, les empreintes du binaire et de
`mozglue`, ainsi qu'un manifeste fermé de 61 fichiers ; aucun fallback vers le
cache personnel et aucune variable globale `PLAYWRIGHT_BROWSERS_PATH` ne sont
autorisés.

La campagne `c3-ff-qualified-20261031t1041` exécute les trois scénarios Firefox
prévus : **3/3 PASS**, sans retry, avec redaction, scan de secrets, cleanup
ciblé et inventaire étranger `SEMANTIC_IDENTICAL`. Les preuves Chromium 18/18
et WebKit 3/3 restent applicables : leurs sources, dépendances et paramètres de
projet n'ont pas changé. Tooling ciblé 27/27 et complet 573/573 passent ; le
test ajouté refuse un fichier caché supplémentaire dans le cache Firefox.

Verdict technique : **GO LOCAL**. Le verdict global reste **BLOCK VISUEL
PRODUCT OWNER** jusqu'à une appréciation explicite des neuf captures, dont
`loading` et `unavailable` sont des états synthétiques. Cette qualification ne
vaut ni publication, ni qualification de production.

## Décision Product Owner et remédiation C3-PUB-SC-01 — 2026-10-31

La décision Product Owner hors dépôt approuve uniquement les neuf captures de
la planche SHA-256
`5485987f4da1be07a30234e91c0a065c61552b0ea0ea5ee713c168da1fd0cb11`,
rattachée au gel technique
`79cc6da1b1fd047c877e175ac8bcee8af5fd2707528bbec5099d2726a3c7c2fd`.
`loading` et `unavailable` restent synthétiques ; les parcours absents et les
contrôles d'accessibilité non démontrés ne sont pas qualifiés.

Le premier préflight de publication a ensuite identifié
`GHSA-g3hv-75wg-m249` sur l'unique installation de développement
`minimatch@10.2.6`. Ce BLOCK de publication reste historique. La correction
locale remplace uniquement l'override racine par `minimatch@11.0.1` et laisse
npm produire le lockfile, avec la nouvelle transitive
`@isaacs/nonrecursive-glob-match@1.0.3`. Le scanner verrouille versions,
emplacements, parents, ranges déclarés, moteurs, licences, URL de registre,
intégrités et graphes de dépendances exacts ; toute copie vulnérable,
substitution ou parent supplémentaire est refusé.

La compatibilité démontrée est limitée aux chemins ESLint effectivement
configurés et exécutés par KORA+. Les découvertes et exclusions des six
workspaces, y compris les chemins Windows, restent identiques. Les options
dormantes `import/no-internal-modules` avec `forbid` et
`react/jsx-pascal-case` avec `ignore` restent incompatibles et interdites
jusqu'à qualification distincte ; aucune compatibilité générale des plugins
n'est revendiquée.

Installation propre, chaîne npm, scanner, tooling 579/579, audits complet et
production à zéro, 823 signatures, 191 attestations et licences 825/0/0 sont
concluants. Lint, typecheck, tests et build passent au code 0 ; le build iOS
reste NON EXÉCUTÉ sur Windows. Les sept artefacts WASM optionnels signalés
`extraneous` par npm 10 restent une réserve explicite, sans `invalid`,
`ELSPROBLEMS` ni code non nul.

Chromium 18/18, WebKit 3/3, Firefox 3/3, A-02, Nginx et les neuf captures sont
réutilisés sans nouvelle campagne : leurs sources, configurations, artefacts
et dépendances d'exécution ne changent pas. Aucune nouvelle exécution globale
24/24 n'est revendiquée.

Verdict local après C3-PUB-SC-01 : **GO LOCAL FINAL BORNÉ**. La publication,
la CI de pull request, l'intégration et la production restent des décisions et
preuves distinctes.
