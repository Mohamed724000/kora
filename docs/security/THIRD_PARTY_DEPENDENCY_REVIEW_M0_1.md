# KORA+ — Revue des dépendances M0.1

Date : 2026-08-13
Lot : M0.1 — Dependency Governance
Base : `c080ec0529e758203d4326f7ec5b0b0159cbdad7`

## Décisions sur les PR Dependabot

| PR  | Proposition                         | Décision M0.1 | Motif                                                                                     |
| --- | ----------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| #7  | `apexcharts` 4.7.0 → 6.8.0          | Refusée       | Major hors lot ; 4.7.0 reste verrouillée et une migration exige une autorisation dédiée.  |
| #8  | `typescript-eslint` 8.65.0 → 8.66.0 | Refusée       | 8.65.0 reste verrouillée ; Quality Linux était en échec sur la PR.                        |
| #9  | `@types/react` 19.2.17 → 19.2.18    | Réappliquée   | Patch sûr, réappliqué exactement dans Admin, Web et UI avec un lockfile cohérent.         |
| #10 | `@nestjs/common` 11.1.28 → 11.1.29  | Refusée       | Mise à jour isolée de la famille NestJS interdite ; trois gates étaient en échec.         |
| #11 | `flutter_riverpod` 3.4.1 → 3.4.2    | Réappliquée   | Patch sûr ; `flutter_riverpod` et sa transitive `riverpod` passent ensemble à 3.4.2.      |
| #12 | `bullmq` 5.81.2 → 6.0.9             | Refusée       | Major hors lot ; 5.81.2 reste verrouillée et une migration exige une autorisation dédiée. |

Les six PR ont été fermées sans fusion avec un commentaire de traçabilité
spécifique. Aucune branche distante Dependabot n'a été supprimée manuellement.

## Gouvernance des pins npm

La PR #9 a démontré une divergence : les trois manifestes proposaient
`@types/react: 19.2.18`, tandis que les métadonnées workspace générées dans
`package-lock.json` contenaient `^19.2.18`. Le scanner exige désormais :

- une version SemVer exacte pour toute dépendance directe externe ;
- une égalité byte-for-byte entre chaque section directe d'un `package.json`
  et la section correspondante du workspace dans `package-lock.json` ;
- l'absence d'entrée directe obsolète dans le lockfile.

Les sections contrôlées sont `dependencies`, `devDependencies`,
`optionalDependencies` et `peerDependencies`.

### Correction M0.1-R1 — singleton `@types/react`

Le lockfile initial de M0.1 conservait `@types/react@19.2.17` à la racine et
installait `19.2.18` séparément sous Admin, Web et UI. Les inspections
`npm dedupe --dry-run` et `npm find-dupes` avec npm 10.9.3 identifiaient bien
la déduplication, mais proposaient aussi des changements transitifs et des
ajouts optionnels de plateforme hors périmètre ; leur application directe a
donc été refusée.

La procédure déterministe a été vérifiée dans une copie temporaire complète :
pin racine temporaire exact à `19.2.18`, régénération `package-lock-only` avec
préférence de déduplication, retrait du pin temporaire, puis seconde
régénération. Son diff utile a été reporté sans modifier `package.json` :

- une seule installation physique, `node_modules/@types/react@19.2.18` ;
- aucune installation imbriquée sous Admin, Web ou UI ;
- les trois pins directs et leurs métadonnées workspace restent `19.2.18` ;
- aucune autre version ou topologie du graphe npm n'est modifiée.

Le scanner applique cette règle uniquement à `@types/react`. Il dérive la
version attendue des pins directs des workspaces, exige leur unanimité exacte,
puis vérifie l'unicité physique à la racine et sa version résolue. Les
duplications transitives légitimes des autres packages restent autorisées.

## Politique Dependabot

Les version updates npm et Pub restent actives uniquement pour les dépendances
déclarées dans les manifestes et les niveaux patch/minor. Le filtre utilise
`dependency-name: "*"` afin de ne retrancher aucune dépendance de la sélection
de sécurité. D'après la documentation GitHub, `allow.update-types` ne
s'applique pas aux security updates : celles-ci ne sont donc ni désactivées ni
masquées.

`versioning-strategy: increase` n'est pas activé. GitHub le définit comme une
augmentation de la version minimale et non comme une garantie de conservation
byte-for-byte des pins ; la PR #9 prouve qu'une spécification de lock peut
encore devenir une plage. Le scanner du dépôt reste donc le gate bloquant.

Aucune fusion automatique n'est configurée. Toute major exige un lot de
migration explicitement autorisé.

Référence : [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

## Licences et supply-chain

- `@types/react@19.2.18` : MIT, registre npm officiel ; aucun script
  d'installation ajouté.
- `flutter_riverpod@3.4.2` et `riverpod@3.4.2` : MIT, source Pub officielle ;
  aucun changement de source.
- Aucune nouvelle dépendance directe n'est introduite.
- Les audits, l'inventaire de licences, les sources, les scripts
  d'installation et les lockfiles sont des gates de sortie du lot.

S0.6 et Slice 1 ne sont pas commencés.

## Erratum postérieur M0.2

La configuration M0.1 décrivait l'intention « dépendances directes » sans
inscrire `dependency-type: direct` dans les deux règles `allow`. La PR
Dependabot #14 a ensuite proposé une mise à jour transitive lockfile-only et a
révélé cet écart d'application. L'historique M0.1 reste inchangé ; la correction
et ses preuves sont consignées dans la
[revue supply-chain M0.2](THIRD_PARTY_DEPENDENCY_REVIEW_M0_2.md).
