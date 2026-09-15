# S1.2-02 — Rapport de validation de la baseline PostgreSQL canonique

Date : 2026-09-15
Statut : **INSTANTANÉ TECHNIQUE PRÉPUBLICATION DU 2026-09-15 — VALIDÉ**

## Verdict

Le schéma Prisma canonique complet de 33 modèles est matérialisé dans deux
migrations PostgreSQL versionnées : une baseline générée par Prisma 7.9.1 et
une couche SQL explicite pour les invariants que Prisma ne sait pas exprimer
seul. Aucun endpoint, contrôleur, service, worker, seed, média, runtime métier
ou infrastructure de production n’a été créé. S1.2-03 n’est pas démarré.

## Préflight Git exécuté avant modification

| Invariant                              | Résultat                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Workspace actif                        | PASS — `C:\Users\moham\Music\KORA-PLUS-S1-2-02`                                            |
| Branche                                | PASS — `feat/s1-2-02-postgresql-baseline`                                                  |
| `HEAD`                                 | PASS — `dfb6445cb157b03142b7f1b01952fa76fdef16f9`                                          |
| arbre Git                              | PASS — `d1ae7cc32799b6efba3541388ba00fbb01c1f538`                                          |
| `origin/main`                          | PASS — même SHA que `HEAD`                                                                 |
| worktree, index et fichiers non suivis | PASS — propres, index vide, aucun non-suivi                                                |
| opération Git active                   | PASS — aucune                                                                              |
| worktree S1.2-01                       | PASS — préservé, propre, branche `feat/s1-2-contract-data-readiness-gate`, HEAD `b9b86cc…` |

Le bootstrap n’a pas été rejoué. Aucun worktree ou branche n’a été créé,
réinitialisé, restauré ou rebasé.

## Livrables

Inventaire exact des quatorze fichiers candidats :

1. `apps/api/README.md` ;
2. `apps/api/prisma/schema.prisma` ;
3. `apps/api/prisma/migrations/migration_lock.toml` ;
4. `apps/api/prisma/migrations/20260914000000_canonical_postgresql_baseline/migration.sql` ;
5. `apps/api/prisma/migrations/20260914000100_canonical_sql_constraints/migration.sql` ;
6. `apps/api/prisma/run-baseline-validation.ps1` ;
7. `apps/api/prisma/validate-baseline.mjs` ;
8. `docs/architecture/SLICE_1_2_02_POSTGRESQL_BASELINE.md` ;
9. `docs/governance/DECISION_LOG.md` ;
10. `docs/governance/SOURCE_OF_TRUTH.md` ;
11. `docs/qa/REQUIREMENTS_TRACEABILITY_MATRIX.md` ;
12. `docs/qa/SLICE_1_2_02_POSTGRESQL_BASELINE_REPORT.md` ;
13. `docs/roadmap/MVP_EXECUTION_PLAN.md` ;
14. `docs/security/THREAT_MODEL.md`.

Le wrapper PowerShell crée l’environnement éphémère exact. Le validateur
reproduit la baseline, applique les migrations sur deux bases isolées, compare
les structures et vérifie chaque cause de rejet. Le document d’architecture
classe les garanties SQL, transactionnelles futures et runtime futures ; les
documents vivants sont réconciliés sans déclarer le runtime opérationnel.

Aucun manifeste, lockfile ou workflow n’est modifié et aucune dépendance n’est
ajoutée.

## Garanties réellement matérialisées

La migration SQL apporte notamment :

- publication initialement active, active unique et contrôle différé des deux
  médias `READY` avec versions, SHA-256 et chronologie de vérification exacts ;
- provenance administrateur de l’artiste, du contenu et de la publication
  immuable ;
- références fournisseur de paiement et média uniques, cohérentes avec le
  fournisseur et non réattribuables ;
- comptes et lignes financières, audits, historiques d’état et liens de
  publication append-only ; code de récupération et marqueurs Inbox, Outbox,
  Entitlement et archivage attribuables une seule fois et chronologiquement
  bornés ;
- relations composites de même client, contenu, commande, règlement, artiste,
  administrateur/session et fournisseur ;
- bornes de montants, quantités, points de base, durées, séquences et clés ;
- historique initial obligatoire, transitions et états terminaux des commandes,
  paiements, médias et Inbox ; lignes Order closes dès le premier état ;
- total de commande, règlement lié au dernier événement `SUCCEEDED` et au
  dernier état Order `SETTLED`, ledger non vide et équilibré, revenu brut lié à
  la ligne tarifée, somme des bases gelées liée au Settlement, arithmétique
  artiste entière et conservation du carry.

Les assertions multi-lignes nécessaires au même commit sont des constraint
triggers `DEFERRABLE INITIALLY DEFERRED`.

## Frontières non livrées

La base protège les invariants SQL énumérés, mais S1.2-02 ne livre pas les
transactions applicatives qui doivent créer atomiquement règlement, ledger,
revenus artiste, droits et Outbox, ni celles qui lient une mutation
administrateur à son audit, une republication ou la rotation des sessions. La
génération atomique des dix codes de récupération lors de l’enrôlement TOTP
reste aussi future, même si chaque hash et sa consommation sont désormais
immuables en SQL.

Le SQL réévalue l’équilibre du ledger à chaque commit, mais le modèle canonique
n’a pas d’état de clôture permettant de distinguer une paire débit/crédit
équilibrée ajoutée tardivement. Le futur service et son rôle d’écriture devront
donc créer chaque groupe et toutes ses lignes une seule fois, et réserver toute
correction à un nouveau groupe compensatoire. La même restriction d’écriture
doit empêcher l’ajout tardif d’un earning nul à un agrégat artiste déjà validé.

Authentification et RBAC runtime, OTP/TOTP, HMAC et limite du corps webhook,
KMS, fournisseurs de paiement, Mux, R2, sérialisation publique, endpoints,
workers, descripteurs signés et données de production restent réservés à des
lots runtime ultérieurs. Aucun rôle PostgreSQL applicatif n’est créé dans ce
lot. Les triggers protègent les rôles ordinaires, pas un superuser/propriétaire
capable de DDL, de désactivation ou de `TRUNCATE`; le moindre privilège runtime
reste donc obligatoire.

## Preuve PostgreSQL isolée

La validation utilise l’image PostgreSQL 18.4 verrouillée par le dépôt,
`postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15`,
dans un conteneur dédié avec stockage `tmpfs`, port loopback aléatoire et secret
éphémère non journalisé. Le validateur refuse un hôte non local et exige le
marqueur explicite `S1202_EPHEMERAL_POSTGRES=1`. La commande rejouable depuis la
racine est :

```powershell
powershell -NoProfile -File apps/api/prisma/run-baseline-validation.ps1
```

| Contrôle                                   | Résultat                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| génération baseline depuis `schema.prisma` | PASS — comparaison byte-for-byte                                                          |
| SHA-256 baseline                           | `37e97b5bb370447fdfa6cc856c44d8d25dd518b43879ff8cd04c951ad062c6f6`                        |
| taille baseline                            | 39 513 octets                                                                             |
| SHA-256 contraintes SQL                    | `e316e5fcf0b452c003074ba7e6cf60a07384b68fb2d904cfd387cac54919ffb2`                        |
| taille contraintes SQL                     | 49 168 octets                                                                             |
| image/digest, tmpfs et loopback            | PASS — attestés par le wrapper versionné                                                  |
| version serveur                            | PASS — PostgreSQL 18.4                                                                    |
| première base vide                         | PASS — 2 migrations appliquées                                                            |
| seconde passe sur la première base         | PASS — aucune migration en attente                                                        |
| deuxième base vide indépendante            | PASS — 2 migrations appliquées                                                            |
| seconde passe sur la deuxième base         | PASS — aucune migration en attente                                                        |
| comparaison Prisma/base                    | PASS — aucune dérive table, colonne ou enum ; extensions PostgreSQL attendues présentes   |
| inventaire par base                        | PASS — 33 tables, 54 FK, 133 index, 47 `CHECK`, 33 fonctions, 45 triggers                 |
| fixtures positives                         | PASS — fixture complète et scénario causal de réouverture financière                      |
| archivage positif                          | PASS                                                                                      |
| cas négatifs causaux                       | PASS — 63/63, contrainte ou message exact et SQLSTATE attendu                             |
| signature structurelle des deux bases      | PASS — `bdfbbec06bf721c1d9e47df8e2dbf004a1f4db0cc695cb1e4370160081c52fe6`                 |
| nettoyage                                  | PASS — seules les deux bases nommées par ce run puis le conteneur dédié ont été supprimés |

Une première relance finale a été arrêtée avant toute création parce qu’un
ancien digest d’image saisi dans la commande n’était plus résolu. La commande a
été corrigée vers le digest verrouillé dans `infra/compose.yaml`; aucun objet
PostgreSQL ou conteneur n’avait été créé par la tentative échouée.

Pendant le durcissement du chemin d’échec, un premier contrôle d’existence
incompatible avec Windows PowerShell s’est arrêté avant toute création. Une
seconde tentative a créé le conteneur dédié puis échoué sur le formatage du
contrôle de label ; son nom exact et son label S1.2-02 ont été inspectés, puis ce
seul conteneur a été supprimé explicitement. Le wrapper final utilise des
filtres Docker exacts de nom et de label, arme le nettoyage dès que l’objet est
détecté et son exécution complète suivante a supprimé automatiquement ses deux
bases et son conteneur.

## Validation applicative et supply chain

| Contrôle                                       | Résultat                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `prisma format`                                | PASS — Prisma 7.9.1                                                       |
| `prisma validate`                              | PASS — schéma valide                                                      |
| `prisma generate`                              | PASS — client généré                                                      |
| `npm.cmd run openapi:validate`                 | PASS — 34 chemins, 87 schémas, 18 invariants, 33 modèles                  |
| `npm.cmd run ci:validate`                      | PASS — 4 workflows et 4 actions épinglées                                 |
| `npm.cmd run test:tooling`                     | PASS — 296/296                                                            |
| `npm.cmd run format`                           | PASS — tous workspaces et Flutter                                         |
| `npm.cmd run lint`                             | PASS — aucun finding                                                      |
| `npm.cmd run typecheck`                        | PASS                                                                      |
| `npm.cmd run test`                             | PASS — 82/82 tests applicatifs                                            |
| `npm.cmd run build`                            | PASS — Web, Admin, API, packages et APK Flutter debug                     |
| build iOS                                      | NON EXÉCUTÉ — hôte Windows sans Xcode ; aucune release iOS n’est produite |
| `npm.cmd audit --audit-level=high`             | PASS — 0 vulnérabilité                                                    |
| `npm.cmd audit --omit=dev --audit-level=high`  | PASS — 0 vulnérabilité de production                                      |
| `npm.cmd run licenses`                         | PASS — 1 131 paquets, 0 licence non déclarée, 0 non approuvée             |
| scanner officiel sur index candidat temporaire | PASS — 344 fichiers, historique inclus ; index réel inchangé              |
| `git diff --check`                             | PASS — code 0                                                             |

Toutes les commandes marquées `PASS`, y compris le wrapper PostgreSQL et le
scanner officiel sur l’index candidat temporaire, se sont terminées avec le
code de sortie `0`.

`npm.cmd ls --all` retourne le code 0. Il affiche sept paquets WASM optionnels
comme `extraneous` dans l’installation locale issue de `npm ci --ignore-scripts`;
aucun manifeste ou lockfile n’a été modifié et les deux audits ainsi que le gate
de licences restent verts.

Le build Admin émet seulement l’avertissement historique de sourcemap
`adminlte.css.map`. Flutter émet l’avertissement déjà documenté de migration
future Kotlin/`sentry_flutter`. Ces avertissements ne masquent aucun échec.

## Revues indépendantes finales en lecture seule

Les premières lectures indépendantes ont toutes été strictement read-only. Les
revues architecture/données et sécurité/intégrité ont émis un NO-GO fondé sur
les sources financières non rapprochées, des marqueurs Inbox réinscriptibles,
le compte ledger mutable, la cohérence Order/Settlement, le format SHA-256 et
la causalité trop large des négatifs. La revue gouvernance/reproductibilité a
demandé le wrapper rejouable, l’inventaire exact et la consignation des gates.

Ces findings ont conduit aux corrections SQL, aux 63 attentes causales, au
wrapper versionné et à la présente réconciliation. Un finding majeur commun aux
contre-revues architecture et sécurité — absence de réévaluation de la base
Settlement après un `ArtistEarning` tardif à taux nul — a ensuite été fermé par
un constraint trigger dédié et un test causal. Le finding mineur du wrapper sur
le nettoyage après création partiellement échouée a également été fermé. Les
verdicts indépendants définitifs, rendus après le run PostgreSQL et la
réconciliation documentaire, sont :

- architecture/données : **GO — aucun finding résiduel fondé** ;
- sécurité/intégrité : **GO — aucun finding résiduel fondé** ;
- gouvernance/reproductibilité : **GO — aucun finding résiduel fondé**.

## Instantané historique prépublication du 2026-09-15

À cet instant précis, aucun commit, push, remote, tag, release, hook, identité
Git ou changement GitHub n’avait été effectué par S1.2-02. Le contrôle
prépublication confirmait l’index vide, l’absence d’opération Git active, la
branche et les SHA de référence inchangés, le worktree S1.2-01 propre et
préservé, et l’absence de conteneur de validation S1.2-02 résiduel. Les bases
éphémères `kora_s1202_*`, hébergées uniquement dans le `tmpfs` de ce conteneur
dédié, avaient été supprimées avant sa suppression. Tout état de publication
ultérieur fait foi dans l’historique Git, la Draft PR et ses workflows.

Verdict historique de cet instantané :

**S1.2-02 CANONICAL POSTGRESQL BASELINE AND SQL CONSTRAINTS VALIDATED LOCALLY —
READY FOR CTO COMMIT DECISION — NO ENDPOINT OR RUNTIME STARTED — S1.2-03 NOT
STARTED**
