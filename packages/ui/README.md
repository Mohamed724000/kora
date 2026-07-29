# Interface web partagée

`@kora-plus/ui` contient uniquement les primitives de présentation communes aux
applications web publique et d’administration.

Le package expose actuellement :

- `BrandMark`, la signature textuelle accessible KORA+ ;
- `StatusPanel`, le panneau commun pour les états vide, chargement et erreur ;
- `ActionButton`, un bouton neutre pour les actions techniques de reprise ;
- `SkipLink`, le lien d’évitement clavier.

Le package ne contient aucune donnée, règle métier, route ou intégration réseau.

## Validation

Depuis ce dossier :

```powershell
npm.cmd run format
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```
