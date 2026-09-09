# Revue de licence tierce S1.1-R3 — Sharp/libvips Linux

- Date de qualification technique : 2026-09-09
- Source : `package-lock.json`, métadonnées npm amont et inventaires simulés
- Statut : **QUALIFICATION TECHNIQUE LOCALE — AUCUNE AUTORISATION DE RELEASE**

Cette revue qualifie uniquement deux paquets natifs optionnels introduits dans
le graphe Linux par `sharp@0.35.4`. Elle ne constitue pas un avis juridique, une
autorisation générale de la LGPL ou une autorisation de distribuer un artefact.

## Déclencheur et périmètre exact

Sur le head R2 publié `851bd1dd9ff0b7bb38f43012edf07a675e31b318`, le workflow
Security `34373860535` a réussi `npm ls --all` et les audits complet et
production à zéro, puis a échoué au contrôle des licences. L’inventaire Linux
contenait 1 138 paquets, 0 licence non déclarée et les deux autorisations
manquantes suivantes :

| Paquet exact                       | Version | Licence déclarée    | Plateforme      | Parent exact   |
| ---------------------------------- | ------- | ------------------- | --------------- | -------------- |
| `@img/sharp-libvips-linux-x64`     | `1.3.3` | `LGPL-3.0-or-later` | Linux x64 glibc | `sharp@0.35.4` |
| `@img/sharp-libvips-linuxmusl-x64` | `1.3.3` | `LGPL-3.0-or-later` | Linux x64 musl  | `sharp@0.35.4` |

Le lockfile marque les deux paquets `optional: true`, `os: ["linux"]` et
`cpu: ["x64"]`. Les intégrités enregistrées concordent avec le registre npm :

- glibc :
  `sha512-4vKmvAst9nrowcqquKFAyZJUDolUaIp8uRiN0mWFguJ1IplC9/pitXtlnnlU4aa/eJw3J7i67V+pwUL+wZGdsA==` ;
- musl :
  `sha512-fj8Mv0HHfD1Rr+4I68+3agJynxDWtBFgicTbSOb9Bke6pIwzGcJ+RX/yHjmiEGFMCavY/dxvem7MyNaJF+wDiw==`.

Sharp déclare ces deux résolutions exactes dans ses `optionalDependencies`.
Le gestionnaire de paquets choisit la variante native compatible avec le
système, le processeur et, sous Linux, la libc.

## Présence et surfaces de distribution

L’installation Windows de validation contient les variantes `sharp-win32-x64`
et `sharp-wasm32`, mais aucun des deux paquets Linux. C’est pourquoi
l’inventaire local Windows de 1 131 paquets ne pouvait pas reproduire
physiquement les deux lignes Linux observées en CI.

Aucun fichier source ou binaire libvips n’est modifié ou suivi par KORA+ dans
R3. Ces paquets natifs Node ne sont intégrés ni aux bundles navigateur ni à
l’APK Flutter, dont le graphe Pub est distinct. Une image de conteneur, un
binaire ou un autre artefact serveur Linux peut toutefois embarquer la variante
sélectionnée avec Sharp.

Toute distribution contenant l’une de ces bibliothèques reste donc bloquée par
un gate juridique/release distinct. Ce gate devra au minimum :

1. conserver les textes de licence, mentions de copyright et notices
   applicables dans l’artefact distribué ;
2. identifier la version et les sources correspondantes réellement embarquées ;
3. vérifier les obligations LGPL applicables au mode de liaison et permettre le
   remplacement ou la reliaison lorsque requis ;
4. fournir les sources des éventuelles modifications apportées aux composants
   LGPL ;
5. faire valider le packaging réel avant toute release.

## Précédent historique S0.3

La [revue S0.3](./THIRD_PARTY_LICENSE_REVIEW_S0_3.md) avait qualifié les
variantes libvips alors verrouillées en `1.3.2`, avec les mêmes réserves de
distribution et sans modification locale. Cette décision historique était
strictement limitée au graphe S0.3 ; elle ne couvre pas automatiquement la
version `1.3.3`. R3 est une qualification technique de delta autonome.

## Autorisation automatisée minimale

Le contrôleur remplace exclusivement les deux tuples obsolètes `1.3.2` par :

- `@img/sharp-libvips-linux-x64@1.3.3` avec `LGPL-3.0-or-later` ;
- `@img/sharp-libvips-linuxmusl-x64@1.3.3` avec `LGPL-3.0-or-later`.

`LGPL-3.0-or-later` ne rejoint pas la liste globale des licences approuvées.
Aucun wildcard, plage, tag, autre version ou autre paquet `@img` n’est admis.

## Preuves locales

Une fixture créée uniquement sous le répertoire temporaire a simulé les
manifestes installés, puis a été supprimée :

| Cas                                               | Code | Résultat                                   |
| ------------------------------------------------- | ---: | ------------------------------------------ |
| deux noms exacts, version `1.3.3`, licence exacte |    0 | 2 installés, 0 non déclaré, 0 non approuvé |
| nom approuvé, autre version                       |    1 | 1 non approuvé                             |
| nom et version approuvés, autre licence           |    1 | 1 non approuvé                             |
| troisième paquet sous `LGPL-3.0-or-later`         |    1 | 1 non approuvé                             |

L’inventaire Windows réel conclut : 1 131 paquets installés, 0 licence non
déclarée et 0 licence non approuvée. Les autres contrôles ciblés sont
consignés après exécution dans le rapport S1.1 cumulatif.

## Sources de qualification

- [installation et sélection des binaires Sharp](https://sharp.pixelplumbing.com/install/) ;
- [registre npm — variante glibc 1.3.3](https://www.npmjs.com/package/@img/sharp-libvips-linux-x64/v/1.3.3) ;
- [registre npm — variante musl 1.3.3](https://www.npmjs.com/package/@img/sharp-libvips-linuxmusl-x64/v/1.3.3) ;
- [dépôt et licence amont libvips](https://github.com/libvips/libvips) ;
- [GNU LGPL 3.0](https://www.gnu.org/licenses/lgpl-3.0.html) ;
- [notices KORA+](../../THIRD_PARTY_NOTICES.md).

Au point de validation prépublication du 2026-09-09, R3 était uniquement
présent dans le worktree local, non indexé, non commité et non publié. Cette
mention est un instantané historique daté ; tout statut ultérieur doit être
établi par l’historique Git et la Draft PR #36. S1.2 restait non démarré.
