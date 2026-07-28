# AdminLTE — référence visuelle uniquement

Archive attendue :

`AdminLTE-master.zip`

Version identifiée : `admin-lte` 4.1.0  
Licence déclarée dans l’archive : MIT  
SHA-256 attendu :
`9b69b877e005e41e06c21f8a4f52cb3b999464e3446fbb961ff962c69b450b5d`

## Règles

- Ne pas extraire l’archive dans `apps/admin`.
- Ne pas lancer son `npm install`.
- Ne copier aucune page HTML, image, avatar ou donnée de démonstration.
- Ne pas importer son projet source comme dépendance locale.
- Utiliser l’archive uniquement pour contrôler les repères visuels autorisés.

L’application réelle utilise dans `apps/admin/package.json` :

- `@adminlte/react` ;
- `bootstrap` ;
- `bootstrap-icons` ;
- `@tanstack/react-table` ;
- `apexcharts`.

TanStack Table est l’unique moteur des tableaux. Le Datatable Tabulator
d’AdminLTE n’est jamais utilisé.
