# Remédiation sécurité npm — Sprint 0.3

Date de qualification : 2026-07-29
Branche : `chore/s0-3-application-foundations`
Périmètre : dépendances npm verrouillées dans `package-lock.json`

Ce document consigne la qualification technique de la remédiation autorisée.
Il ne remplace ni une revue juridique ni le verdict indépendant
Security/Supply Chain.

## État initial

Les deux audits ont été exécutés en ligne contre le registre npm officiel,
avant toute remédiation.

| Commande | Total | Modérées | Élevées | Critiques |
|---|---:|---:|---:|---:|
| `npm.cmd audit --json` | 33 | 1 | 32 | 0 |
| `npm.cmd audit --omit=dev --json` | 4 | 1 | 3 | 0 |

Les nombres représentent les paquets signalés par npm. Cinq avis racines
expliquent les chaînes affectées.

## Qualification des avis

| Avis | Paquet initial | Sévérité | Chemin et surface KORA+ | Exploitabilité dans S0.3 | Décision |
|---|---|---|---|---|---|
| `GHSA-qx2v-qp2m-jg93` / `CVE-2026-41305` | `postcss@8.4.31` | Modérée | `apps/web` et `apps/admin` → `next@16.2.12` → `postcss`; chaîne de build et rendu CSS | Les shells S0.3 n'acceptent pas de CSS utilisateur. La dépendance reste cependant présente dans la surface de production Next et l'avis impose une correction. | Override exact vers `postcss@8.5.24`, version corrigée. |
| `GHSA-6g55-p6wh-862q` / `CVE-2026-45623` | `postcss@8.4.31` | Élevée | Même chaîne Next/PostCSS; lecture de fichier via un `sourceMappingURL` contrôlé | Aucun flux de CSS non fiable n'est implémenté en S0.3, mais le défaut pourrait exposer des fichiers du processus si un tel flux était ajouté. Aucune exception acceptée. | Override exact vers `postcss@8.5.24`. |
| `GHSA-r28c-9q8g-f849` | `postcss@8.4.31` | Élevée | Même chaîne Next/PostCSS; traversée de chemin lors du chargement d'une source map | Non atteignable par les écrans statiques actuels, mais présent dans le graphe de production. Aucune exception acceptée. | Override exact vers `postcss@8.5.24`. |
| `GHSA-f88m-g3jw-g9cj` / `CVE-2026-33327`, `CVE-2026-33328`, `CVE-2026-35590`, `CVE-2026-35591` | `sharp@0.34.5` | Élevée | `next@16.2.12` → dépendance optionnelle `sharp`; traitement d'images serveur/libvips | Aucun appel explicite à `next/image` et aucun upload d'image n'existent en S0.3. La dépendance optionnelle peut néanmoins être installée en production. | Override exact vers `sharp@0.35.3`, version corrigée. |
| `GHSA-mh99-v99m-4gvg` / `CVE-2026-14257` | `brace-expansion` via `minimatch` | Élevée | Outillage de développement : ESLint, Nest CLI, Jest et ts-jest; expansion non bornée et épuisement mémoire | Hors runtime produit, mais atteignable par des entrées de tooling contrôlées et présent dans l'audit complet. Aucune exception CTO nécessaire après correction. | Overrides exacts vers `minimatch@10.2.6` et `brace-expansion@5.0.8`. |

`next@16.2.12`, Jest et Nest CLI étaient les dernières versions stables
compatibles disponibles au moment de la remédiation. Les overrides transitifs
évitent un changement de stack et sont couverts par les régressions du dépôt.

## Compatibilité et risque de changement cassant

- `postcss` et `sharp` restent dans leur version majeure ; aucun import direct
  KORA+ ne dépend de leurs API.
- `minimatch` et `brace-expansion` franchissent des versions majeures, mais
  restent transitifs et ne sont appelés par aucun code KORA+. Le risque porte
  sur ESLint, Nest CLI, Jest/ts-jest et leurs globs ; format, lint, typecheck,
  tests et builds complets constituent donc le gate obligatoire.
- Aucun changement de stack, de contrat produit ou de dépendance directe n'est
  introduit.

## Méthode de remédiation

Les quatre versions corrigées sont imposées dans `package.json`, puis le
lockfile a été régénéré par une mise à jour ciblée :

```text
npm.cmd update postcss sharp minimatch brace-expansion --ignore-scripts --force
```

`npm audit fix` n'a jamais été exécuté. Aucun secret, DSN ou registre privé
n'a été utilisé.

## État après remédiation

| Contrôle | Résultat |
|---|---|
| `npm.cmd ls --all` | code 0 ; 0 problem, invalid, extraneous ou unmet |
| `npm.cmd audit --json` | code 0 ; 0 vulnérabilité |
| `npm.cmd audit --omit=dev --json` | code 0 ; 0 vulnérabilité |
| Exceptions CTO de développement | aucune |

Les versions effectivement résolues sont `postcss@8.5.24`,
`sharp@0.35.3`, `minimatch@10.2.6` et `brace-expansion@5.0.8`.
Les audits seront rejoués après les régressions avant tout verdict de
publication.
