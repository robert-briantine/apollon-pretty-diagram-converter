# Évolution 0 — Importer le diagramme Appolon JS et définir le graphe métier

## Objectif

Reformulation du besoin global : réaliser un programme Node.js en TypeScript qui convertit un diagramme d’activité Appolon JS, notamment `diagram.json`, en fichier SVG soigné et prêt pour une présentation. Le programme doit s’appuyer sur `graphe.ts`, implémenter `computeSpatialGraphe`, vérifier les chemins et les placements avec les trois vérificateurs demandés, puis proposer une sélection de diagramme et une consultation du SVG dans une interface servie par Express. Les évolutions 0 à 7 réalisent progressivement ce besoin.

Cette première étape fournit l’import et le contrat métier, en réutilisant le socle TypeScript et Express existant.

## Dépendances

Aucune

## Instructions de réalisation

- Étudier `graphe.ts` comme référence et créer les modules métier sous `src/server/`, compatibles avec la compilation existante. Définir les contrats `Graphe`, `Forme`, `Placement`, `Chemin`, `Pas` et `Point`. Utiliser `SpaceGraphe`, nom présent dans la référence, pour le graphe spatial appelé « SpatialGraphe » dans le besoin ; documenter cette correspondance.
- Importer les tableaux `nodes` et `edges` du JSON Appolon JS. Transformer les actions en rectangles, les décisions/fusions en losanges et le nœud initial en ovale. Documenter cette table de correspondance et traiter explicitement les types non pris en charge.
- Conserver les identifiants, les orientations source/cible, tous les arcs, y compris les arcs parallèles, les libellés des nœuds et les libellés d’arcs tels que « oui » et « non ». Prévoir leur association aux futurs chemins sans confondre l’indice de connexion `Chemin.idx` avec l’identité d’un arc.
- Exploiter les dimensions du fichier ; conserver les positions, handles, ancres et points intermédiaires utiles comme indications pour les étapes spatiales. Leur éventuelle réorganisation doit préserver la topologie et les libellés.
- Valider le JSON, les identifiants uniques, les références des arcs et les dimensions finies strictement positives. Produire des erreurs explicites pour les entrées invalides, sans perdre silencieusement des éléments. Ne pas modifier le fichier d’entrée.

## Critères d'acceptation

- `diagram.json` produit un `Graphe` contenant ses 18 nœuds et ses 24 arcs, avec les correspondances de formes décrites et tous ses libellés.
- Les cycles du diagramme sont conservés. Les informations d’ancrage restent accessibles pour le calcul spatial.
- Un JSON incorrect, une référence absente ou un type non pris en charge donne un diagnostic identifiable.
- Les modules métier sont compilables en TypeScript strict avec le socle existant.

## Tests à effectuer

- Exécuter `npm run typecheck` après l’implémentation de cette étape.
- Importer `diagram.json` et comparer les identifiants, nombres de nœuds et d’arcs, formes, libellés et métadonnées avec l’entrée.
- Tester de petites entrées avec arcs parallèles, cycle, nœud isolé, tableaux vides et libellés accentués ou multilignes ; aucun élément valide ne doit disparaître.
- Tester un JSON mal formé, un identifiant dupliqué, une cible absente, une dimension invalide et un type inconnu ; vérifier les diagnostics et l’absence de mutation de l’entrée.
