# Contribuer à KORA+ Final

## Avant tout travail

1. Vérifier l’autorisation explicite du lot actif.
2. Lire [AGENTS.md](AGENTS.md) et la
   [source de vérité](docs/governance/SOURCE_OF_TRUTH.md).
3. Vérifier les ADR et exigences applicables.
4. Enregistrer l’état Git et les changements préexistants.
5. Confirmer les fichiers autorisés, les critères d’acceptation et les
   conditions d’arrêt.

Un prompt archivé ou futur n’est jamais exécutable de sa seule présence.

## Workflow

- `main` est la branche stable.
- Le premier commit local S0.1 est l’unique exception de bootstrap.
- Après ce bootstrap, utiliser une branche par lot ou fonctionnalité.
- Après autorisation d’un remote, toute fusion passe par une Pull Request,
  une revue et des contrôles verts.
- Ne jamais inventer d’identité GitHub, d’adresse e-mail ou de co-auteur.
- Ne jamais pousser de force sur `main` ni réécrire l’historique partagé.

Le détail figure dans [GIT_WORKFLOW.md](docs/governance/GIT_WORKFLOW.md).

## Qualité et sécurité

- Aucun secret ou donnée personnelle réelle dans le repository, les fixtures
  ou les logs.
- Aucun changement produit, financier ou de sécurité non arbitré.
- Toute nouvelle dépendance doit être justifiée et contrôlée.
- Les validations réellement applicables doivent être exécutées et rapportées.
- Un contrôle indisponible reste `NON EXÉCUTÉ`.
- Documentation et traçabilité sont mises à jour dans le même lot.

## Interdictions permanentes

- Réutiliser un ancien code KORA+.
- Introduire une stack non approuvée.
- Exposer une URL média brute.
- Implémenter une logique financière non validée côté serveur.
- Employer une commande Git destructive.
- Commencer un lot sans autorisation explicite.
