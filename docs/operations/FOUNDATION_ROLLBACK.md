# Rollback des fondations S0.5

Statut : procédure de fondation, sans déploiement ni environnement de production.

S0.5 ajoute des contrôles CI, sécurité, OpenAPI et une observabilité désactivée
par défaut. Il n'ajoute ni migration, ni donnée métier, ni route produit, ni
déploiement automatique. Un rollback ne doit donc jamais employer de
force-push, de réécriture d'historique ou de suppression globale.

## Déclencheurs

Un rollback est requis lorsqu'un contrôle introduit une régression confirmée,
qu'une dépendance qualifiée devient vulnérable ou incompatible, qu'un DSN est
compromis, ou que la branche stable ne peut plus satisfaire les gates
obligatoires.

## Procédure Git

1. Conserver les sorties de CI, le SHA fautif et le constat d'incident.
2. Créer une branche corrective depuis le `origin/main` courant.
3. Réaliser un revert Git normal du commit ou du merge concerné, sans rebase ni
   force, puis faire revoir le diff.
4. Exécuter les mêmes gates que ceux affectés par le rollback.
5. Publier le rollback par Pull Request. La protection de branche et les revues
   restent applicables.

Le revert n'est exécuté qu'après autorisation explicite. Cette procédure ne
constitue pas elle-même une autorisation de mutation.

## Observabilité

- Sans `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `--dart-define=SENTRY_DSN=…`,
  aucun SDK n'est initialisé et aucun trafic Sentry n'est émis.
- Pour un arrêt d'urgence, retirer les DSN des environnements externes et
  redéployer la même révision. Ne jamais inscrire le DSN dans Git ou dans un log.
- En cas de suspicion de fuite, révoquer et régénérer le DSN côté fournisseur,
  puis vérifier les journaux d'accès. Aucun compte ou projet Sentry n'est créé
  par ce dépôt.
- Si le SDK lui-même doit être retiré, supprimer ensemble l'initialisation, les
  tests, les dépendances et les entrées de lockfile dans une PR corrective.

## CI et sécurité

Pour stopper un workflow fautif, annuler uniquement son run depuis GitHub
Actions et relever son identifiant, son SHA et le job concerné. Ne pas
désactiver le workflow, modifier les paramètres GitHub, supprimer ses preuves
ou annuler des runs sans rapport. Après le revert correctif, relancer par la PR
normale et conserver les liens de l'ancien run et du run de validation dans le
rapport d'incident.

Un workflow défaillant est corrigé ou reverti comme un fichier versionné. Ne
pas contourner l'échec par `continue-on-error`, permission `write`, action non
épinglée, baisse du seuil d'audit ou suppression de test. Les checks GitHub ne
sont pas désactivés hors dépôt sans décision CTO séparée.

Le scan de secrets S0.5 est un garde-fou local haute confiance. Si un secret
réel est découvert, arrêter la publication, révoquer le secret hors dépôt,
évaluer l'historique et demander une décision dédiée avant toute réécriture.

## Infrastructure locale

- `npm run infra:down` arrête PostgreSQL et Redis sans supprimer les volumes.
- Le reset reste borné au projet `kora-plus-local` et exige
  `--confirm=kora-plus-local`.
- Aucun prune global, suppression d'image ou volume étranger n'est autorisé.
- Les données locales ne sont pas une sauvegarde de production.

## Dépendances et contrats

Les manifestes et leurs lockfiles sont revertis ensemble. Après rollback :
`npm ci`, `flutter pub get`, audits, licences, tests et builds sont rejoués.

Le contrat `docs/api/openapi.yaml` et les deux routes de santé sont atomiques :
un rollback qui change l'un doit réaligner l'autre et exécuter
`npm run openapi:validate`. Aucune route métier ne peut être ajoutée au titre
d'un rollback S0.5.

## Vérification de sortie

Avant retour en service, exécuter au minimum `npm run infra:up`,
`npm run infra:status`, `npm run infra:check`, le build API et
`npm run infra:verify-api`. PostgreSQL et Redis doivent être `healthy`,
`/health/live` et `/health/ready` doivent répondre `200`, et les transitions de
panne/reprise doivent conserver le même PID API. Le rollback est acceptable
uniquement lorsque les gates concernés passent, `git diff --check` est vert,
l'index est maîtrisé, aucun secret n'apparaît et les processus temporaires sont
fermés.

Tracer dans le rapport d'incident : SHA fautif, SHA du revert correctif,
symptômes, impact, commandes et résultats, volumes préservés, contrôles non
exécutés, liens des runs CI et autorité ayant validé le retour en service.
