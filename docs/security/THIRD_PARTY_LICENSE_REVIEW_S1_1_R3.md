# Revue de licence tierce S1.1-R3 — Sharp/libvips Linux

- Date de qualification technique : 2026-09-09
- Source : `package-lock.json`, métadonnées npm amont et inventaires simulés
- Statut : **QUALIFICATION TECHNIQUE ACCEPTÉE ET PUBLIÉE DANS LA DRAFT PR #36 — GATE JURIDIQUE/RELEASE MAINTENU**

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

Après cet instantané, la qualification a été acceptée et publiée dans la Draft
PR #36 par le commit `7d23f14619bb88e870e8cfa6d88a0d921db70b28`, quatrième
commit de la PR, portant son cumul à 52 fichiers. Les workflows Infrastructure
`34413603588`, Launcher Windows `34413603576`, Security `34413603622` et
Quality Linux `34413603626` ont tous conclu `completed/success` sur ce head
exact. Security a confirmé les audits npm complet et production à zéro ainsi
qu’un inventaire Linux de 1 138 paquets, 0 licence non déclarée et 0 licence non
approuvée.

Cette publication ne constitue ni une autorisation générale de la LGPL ni une
autorisation de release. Le gate juridique/release décrit ci-dessus reste
obligatoire avant toute distribution d’un artefact serveur contenant ces
bibliothèques. Les futurs statuts Git et CI font foi dans l’historique GitHub et
la PR #36.

## Clôture et fusion S1.1

Après l’instantané R3 et sa publication, le commit documentaire R4
`86471b427bbbab54e1b7e55ab89ffec77f4f3bee` a réconcilié les preuves. La PR #36
a été fusionnée le 2026-09-10 au merge commit
`bcb579916c1ca73e3cfb186683cb932f4f3905e9`, avec les parents exacts
`3b05bfd83a65ab552c6c08f114b8ee0261103f30` et
`86471b427bbbab54e1b7e55ab89ffec77f4f3bee`.

Les workflows post-fusion Infrastructure `34466969243`, Launcher Windows
`34466969313`, Security `34466969222` et Quality Linux `34466969196` ont tous
conclu `completed/success`. Cette clôture ne transforme pas la qualification
technique en avis juridique ou en autorisation de distribution : le gate
juridique/release décrit par la présente revue reste obligatoire.

S1.2-01 est postérieur à cette fusion. Instantané historique de validation
locale du 2026-09-11, établi avant toute publication. À cet instant, S1.2-01
était non indexé, non commité et non publié, sans changement de dépendance,
manifeste, lockfile, workflow ni artefact distribué. Ce constat reste vrai pour
cet instantané historique ; toute publication ultérieure est enregistrée
séparément par l’historique Git, la PR et les workflows.
