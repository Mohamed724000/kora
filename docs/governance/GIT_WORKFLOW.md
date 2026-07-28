# KORA+ Final — Workflow Git

Statut : **APPROUVÉ POUR LA BASELINE S0.1**

## Branche stable

- `main` est la branche stable.
- Le premier commit local de S0.1 est l’unique exception de bootstrap.
- Aucun remote n’est créé tant que le Product Owner ne l’autorise pas.
- Aucune modification directe de `main` après mise en place du remote.

## Branches après le bootstrap

Une branche par lot ou fonctionnalité :

- `chore/s0-x-*`
- `feat/*`
- `fix/*`
- `docs/*`

Après création autorisée du remote, toute fusion exige une Pull Request, une
revue, les contrôles applicables au vert et la traçabilité mise à jour.

## Commits

- Commits atomiques, vérifiables et sans secret.
- Messages conventionnels : `type(scope): résumé`.
- Aucun co-auteur ou auteur inventé.
- Aucun gros artefact généré.
- Les documents et preuves concernés sont livrés avec le changement.

## Protections

- Aucun force-push sur `main`.
- Aucun `reset --hard`, `clean`, suppression de branche ou réécriture
  d’historique sans autorisation explicite.
- Aucun hook ou Git LFS ajouté implicitement.
- Aucun remote, tag, release ou push sans autorisation du Product Owner.

## Rollback non destructif

1. Identifier le commit fautif et l’impact.
2. Préserver les travaux locaux.
3. Utiliser un commit de correction ou `git revert` après revue.
4. Rejouer les validations affectées.
5. Documenter l’incident et la décision.

Voir [CONTRIBUTING.md](../../CONTRIBUTING.md) et
[OWNERSHIP_MATRIX.md](OWNERSHIP_MATRIX.md).
