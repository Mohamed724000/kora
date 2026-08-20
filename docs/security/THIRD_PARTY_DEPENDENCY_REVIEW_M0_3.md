# KORA+ — Revue supply-chain M0.3

Date : 2026-08-20
Lot : M0.3 — remédiation `deepmerge-ts`
Base : `a602fd38f32d018867c8a058deace0325b4a7c31`

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

## Correction minimale

Le manifeste racine ajoute exclusivement :

```json
{
  "overrides": {
    "@prisma/config@7.9.1": {
      "deepmerge-ts": "8.0.1"
    }
  }
}
```

Le lockfile remplace une seule installation physique :

```text
node_modules/deepmerge-ts@7.1.5
→ node_modules/deepmerge-ts@8.0.1
```

Les seules métadonnées nouvelles sont l’intégrité, l’URL de tarball et les
deux entrées de financement publiées par `8.0.1`. Aucune entrée de paquet n’est
ajoutée ou supprimée. `prisma`, `@prisma/client` et `@prisma/config` restent
exactement en `7.9.1`.

## Gate versionné

Le scanner bloque désormais :

- l’absence de l’override exact et ciblé ;
- toute plage SemVer à la place de `8.0.1` ;
- tout override global de `deepmerge-ts` ;
- tout élargissement de l’objet d’override à une autre dépendance ;
- toute modification de `prisma` ou `@prisma/client` ;
- toute résolution lockfile différente de Prisma `7.9.1` ;
- toute installation physique supplémentaire ou imbriquée de `deepmerge-ts` ;
- toute installation vulnérable `<8.0.0`.

Les fixtures couvrent explicitement `7.1.5` en négatif, `8.0.1` en positif,
une installation vulnérable imbriquée, une plage, un override global exact ou
sélectionné par version, des sélecteurs Prisma parallèles non versionnés ou en
plage, et un changement de Prisma.

Ce gate est temporaire. Il doit être retiré dans un futur lot explicitement
autorisé dès qu’une version stable qualifiée de Prisma n’embarque plus une
contrainte vulnérable et résout officiellement `deepmerge-ts >=8.0.0`.

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

## Isolement de S1.1

M0.3 est exécuté dans le worktree frère `KORA-PLUS-M0-3`. Le worktree S1.1
reste sur `feat/s1-1-audio-contract-data-ux-gate`, suspendu avec ses 39 fichiers
locaux. Aucun contenu S1.1, modèle métier Prisma, migration, contrat OpenAPI,
code applicatif ou design n’est repris dans le diff M0.3. Les deux documents
vivants `DECISION_LOG.md` et `THREAT_MODEL.md` existent dans les deux worktrees,
mais les hunks M0.3 sont autonomes et le contenu local S1.1 original demeure
inchangé octet par octet. S1.2 reste interdit.
