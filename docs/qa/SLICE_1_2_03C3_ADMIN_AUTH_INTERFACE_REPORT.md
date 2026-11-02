# S1.2-03C3 — Rapport de qualification de l'interface Admin Auth

Statut : **C3 DANS LA DRAFT PR #54 — HEAD `c820bec…` — INFRASTRUCTURE
`41439908216` NON-PASS HISTORIQUE — DIAGNOSTIC NAVIGATEUR FERMÉ QUALIFIÉ
LOCALEMENT — RÉSOLUTION
MULTI-PLATEFORME DU RUNNER QUALIFIÉE LOCALEMENT — INTÉGRATION CONDITIONNÉE À
UNE CI FRAÎCHE — APPROBATION VISUELLE PRODUCT OWNER BORNÉE**

Date : 2026-11-02

## Référence et autorité

- baseline : `c47a1507dce6ea7333ce7e372f9bd34aa548c81b` ;
- arbre baseline : `063f2c7ab5cdf9df489332263e4b3184adf90330` ;
- branche locale : `feat/s1-2-03c3-admin-auth-interface` ;
- quatorze worktrees attendus ;
- ADR-025, ADR-026, OpenAPI intégré, mandat C3 A-02 et avenants Unicode,
  états globaux anonymes et reset C2a atomique.

Le candidat demeure dans le worktree local, avec index vide. Aucun `git add`,
commit, push, PR, Ready, approval, merge, tag, release ou déploiement C3 n'est
autorisé par la campagne.

## Périmètre

C3 consomme exactement treize opérations C1/C2a : login, enrôlement TOTP,
livraison QR, confirmation TOTP, vérification TOTP, récupération personnelle,
rotation des recovery codes, refresh, révocation de la session courante,
consultation des sessions propres, demande de reset, reset et acceptation
d'invitation. Il ne crée aucun endpoint.

Step-up sans consommateur C3, révocation ciblée, création d'invitation,
users/RBAC/statuts, récupération assistée, audit/export C2b et autres consoles
métier restent exclus.

## Matrice garantie, implémentation, assertion et preuve

| Garantie             | Implémentation                                                     | Assertion réelle                                                                                           | Preuve sélectionnée                                 | Limite                                                                        |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Provenance A-02      | Nginx HTTPS, BFF privé, API mTLS, identité exacte                  | deux IP/buckets distincts, sujet partagé, headers forgés sans effet, refus directs et certificats négatifs | Admin 50/50, API 38/38, config 20/20                | local/CI uniquement                                                           |
| Surface same-origin  | table de treize couples méthode/chemin                             | routes inconnues, query, traversal et encodage ambigu refusés avant amont                                  | tests proxy et navigateur                           | aucun endpoint nouveau                                                        |
| Cookies/CSRF         | matrice cookie par opération, Origin/Fetch Metadata, double-submit | doublons, attributs ou contextes invalides refusés                                                         | tests BFF/cookies                                   | production non qualifiée                                                      |
| Session              | token mémoire, refresh Web Locks, invalidation/génération          | réponse ancienne non réinstallée, absence de Web Locks fail-closed                                         | tests session/concurrence                           | pas de garantie d'effacement physique JS                                      |
| Mot de passe Unicode | 12–128 points de code exacts                                       | ASCII/hors BMP aux bornes, 65 emojis, combinants, espaces exacts                                           | unitaires et login après reset/invitation           | MFA non contournée                                                            |
| États globaux        | loading/error/not-found anonymes                                   | absence de shell protégé, focus/annonces, masquage erreur, lien `/login`, retry sans mutation              | tests et routage Next réel                          | probe non métier                                                              |
| Reset C2a            | requête parente `revokedAt` dans transaction existante             | outbox `DELIVERED` préservé, seconde demande indépendante, rollback et concurrence                         | unitaires et PostgreSQL/HTTP réel                   | aucune base externe réparée                                                   |
| Secrets              | pas de trace/vidéo/HAR sur parcours sensibles, redaction           | scan des textes et sentinelles                                                                             | 176 fichiers texte, 196 sentinelles, zéro violation | neuf PNG de fixtures exclus du scan textuel, dont deux états DOM synthétiques |
| Isolation Docker     | instance unique et cleanup ciblé                                   | ressources de campagne absentes, inventaire étranger comparé                                               | cleanup final code 0, `SEMANTIC_IDENTICAL`          | aucune causalité extrapolée                                                   |

## Campagnes et historique conservé

- v17 reste NON-PASS pour défaut runtime C2a : la requête de reset parente
  restait active après consommation. Il n'est pas requalifié en problème HIBP
  ou harnais.
- Les campagnes et candidats intermédiaires restent archivés sans écrasement.
- v54 navigateur reste NON-PASS 20/24 : S18 a démontré que l'e-mail requis
  vide bloquait nativement le submit avant la validation du mot de passe.
- v55 corrige le scénario par interaction clavier réelle, e-mail synthétique
  nativement valide, écoute exacte du POST login et zéro requête sur mot de
  passe court.
- Le visual v54 passe 1/1. Son bloc strict de 6 467 octets est byte-identique
  au candidat courant, SHA-256
  `7613a47ee43aa58fa61ad15f89e87935f8a216f5d2e5b305bf54cb6522ff30c5`.
- Le visual v55 reste NON-PASS environnemental : le timeout recouvre une
  transition Modern Standby et un sommeil Windows. Ce résultat n'est ni un
  PASS ni une régression produit démontrée.

## Campagne v55 — instantané historique

Instance : `v55-nativeemail-20261029t1443`, port hôte 18511.

| Sous-campagne        | Résultat                                              | Classification              |
| -------------------- | ----------------------------------------------------- | --------------------------- |
| Chromium             | 18/18                                                 | PASS historique pré-`qs`    |
| WebKit public smoke  | 3/3                                                   | PASS historique pré-`qs`    |
| Firefox public smoke | 0/3, `browserType.launch: spawn UNKNOWN`              | NON EXÉCUTÉ / NON CONCLUANT |
| Visual               | timeout pendant interruption de veille                | NON-PASS environnemental    |
| Secret scan          | zéro violation                                        | PASS dans la portée scannée |
| Cleanup              | code 0 ; inventaire étranger identique sémantiquement | PASS                        |
| Wrapper global       | code 1                                                | NON-PASS                    |

La première sonde ultérieure, unique et bornée, reproduit `spawn UNKNOWN` sur
`about:blank` avec Playwright 1.64.1, Firefox révision 1555/version 157.0 et le
binaire attendu. L'événement Windows SideBySide 33 simultané établit alors
l'échec de résolution de l'assembly `mozglue` avant création d'une page, sans
démontrer un défaut de droits ou un blocage antivirus. Une installation fraîche
ultérieure ferme ce défaut de lancement, mais la sonde instrumentée échoue
ensuite à l'unique appel `Browser.newPage()` : Firefox/Juggler compte deux
onglets alors qu'aucune page n'était attachée au contexte avant l'appel. L'URL
du second onglet et son attribution exclusive restent NON DEMONSTRATED. Les
trois scénarios Firefox restent NON EXÉCUTÉS.

## Campagne Chromium/WebKit avant fermeture Firefox — preuve réutilisée

Instance : `c3-causal-cw-20261030t1705`, port hôte 18521, wrapper borné au
mode explicite `ChromiumWebKit`. Le mode `Complete` demeure le défaut local/CI.

| Sous-campagne        | Résultat                                              | Classification                         |
| -------------------- | ----------------------------------------------------- | -------------------------------------- |
| Chromium             | 18/18, retries 0, un worker                           | PASS candidat final                    |
| WebKit public smoke  | 3/3                                                   | PASS candidat final                    |
| Firefox public smoke | non lancé                                             | NON EXÉCUTÉ ; NON-PASS séparé conservé |
| Redaction probe      | unique échec synthétique attendu, artefact neutralisé | PASS du mécanisme de redaction         |
| Visual               | 1/1, neuf PNG byte-identiques à v54                   | PASS technique ; PO en attente         |
| Secret scan          | 176 textes, 196 sentinelles, zéro violation           | PASS dans la portée scannée            |
| Cleanup              | code 0 ; inventaire étranger `SEMANTIC_IDENTICAL`     | PASS                                   |
| Wrapper global       | code 0                                                | PASS de cette campagne bornée          |

Les trois sélections de projet sont exactes : 18 tests `chromium-c3`, trois
tests `webkit-public-smoke`, zéro `firefox-public-smoke`, zéro échec, skip ou
interruption. Les avertissements stderr `NO_COLOR`/`FORCE_COLOR` ont été
examinés ; ils n'altèrent aucun code ni résultat.

## Gates L5 — instantané historique antérieur au diagnostic navigateur fermé

| Gate                               | Résultat                                                |
| ---------------------------------- | ------------------------------------------------------- |
| Tooling ciblé scanner/navigateurs  | 143/143 PASS                                            |
| Tooling complet                    | 573/573 PASS                                            |
| Tests Admin                        | 16 fichiers, 115 tests PASS                             |
| Lint Admin                         | code 0                                                  |
| Typecheck Admin                    | code 0                                                  |
| Build Admin                        | code 0 ; Next.js 16.4.1 ; 14 routes                     |
| OpenAPI                            | 60 chemins, 67 opérations, 141 schémas                  |
| Génération contractuelle `--check` | code 0, types courants                                  |
| Scanner officiel final             | code 0 ; 526 fichiers ; `history=true` ; `immutable=52` |
| Licences                           | code 0 ; 824 paquets ; 0 non déclaré ; 0 non approuvé   |
| Signatures                         | code 0 ; 822 signatures ; 191 attestations              |
| Audit complet final                | code 0 ; zéro vulnérabilité                             |
| Audit production final             | code 0 ; zéro vulnérabilité                             |

Le warning sourcemap AdminLTE de la suite Admin est conservé dans stdout ; il
n'altère pas le code 0. Les résultats v55 à huit vulnérabilités, le premier
candidat `qs@6.16.1` encore rouge sur `deepmerge` et le NON-PASS scanner
`cosmiconfig` restent historiques. Le candidat final remplace Nest CLI par le
build direct `typescript@5.9.3` et le watch `concurrently@10.0.6`. Il retire
Nest CLI, `fork-ts-checker-webpack-plugin`, `deepmerge` et `cosmiconfig` du
graphe. Installation propre, `npm ls`, audits, API 344 PASS/76 SKIP,
typecheck/build/fail-closed, scanner et tooling passent sur les mêmes octets.

## Dépendances tierces

Playwright 1.64.1, Axe 4.14.0, jsQR 1.4.0, TypeScript 5.9.3 et concurrently
10.0.6 ont leurs versions, intégrités et licences locales qualifiées. L'image
`nginx:1.31.8-alpine3.24-slim@sha256:f45171d36c76a8b2f5ef97108a3a8a2294248a6578a0a180edc2d78f7d2edc26`
est épinglée pour A-02. La reprise qualifie l'attestation SPDX de l'enfant
`linux/amd64` (26 paquets, 808 relations) et sa provenance SLSA. Docker Scout
signale brutement `CVE-2026-107891` sur `musl@1.2.6-r3` avec une borne
générique/edge `r6`; pour l'enfant exact, Alpine 3.24/main classe `r3` corrigé.
Le faux positif d'affectation par confusion de branche est démontré sans waiver
ni suppression du résultat brut. Les licences restent `NOASSERTION`, la
provenance `reproducible=false` et la production non qualifiée. Voir
[la revue tierce C3](../security/THIRD_PARTY_LICENSE_REVIEW_S1_2_03C3.md).

## Blockers constatés avant fermeture ciblée — instantané historique

1. Résoudre causalement le défaut Firefox Windows observé à
   `Browser.newPage()`, puis exécuter les trois smokes sur le même candidat.
2. Obtenir la validation visuelle explicite du Product Owner sur le manifeste
   exact des neuf captures ; loading/unavailable restent des états synthétiques.

## Verdict avant fermeture ciblée — instantané historique

Dans cet instantané, le verdict était **QUALIFICATION TECHNIQUE LOCALE
PARTIELLE — BLOCK GLOBAL.** A-02, les
garanties fonctionnelles, le graphe npm, l'image Nginx dans la portée du digest
exact, Chromium et WebKit sont qualifiés localement. Firefox n'a exécuté aucune
assertion de ses trois scénarios et reste NON-PASS avant navigation.
L'approbation visuelle Product Owner manque. Ces deux écarts ne sont pas
transformés en PASS par le wrapper Chromium/WebKit code 0 ni par le visual 1/1.

Fournisseurs, clés, certificats, infrastructure et Linux de production restent
NON QUALIFIÉS. Aucun déploiement ou publication n'est autorisé.

## Fermeture ciblée Firefox Windows — 2026-10-31

Cette section supersède uniquement le verdict courant Firefox ci-dessus ; les
NON-PASS `spawn UNKNOWN`, SideBySide et deux onglets restent archivés.

La sonde visible, sans application ni secret, a observé `about:blank` et
`https://www.mozilla.org/en-US/privacy/firefox/`. Le différentiel démontre que
`datareporting.policy.firstRunURL=''`, appliqué uniquement au profil Firefox de
campagne, supprime la cible de premier lancement. Aucune préférence de
télémétrie, Safe Browsing ou protection contre le pistage n'est désactivée.

Le cache personnel et le cache isolé contiennent 61 fichiers byte-identiques,
dont `firefox.exe` et `mozglue.dll`. Pourtant, le premier échoue headless avec
`SideBySide/33`, alors que le second lance une seule page `about:blank`. La
cause profonde de cette différence par chemin demeure **NON CONCLUSIVE**. Le
wrapper refuse donc tout fallback : il exige le cache isolé explicite,
Firefox 157/révision 1555, les empreintes attendues et le manifeste fermé.

| Contrôle                         | Résultat sélectionné                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Firefox public smoke             | 3/3 PASS, 10,5 s, un worker, zéro retry                                       |
| Identité cache                   | 61 fichiers ; révision, version, `firefox.exe` et `mozglue.dll` conformes     |
| Régressions harnais              | 27/27 PASS, dont fichier caché supplémentaire refusé                          |
| Tooling complet                  | 573/573 PASS                                                                  |
| Redaction et scan de secrets     | probe attendu vérifié ; 178 textes, 14 sentinelles, zéro violation            |
| Visual                           | code 0 ; neuf PNG inchangés, dont deux états synthétiques                     |
| Cleanup et ressources étrangères | code 0 ; inventaire `SEMANTIC_IDENTICAL` ; aucune ressource ciblée résiduelle |
| Wrapper ciblé                    | code 0, stderr vide                                                           |

Chromium 18/18 et WebKit 3/3 restent applicables au candidat : le raccordement
modifie uniquement le projet Firefox et le mode ciblé du wrapper, sans changer
les sources applicatives, le graphe npm ni les configurations des deux autres
moteurs. Les anciennes campagnes Firefox restent NON-PASS historiques.

## Verdict actualisé

**QUALIFICATION TECHNIQUE LOCALE — GO. FIREFOX WINDOWS — GO BORNÉ. BLOCK
VISUEL PRODUCT OWNER.** Les neuf captures ont été rendues consultables, mais
aucune approbation Product Owner n'est supposée. Elle ne pourra couvrir que les
états représentés ; `loading` et `unavailable` sont synthétiques et les
parcours absents demeurent hors portée.

Fournisseurs, clés, certificats, réseau et Linux de production restent NON
QUALIFIÉS. Le cache personnel Firefox Windows et la cause profonde de sa
divergence restent non qualifiés. Aucun git add, commit, push, PR, Ready, merge
ou déploiement n'est autorisé.

## Décision visuelle Product Owner — clôture bornée

Le Product Owner a approuvé les neuf captures de la planche SHA-256
`5485987f4da1be07a30234e91c0a065c61552b0ea0ea5ee713c168da1fd0cb11`,
associée au gel
`79cc6da1b1fd047c877e175ac8bcee8af5fd2707528bbec5099d2726a3c7c2fd`.
Cette décision couvre uniquement les états et viewports représentés.
`loading` et `unavailable` restent synthétiques ; les parcours absents et
les contrôles d'accessibilité non démontrés ne sont pas qualifiés. Le BLOCK
visuel précédent reste un état historique, désormais fermé dans cette portée.

## C3-PUB-SC-01 — remédiation minimatch

Le premier préflight de publication reste archivé comme BLOCK :
`npm audit` a identifié `GHSA-g3hv-75wg-m249` sur l'unique copie de
développement `minimatch@10.2.6`. Aucun commit, push ou PR C3 n'avait alors
été créé.

La correction sélectionnée remplace uniquement l'override racine par
`minimatch@11.0.1`. npm produit le nouveau lockfile, qui ajoute
`@isaacs/nonrecursive-glob-match@1.0.3` et conserve
`brace-expansion@5.0.12`. Le scanner vérifie exactement le singleton,
l'emplacement, les sept parents et leurs ranges, les URL, intégrités,
licences, moteurs et dépendances ; ses tests refusent absence, downgrade,
prerelease, doublon, mauvais emplacement, substitution et parent
supplémentaire.

| Gate SC-01                              | Résultat sélectionné                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Installation propre                     | code 0                                                                         |
| Chaîne minimatch et `npm ls --all`      | code 0 ; une copie 11.0.1 ; aucune copie affectée                              |
| Compatibilité fichiers/tests/exclusions | six workspaces et chemins Windows stables                                      |
| Régression d'amplification              | PASS borné                                                                     |
| Scanner ciblé et officiel               | code 0                                                                         |
| Tooling complet                         | 579/579 PASS                                                                   |
| Audits complet et production            | codes 0 ; zéro vulnérabilité                                                   |
| Signatures                              | 823 signatures ; 191 attestations                                              |
| Licences                                | 825 paquets ; 0 non déclaré ; 0 non approuvé                                   |
| Lint, typecheck, tests et build         | codes 0                                                                        |
| Build iOS                               | NON EXÉCUTÉ sur Windows                                                        |
| Artefacts npm 10 optionnels             | sept `extraneous` historiques ; aucun `invalid`, `ELSPROBLEMS` ou code non nul |

La compatibilité démontrée est celle des configurations ESLint KORA+ actives,
pas celle de toutes les options des plugins installés. Les branches dormantes
`import/no-internal-modules` avec `forbid` et
`react/jsx-pascal-case` avec `ignore` échouaient déjà avec 10.2.6 ; elles
restent interdites par garde jusqu'à qualification séparée.

Les preuves A-02, Nginx, Chromium 18/18, WebKit 3/3, Firefox 3/3, redaction,
secret scan, cleanup et visuel PO sont réutilisées : aucun fichier runtime,
configuration navigateur, image ou artefact concerné n'a changé. Aucune
nouvelle campagne Docker/navigateur ou exécution globale 24/24 n'est
revendiquée.

Verdict local SC-01 : **GO LOCAL FINAL BORNÉ**, sous réserve des trois revues
terminales sur le même gel. Publication, CI, intégration et production restent
distinctes.

## Correction du raccordement build C2a — 2026-10-31

La publication initiale C3 au head `e27ee24f6a5be39adedaf45e324c0e482c87675b`
a produit trois workflows concluants et le NON-PASS Infrastructure historique
`41221134116`. C1 et Foundations avaient terminé ; le wrapper métier C2a s'est
arrêté avant Vitest car le validateur invoquait directement le binaire absent
`node_modules/@nestjs/cli/bin/nest.js`. Ce résultat reste NON-PASS et n'est pas
réinterprété comme une défaillance métier C2a.

Le candidat local protège les scripts officiels de l'API et exécute, sous une
borne commune, Prisma `generate`, le nettoyage exact de `apps/api/dist`, puis
`tsc -p tsconfig.build.json`. Il exige quatre entrées fraîches avant de pouvoir
lancer Vitest et refuse les cinq hooks npm implicites qu'il ne réimplémente
pas. Le wrapper PowerShell est restauré byte-à-byte à sa version publiée : le
run historique prouve qu'il lançait déjà le validateur, donc ce delta non causal
n'est pas conservé.

| Contrôle                                          | Résultat sélectionné                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Régressions comportementales du raccordement      | 13/13 PASS                                                                                                                                                               |
| Tooling, première tentative                       | 591/592 NON-PASS ; timeout du test socket historique, conservé                                                                                                           |
| Test socket isolé puis reprise causale du tooling | 1/1 PASS puis 592/592 PASS                                                                                                                                               |
| Format officiel, scanner et diff-check            | PASS                                                                                                                                                                     |
| Wrapper métier C2a réel                           | 1 contrôle statique + 11 scénarios réels PASS                                                                                                                            |
| Non-régression C1 associée                        | 47/47 PASS                                                                                                                                                               |
| Inventaire Docker étranger                        | IDs, labels et montages préservés ; deux comparateurs bruts NON-PASS sur l'ordre des labels réseau et des trois montages Redis, puis comparaison normalisée stricte PASS |
| Audits npm complet et production                  | codes 0 ; zéro vulnérabilité                                                                                                                                             |

Le candidat ne modifie ni runtime C3, dépendances, lockfile, workflow,
configuration navigateur, image ni artefact visuel. Les preuves C3 et
l'approbation Product Owner bornée aux neuf captures restent applicables ;
aucune nouvelle exécution navigateur globale ou `24/24` n'est revendiquée.
Le signal Windows, les parcours visuels absents, les fournisseurs et Linux de
production, les SKIP historiques et la politique OSS conservent leur portée.

Verdict de ce delta : **GO LOCAL CONDITIONNEL AU GEL COMMUN ET AUX TROIS
CONTRE-REVUES**. Le commit, le push, les nouveaux workflows, l'actualisation du
corps PR, l'intégration et la production ne sont pas encore acquis à cet
instantané.

## Résolution des exécutables et qualification du runner Linux — 2026-11-02

Le run Infrastructure `41246330316` du head publié
`67ecc3d4e6c57ded3f7134b93b78ea30ca32c8d4` reste NON-PASS historique. La
sonde Linux sans application ni secret observe deux résultats pour OpenSSL et
deux pour `chmod`; l'ancienne expression `.Source` produit alors une
collection. Cette reproduction ne permet pas d'affirmer le type ni la
cardinalité exacts du runner GitHub historique, qui restent NON CONCLUSIVE.

Le correctif introduit une résolution unique pour OpenSSL, Docker, npm et
l'outil de permissions. Chaque sélection est un `ApplicationInfo`, son chemin
est scalaire, absolu et un fichier existant, et le premier candidat de l'ordre
PowerShell est choisi explicitement. Toutes les résolutions sont terminées
avant création du répertoire de preuves, des secrets ou de ressources Docker.

| Contrôle du candidat runner                            | Résultat sélectionné                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Syntaxe et régressions Windows                         | 31/31 PASS                                                                                                   |
| Régressions Linux                                      | 31/31 PASS                                                                                                   |
| Chemins multiples, espaces, absence et valeur invalide | PASS ; sélection scalaire et absolue                                                                         |
| Erreur d'un outil                                      | code non nul conservé                                                                                        |
| Permissions réelles                                    | ACL Windows protégées ; répertoires POSIX `0700`, fichier `0600`                                             |
| Campagne Linux exacte                                  | Chromium 18/18, Firefox 3/3, WebKit 3/3 ; 24/24 PASS                                                         |
| Redaction et secrets                                   | probe attendu, 174 textes et 196 sentinelles, zéro violation                                                 |
| Cleanup et inventaires                                 | compose down code 0 ; projet et parent absents ; conteneurs, volumes, réseaux et images étrangers identiques |
| Format, scanner, audits et diff-check                  | PASS ; audits complet/production zéro                                                                        |
| Tooling agrégé non borné                               | 585/592 puis 590/592 NON-PASS à 14 threads ; deadlines PostgreSQL de 100 ms                                  |
| Diagnostic ciblé et reprise reproductible              | fichier concerné 67/67 ; gate officiel 592/592 avec `availableParallelism=2`, sans changer oracle ni timeout |

La première campagne Linux exacte reste NON-PASS avec 13 tests réussis, 1 en
échec et 10 non exécutés. Les campagnes diagnostiques suivantes et leurs
erreurs 503 restent archivées ; leur cause historique exacte demeure NON
CONCLUSIVE. La campagne terminale utilise le test navigateur original exact,
un worker, zéro retry, et termine dans sa borne avec cleanup conforme.

La campagne complète porte le runner final et le test navigateur exact. Elle
a empreinté la préimage pré-format du test du runner, qu'elle n'importe ni
n'exécute ; les octets finaux de ce test sont qualifiés séparément par 31/31
sous Windows et 31/31 sous Linux. La fixture imbriquée emploie un proxy TCP
opaque hors dépôt entre le loopback du conteneur et `host.docker.internal`.
Il ne termine pas TLS et ne modifie pas les assertions, mais il ne reproduit
pas byte-à-byte la topologie du futur runner GitHub.

Le résultat qualifie localement le runner dans un conteneur Linux sur Docker
Desktop. Il ne qualifie pas Linux de production, une future exécution GitHub,
les fournisseurs ou les parcours visuels absents. Le candidat demeure non
indexé et non publié jusqu'au gel commun et aux trois conclusions terminales.

## Diagnostic fermé de la campagne navigateur — 2026-11-02

Le run Infrastructure `41439908216` du head publié
`c820becf72e5f2d1fcd9a273282dd1048e368e10` demeure un NON-PASS historique.
Les preuves CI localisent l'échec dans la campagne principale
`playwright-c3-secret`, et non dans la sonde de redaction dont le code non nul
est attendu. Elles ne permettent toutefois pas d'identifier le premier
scénario en défaut sans exposer des sorties libres : la cause historique reste
donc NON CONCLUSIVE.

Le candidat ajoute un reporter minimal activé uniquement par un chemin privé
explicite. Il ne produit que la phase, le moteur, l'identifiant prédéfini du
scénario, le statut et huit compteurs. Le runner valide et reconstruit le JSON
canonique avant publication ; titres, exceptions, URL, headers, stdout/stderr,
traces et captures ne sont jamais sérialisés. Un résumé absent, tronqué,
incohérent ou enrichi devient un statut générique `INVALID`, sans pouvoir
transformer un code non nul en succès.

| Contrôle du diagnostic navigateur                   | Résultat sélectionné                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Syntaxe et format des quatre entrées                | PASS                                                                                                  |
| Régressions fermées Windows                         | 34/34 PASS                                                                                            |
| Régressions fermées Linux                           | 34/34 PASS                                                                                            |
| Sentinelles dans titre, erreur, stack et stdout     | aucune sentinelle sérialisée                                                                          |
| Aucun événement / aucun test / exécution incomplète | statuts fermés distincts                                                                              |
| Campagne Linux informative unique                   | Chromium 18/18, Firefox 3/3, WebKit 3/3 ; 24/24 PASS                                                  |
| Résumé public terminal                              | six clés canoniques, dernier scénario WebKit, compteurs 24/24 cohérents                               |
| Redaction, secrets, cleanup et inventaire étranger  | probe attendu, zéro violation, cleanup code 0, `SEMANTIC_IDENTICAL`                                   |
| Gates prépublication du gel diagnostic              | tooling 592/592 ; scanner 527 ; format, documents et diff-check PASS ; audits complet/production zéro |

La campagne locale reprend le mode `Complete`, un worker, zéro retry, les
versions Playwright 1.64.1 et navigateurs qualifiées, ainsi que l'ordre exact
Chromium, Firefox, WebKit. Elle utilise la fixture Linux imbriquée et son proxy
TCP opaque déjà documenté ; elle ne reproduit donc pas la topologie du runner
GitHub. Le défaut n'ayant pas été reproduit localement, la seule voie retenue
est un commit diagnostique conditionnel. Une future CI verte qualifierait son
propre SHA dans les étapes exécutées sans expliquer rétroactivement le run
historique.
