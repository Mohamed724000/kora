# KORA+ — Revue supply-chain M0.3, R1 et R2

Date initiale : 2026-08-20
Réconciliation documentaire : 2026-09-02
Lot : M0.3 — remédiations `deepmerge-ts` et `mysql2`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`
Head M0.3-R2 publié : `68027ed15948228ceef7277ad1fa0a47761751e2`

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

## Qualification de `mysql2@3.22.0`

La version imposée par la décision CTO M0.3-R2 est résolue une seule fois dans
le lockfile :

- version : `3.22.0` ;
- source : `https://registry.npmjs.org/mysql2/-/mysql2-3.22.0.tgz` ;
- intégrité :
  `sha512-4jaJYBObj7FhD3lnZhqX1yDMuZN4mQNz+IolDySDXT7fbozMBpeGQNcuWXKUqo4ahkAEfkjUHPjnwuDI0/6VKw==` ;
- licence : `MIT` ;
- moteur : Node `>=8.0`, compatible avec Node `22.18.0` ;
- parent approuvé unique : `prisma@7.9.1`.

`prisma@7.9.1` conserve dans ses métadonnées verrouillées la dépendance exacte
`mysql2@3.15.3`. L’override ciblé force uniquement sa résolution physique vers
`3.22.0`. Prisma et Prisma Client restent strictement en `7.9.1`.

## Correction minimale

Le manifeste racine contient exactement les deux overrides parents suivants :

```json
{
  "overrides": {
    "@prisma/config@7.9.1": {
      "deepmerge-ts": "8.0.1"
    },
    "prisma@7.9.1": {
      "mysql2": "3.22.0"
    }
  }
}
```

Le lockfile final résout les deux installations physiques corrigées :

```text
node_modules/deepmerge-ts@7.1.5
→ node_modules/deepmerge-ts@8.0.1

node_modules/mysql2@3.15.3
→ node_modules/mysql2@3.22.0
  └─ node_modules/sql-escaper@1.5.1
```

Le changement `mysql2` ajoute `sql-escaper@1.5.1` et retire
`seq-queue@0.0.5` ainsi que `sqlstring@2.3.3`. Aucun autre paquet physique
n’est ajouté, supprimé ou changé de version. `prisma`, `@prisma/client` et
`@prisma/config` restent exactement en `7.9.1`. Le SHA-256 publié de
`package-lock.json` est
`2041E52ECFB25092FADC32EE207C84DED22E9805233CCEA38889170CD1D08742`.

## Gate versionné

Le scanner n’autorise que les deux chemins exacts :

```text
@prisma/config@7.9.1 > deepmerge-ts = 8.0.1
prisma@7.9.1 > mysql2 = 3.22.0
```

Pour chacun, il bloque l’absence, une plage, un wildcard, un tag, une référence
externe, un sélecteur global ou parallèle, un parent non versionné ou mal
versionné, un rattachement à un autre parent et tout élargissement de l’objet
d’override. Il exige également Prisma et Prisma Client `7.9.1`, les métadonnées
amont verrouillées `deepmerge-ts@7.1.5` et `mysql2@3.15.3`, ainsi qu’une seule
installation physique racine de chaque version corrigée. Toute installation
vulnérable ou imbriquée supplémentaire est bloquante.

Les 49/49 tests ciblés couvrent les états conformes et les variantes négatives
des deux chemins. Avec les autres contrôles du scanner, l’outillage totalise
56/56 tests.

Ces gates sont temporaires. Chacun doit être retiré séparément dans un futur
lot explicitement autorisé lorsqu’une version stable qualifiée de Prisma
résoudra officiellement la dépendance corrigée correspondante.

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
  client :
  `4DC00A32821A673C758F8EDF2DC8B2CAF0B959637740DA6AEB5C1015A5B32F69`.

Les différences de comportement de la v8 sur les `Map`, graphes récursifs et
limites de profondeur ne sont pas utilisées par la configuration KORA+
actuelle. Leur introduction future exige une nouvelle qualification.

La mise à jour `mysql2` reste transitive et n’altère ni le schéma Prisma ni le
code applicatif. La compatibilité a été contrôlée par `npm ls --all`, le
chargement de la configuration, `prisma validate`, deux `prisma generate`, les
61/61 tests globaux et les builds applicables. Deux installations propres ont
résolu chacune 1 135 paquets avec la même empreinte de lockfile. Les audits npm
complet et production ont tous deux conclu à zéro vulnérabilité.

## Licences et notices

Le contrôle final porte sur 1 129 paquets : zéro licence absente et zéro
licence non approuvée. `mysql2@3.22.0` et le nouveau transitif
`sql-escaper@1.5.1` sont tous deux sous licence MIT. Le remplacement retire
`seq-queue@0.0.5` et `sqlstring@2.3.3`. Le contrôle de distribution n’a exigé
aucune modification de `THIRD_PARTY_NOTICES.md`, qui reste inchangé.

Cette conclusion vaut uniquement pour le graphe verrouillé par le SHA-256
`2041E52ECFB25092FADC32EE207C84DED22E9805233CCEA38889170CD1D08742`.
Toute future modification du graphe ou release exige un nouveau contrôle des
licences et notices.

## Isolement de S1.1

M0.3 est exécuté dans le worktree frère `KORA-PLUS-M0-3`. Le worktree S1.1
reste sur `feat/s1-1-audio-contract-data-ux-gate`, suspendu avec ses 39 fichiers
locaux. Leur empreinte agrégée contrôlée est
`8957cbf3ff27110af162f53c72e0c129860f0fcdfb8bfddab1ae3714a1d9c6dc`.
Aucun contenu S1.1, modèle métier Prisma, migration, contrat OpenAPI,
code applicatif ou design n’est repris dans le diff M0.3. Les deux documents
vivants `DECISION_LOG.md` et `THREAT_MODEL.md` existent dans les deux worktrees,
mais les hunks M0.3 sont autonomes et le contenu local S1.1 original demeure
inchangé octet par octet. S1.2 reste interdit.
