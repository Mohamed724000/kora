# KORA+ — Revue supply-chain M0.3 à R5

Date initiale : 2026-08-20
Réconciliation documentaire R4 : 2026-09-03
Réconciliation documentaire R5 : 2026-09-04
Lot : M0.3 — remédiations `deepmerge-ts`, `mysql2`, `fast-uri` et `qs`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`
Head publié de référence lors du contrôle local R5 (M0.3-R4) :
`205a4c2264cc99c065da81799ecfcc7f433e24d0`

## Chronologie

- M0.3 corrige `deepmerge-ts` sous `@prisma/config@7.9.1` ;
- R1 durcit le parcours et les tests du scanner ;
- R2 corrige le premier avis `mysql2` sans changer Prisma ;
- R3 publie la réconciliation des quatre documents vivants ;
- R4 remédie les avis `fast-uri`, `mysql2` et `qs` révélés par Security #44,
  puis est publié avec quatre workflows #45 verts ;
- au contrôle local prépublication du 2026-09-04, R5 corrige l’exclusivité du
  parent de lock `deepmerge-ts` et réconcilie les preuves publiées R4 ; les
  métadonnées de publication font foi dans GitHub.

## Apparition du blocage

Les validations S1.1 ont été suspendues quand les audits npm complet et
production ont commencé à signaler `GHSA-ggr8-5vv4-36mx` / `CVE-2026-40345`.
La chaîne résolue sur la baseline était :

```text
prisma@7.9.1
└─ @prisma/config@7.9.1
   └─ deepmerge-ts@7.1.5
```

L’avis GitHub, publié le 2026-08-17, classe la vulnérabilité haute et couvre
`deepmerge-ts < 8.0.0`. Elle permet un épuisement de pile lors de la fusion de
graphes récursifs. La première version corrigée déclarée est `8.0.0`.

Référence primaire :
[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

Après la publication de M0.3-R1, une nouvelle alerte transitive haute a été
attribuée à l’unique chaîne suivante :

```text
prisma@7.9.1
└─ mysql2@3.15.3
```

L’avis `GHSA-3f6p-5ww8-9rcr`, de sévérité haute, couvre `mysql2 < 3.22.0`.
Un serveur MySQL malveillant ou un intermédiaire réseau peut demander le
plugin `mysql_clear_password` et obtenir des identifiants en clair lorsque la
connexion n’est pas protégée par TLS. La première version corrigée déclarée
est `3.22.0`.

Référence primaire :
[GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr).

La décision CTO M0.3-R2 a imposé la correction minimale
`prisma@7.9.1 > mysql2@3.22.0`, sans modifier Prisma ni remplacer cette
solution par une montée majeure.

## Avis révélés par Security #44

Le 2026-09-03, l’audit complet du workflow Security #44 sur le head R3 a
signalé exactement 11 nœuds : 7 high et 4 moderate. L’audit JSON reproductible
les ramène à sept avis uniques touchant trois installations physiques :

| Paquet résolu    | Avis                  | Sévérité | Plage affectée      | Première version corrigée retenue |
| ---------------- | --------------------- | -------- | ------------------- | --------------------------------- |
| `fast-uri@3.1.5` | `GHSA-5jgf-p345-68v8` | high     | `>=3.1.3 <3.1.6`    | `3.1.6`                           |
| `fast-uri@3.1.5` | `GHSA-f65p-4m7j-42xc` | high     | `>=3.0.0 <3.1.6`    | `3.1.6`                           |
| `fast-uri@3.1.5` | `GHSA-fph4-wmhf-6fwf` | high     | `>=3.1.2 <3.1.6`    | `3.1.6`                           |
| `fast-uri@3.1.5` | `GHSA-jqff-g426-hqxp` | high     | `>=3.0.0 <3.1.6`    | `3.1.6`                           |
| `mysql2@3.22.0`  | `GHSA-rgwj-5xj2-c3m3` | moderate | `<=3.23.0`          | `3.23.1`                          |
| `qs@6.15.3`      | `GHSA-x5fp-wj9c-mxmx` | moderate | `>=6.14.2 <=6.15.3` | `6.16.0`                          |
| `qs@6.15.3`      | `GHSA-4mjr-xmp4-gh2g` | moderate | `>=2.2.5 <6.16.0`   | `6.16.0`                          |

Références primaires :
[GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8),
[GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc),
[GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf),
[GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp),
[GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3),
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) et
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

Les chemins immédiats verrouillés avant R4 sont :

```text
ajv@8.18.0 → fast-uri@3.1.5
prisma@7.9.1 → mysql2@3.22.0
body-parser@2.3.0 → qs@6.15.3
express@5.2.1 → qs@6.15.3
superagent@10.3.0 → qs@6.15.3
```

`fast-uri` est une unique installation `devOptional`, partagée par la chaîne
de développement Nest (`@nestjs/cli`) et la chaîne Prisma optionnelle
(`@prisma/dev > @prisma/streams-local > ajv`). `mysql2` est également marqué
`devOptional` sous Prisma et reste visible par l’audit production via le pair
optionnel de `@prisma/client`. `qs` est de production via Express/body-parser
et de développement via `supertest > superagent`. Les audits complet et
production avant correction contiennent respectivement 11 et 6 nœuds de
propagation ; les deux reposent sur les mêmes sept avis et les mêmes trois
installations physiques.

## Qualification de `deepmerge-ts@8.0.1`

La version imposée par l’arbitrage CTO a été vérifiée directement sur le
registre npm :

- version publiée : `8.0.1` ;
- source : `https://registry.npmjs.org/deepmerge-ts/-/deepmerge-ts-8.0.1.tgz` ;
- intégrité :
  `sha512-szCXE7YLCvLKR9bFPJcvsezOShdalctSvrgN/LM/QGUEPZQajwjmsMObZ6/DuANT5lxzM/wtO8Feubwdkz8myA==` ;
- SHA-1 registre : `755f118cd798df500bfc0b0aad3861dd89cc904b` ;
- licence : `BSD-3-Clause` ;
- moteur : Node `>=16.0.0`, compatible avec Node `22.18.0` ;
- dépréciation : aucune ;
- provenance npm : attestation SLSA v1 et signatures de registre présentes ;
- dépôt déclaré : `RebeccaStevens/deepmerge-ts`.

`@prisma/config@7.9.1` conserve dans ses métadonnées publiées la dépendance
exacte `deepmerge-ts@7.1.5`. Le correctif reste donc un override ciblé, et non
une modification du paquet Prisma.

## Qualification de `mysql2@3.23.1`

La version imposée par la décision CTO M0.3-R4 est résolue une seule fois dans
le lockfile :

- version : `3.23.1` ;
- source : `https://registry.npmjs.org/mysql2/-/mysql2-3.23.1.tgz` ;
- intégrité :
  `sha512-tTuRnC7qCet2IOfSNMYZ5SwXuBnfvBPAcIA28P0gtruXyZlU1LMxA6uha32kYypoFgyYklMqhLWwt4laYwXR/Q==` ;
- licence : `MIT` ;
- moteur : Node `>=8.0`, compatible avec Node `22.18.0` ;
- parent approuvé unique : `prisma@7.9.1`.

`prisma@7.9.1` conserve dans ses métadonnées verrouillées la dépendance exacte
`mysql2@3.15.3`. L’override ciblé force uniquement sa résolution physique vers
`3.23.1`. Prisma et Prisma Client restent strictement en `7.9.1`.

## Qualification de `fast-uri@3.1.6` et `qs@6.16.0`

Les deux versions ont été vérifiées sur le registre npm et restent uniques :

- `fast-uri@3.1.6` : BSD-3-Clause, intégrité
  `sha512-7Ical1vFEMr0onbVzEDIreM22I4khW+fzyQPwvAFWBp1iwdshSZRsL4jjRvPG9JP1uiqMHRto+YU6R2/CzDz5Q==` ;
- `qs@6.16.0` : BSD-3-Clause, Node `>=0.6`, intégrité
  `sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==`.

Les contraintes amont restent inchangées et acceptent les versions corrigées :
`ajv@8.18.0` déclare `fast-uri@^3.0.1`; `body-parser@2.3.0`,
`express@5.2.1` et `superagent@10.3.0` déclarent respectivement `qs@^6.15.2`,
`qs@^6.14.0` et `qs@^6.14.1`. Aucun framework principal n’est mis à niveau.

## Correction minimale

Le manifeste racine contient les six chemins de sécurité parents exacts
suivants ; aucun override global ne cible ces paquets :

```json
{
  "overrides": {
    "@prisma/config@7.9.1": {
      "deepmerge-ts": "8.0.1"
    },
    "prisma@7.9.1": {
      "mysql2": "3.23.1"
    },
    "ajv@8.18.0": {
      "fast-uri": "3.1.6"
    },
    "body-parser@2.3.0": {
      "qs": "6.16.0"
    },
    "express@5.2.1": {
      "qs": "6.16.0"
    },
    "superagent@10.3.0": {
      "qs": "6.16.0"
    }
  }
}
```

Le lockfile R4 résout une seule installation physique de chaque paquet
corrigé :

```text
node_modules/deepmerge-ts@7.1.5
→ node_modules/deepmerge-ts@8.0.1

node_modules/mysql2@3.15.3
→ node_modules/mysql2@3.22.0 (R2)
→ node_modules/mysql2@3.23.1 (R4)
  └─ node_modules/sql-escaper@1.5.1

node_modules/fast-uri@3.1.5
→ node_modules/fast-uri@3.1.6

node_modules/qs@6.15.3
→ node_modules/qs@6.16.0
```

Le changement `mysql2` ajoute `sql-escaper@1.5.1` et retire
`seq-queue@0.0.5` ainsi que `sqlstring@2.3.3`. Aucun autre paquet physique
n’est ajouté, supprimé ou changé de version. `prisma`, `@prisma/client` et
`@prisma/config` restent exactement en `7.9.1`. R4 n’ajoute ni ne retire aucun
paquet physique. Il change seulement les trois versions ci-dessus et la
contrainte déclarée `sql-escaper` de `^1.3.3` à `^1.5.1`, sans modifier sa
résolution `1.5.1`. Le SHA-256 publié R4 de
`package-lock.json` est
`E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044`.

## Publication R4

Le commit R4 `205a4c2264cc99c065da81799ecfcc7f433e24d0` est le cinquième
commit de la Draft PR #29, dont le périmètre cumulatif reste limité à huit
fichiers. Les quatre workflows #45 portant ce head exact ont réussi :

| Workflow           | Run ID        | Conclusion |
| ------------------ | ------------- | ---------- |
| `Infrastructure`   | `33755877761` | `success`  |
| `Launcher Windows` | `33755877765` | `success`  |
| `Security`         | `33755877754` | `success`  |
| `Quality Linux`    | `33755877780` | `success`  |

Ces éléments décrivent l’état publié R4 qui servait de référence au contrôle
local R5 du 2026-09-04. Cette preuve prépublication ne s’auto-référence pas :
les métadonnées de publication R5 font foi dans GitHub.

## Gate versionné

Le scanner n’autorise que les six chemins exacts :

```text
@prisma/config@7.9.1 > deepmerge-ts = 8.0.1
prisma@7.9.1 > mysql2 = 3.23.1
ajv@8.18.0 > fast-uri = 3.1.6
body-parser@2.3.0 > qs = 6.16.0
express@5.2.1 > qs = 6.16.0
superagent@10.3.0 > qs = 6.16.0
```

Pour chacun, il bloque l’absence, une plage, un wildcard, un tag, une référence
externe, un sélecteur global ou parallèle, un parent non versionné ou mal
versionné, un rattachement à un autre parent et tout élargissement de l’objet
d’override. Il exige également Prisma et Prisma Client `7.9.1`, les métadonnées
amont verrouillées, tous les parents immédiats et leurs chemins physiques,
ainsi qu’une seule installation physique racine de chaque version corrigée.
Toute installation vulnérable ou imbriquée supplémentaire, tout parent de lock
non approuvé et toute dérive de Prisma sont bloquants.

R4 a publié 65/65 tests ciblés. R5 conserve ces tests et ajoute un test négatif
paramétré qui injecte un parent `deepmerge-ts` supplémentaire dans chacune des
sections `dependencies`, `devDependencies`, `optionalDependencies` et
`peerDependencies`. Le validator n’autorise désormais que
`node_modules/@prisma/config` comme parent de lock de `deepmerge-ts`. Le scanner
ciblé passe 66/66 et l’outillage 73/73 ; aucune version antérieure, absence,
installation multiple, mauvais parent ou chemin, variante élargie, globale,
parallèle, rangée, wildcard, tag ou référence n’est acceptée.

Ces gates sont temporaires. Chacun doit être retiré séparément dans un futur
lot explicitement autorisé lorsque son parent amont résoudra officiellement la
version corrigée correspondante sans override.

## Compatibilité de la rupture majeure

La version 8 ajoute le suivi des références circulaires, une limite de
profondeur et des protections contre l’épuisement de pile. La compatibilité ne
repose pas sur l’audit seul :

- la fusion d’objets ordinaires de forme Prisma conserve le résultat attendu ;
- un graphe auto-référencé est fusionné dans un processus enfant borné, sans
  timeout, signal ni chute du processus principal ;
- la configuration KORA+ réelle est chargée par Prisma ;
- `prisma format`, `prisma validate` et deux `prisma generate` passent ;
- les deux générations successives produisent la même empreinte agrégée du
  client (16 fichiers) :
  `CE05EF02BD41633B1594EA7964A7962A6BB4E07FA8CB890FF342075BF9CF74E5`.

Les différences de comportement de la v8 sur les `Map`, graphes récursifs et
limites de profondeur ne sont pas utilisées par la configuration KORA+
actuelle. Leur introduction future exige une nouvelle qualification.

Les mises à jour R4 restent transitives et n’altèrent ni le schéma Prisma ni le
code applicatif. La compatibilité a été contrôlée par `npm ls --all`, le
chargement de la configuration, `prisma validate`, deux `prisma generate`, les
61/61 tests globaux et les builds applicables. Deux installations propres ont
résolu chacune 1 135 paquets avec la même empreinte de lockfile. Les audits npm
complet et production ont tous deux conclu à zéro vulnérabilité.

## Licences et notices

Le contrôle final porte sur 1 129 paquets : zéro licence absente et zéro
licence non approuvée. `mysql2@3.23.1` et `sql-escaper@1.5.1` sont sous licence
MIT ; `fast-uri@3.1.6` et `qs@6.16.0` sont BSD-3-Clause. R4 n’ajoute ni ne
retire aucun paquet physique et n’introduit aucune nouvelle licence. Le
contrôle de distribution n’a exigé aucune modification de
`THIRD_PARTY_NOTICES.md`, qui reste inchangé.

Cette conclusion vaut uniquement pour le graphe verrouillé par le SHA-256
`E47CEA6A6853ABBDEB5A82A1D537C9C9DA92486D7A9F2EC72891A7A4101E2044`.
Toute future modification du graphe ou release exige un nouveau contrôle des
licences et notices.

## Isolement de S1.1

M0.3 est exécuté dans le worktree frère `KORA-PLUS-M0-3`. Au préflight R5, le
worktree S1.1 reste sur `feat/s1-1-audio-contract-data-ux-gate`, suspendu avec
ses 39 fichiers locaux. Leur empreinte agrégée contrôlée est
`8957cbf3ff27110af162f53c72e0c129860f0fcdfb8bfddab1ae3714a1d9c6dc`.
Aucun contenu S1.1, modèle métier Prisma, migration, contrat OpenAPI,
code applicatif ou design n’est repris dans le diff M0.3. Les deux documents
vivants `DECISION_LOG.md` et `THREAT_MODEL.md` existent dans les deux worktrees,
mais les hunks M0.3 sont autonomes et le contenu local S1.1 original demeure
inchangé octet par octet. S1.2 reste interdit.
