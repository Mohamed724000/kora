# Revue des dépendances d'observabilité S0.5

Statut : qualifiées pour la fondation S0.5 uniquement.

## Décision

L'intégration retient les SDK officiels exacts suivants :

| Runtime                   | Dépendance directe | Version | Licence | Usage                                    |
| ------------------------- | ------------------ | ------: | ------- | ---------------------------------------- |
| API NestJS                | `@sentry/node`     | 10.70.0 | MIT     | erreurs serveur 5xx, sans logs ni traces |
| Next.js Web/Admin client  | `@sentry/react`    | 10.70.0 | MIT     | erreurs des boundaries React             |
| Next.js Web/Admin serveur | `@sentry/node`     | 10.70.0 | MIT     | instrumentation du runtime Node          |
| Flutter                   | `sentry_flutter`   |  9.26.0 | MIT     | erreurs Flutter/native, sans performance |

`@sentry/nextjs` a été évalué puis rejeté avant intégration : sa version
courante tirait un CLI à licence FSL et script `postinstall` ; une version plus
ancienne compatible exposait sept avis modérés. La composition Node + React
évite le plugin de bundling, l'upload de source maps, le CLI et son script
d'installation. Aucun de ces candidats rejetés ne reste dans le graphe final.

## Graphe et provenance

Le lockfile npm final ajoute 31 entrées transitives : 17 MIT, 12 Apache-2.0,
une BSD-3-Clause et une ISC. Toutes proviennent de
`https://registry.npmjs.org/`. Les seuls scripts d'installation du lockfile
restent les cinq chemins S0.4 déjà qualifiés (Prisma, fsevents,
msgpackr-extract et unrs-resolver) ; Sentry n'en ajoute aucun.

Le lockfile Flutter ajoute dix paquets hébergés sur `https://pub.dev` :
`ffi`, `ffi_leak_tracker`, `http`, `jni`, `package_info_plus`,
`package_info_plus_platform_interface`, `plugin_platform_interface`,
`sentry`, `sentry_flutter` et `win32`. `sentry_flutter` est MIT ; les
neuf autres utilisent les licences BSD-3-Clause de l'écosystème Dart/Flutter.

## Sécurité et confidentialité

- Versions directes exactes et lockfiles versionnés.
- Aucun DSN, token d'upload, compte fournisseur ou URL de production dans Git.
- Initialisation absente lorsque le DSN est vide : aucun transport réseau.
- `sendDefaultPii=false`, logs et tracing désactivés, replays non initialisés.
- Les callbacks `beforeSend` suppriment utilisateur et requête, puis masquent
  récursivement token, mot de passe, OTP, email, téléphone, DSN, cookie,
  autorisation, IP, identifiant appareil et données paiement.
- Les tests négatifs couvrent l'absence de DSN et la redaction sur API, Web,
  Admin et Flutter.

## Gates

La qualification exige simultanément : `npm ls --all`, audits complet et
production à zéro, inventaire npm à zéro licence non déclarée/non approuvée,
`flutter pub deps`, tests des callbacks, scan des sources et lockfiles, puis
builds applicatifs. Toute mise à jour de version ou activation de traces,
replays, source maps ou PII exige une nouvelle revue.
