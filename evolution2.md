# Évolution 2 — Calculer des placements lisibles sans chevauchement

## Objectif

Construire la partie placement du futur `computeSpatialGraphe`, avec des formes dimensionnées pour leurs textes et un espace suffisant pour le routage.

## Dépendances

- `evolution0.md` : graphe importé et libellés.
- `evolution1.md` : connexions et `verifierPlacement`.

## Instructions de réalisation

- Créer une fonction de calcul des placements réutilisable par `computeSpatialGraphe`, sans prétendre fournir les chemins à cette étape.
- Définir une orientation de lecture et des marges cohérentes. Utiliser les positions importées comme indications lorsqu’elles restent compatibles avec un résultat lisible ; résoudre les chevauchements sans changer les relations du graphe.
- Dimensionner les formes à partir des dimensions importées et des besoins des libellés : retours à la ligne, espacement interne et texte contenu dans la zone utile du losange ou de l’ovale. Partager les règles de texte avec le futur rendu afin de ne pas déplacer les connexions après routage.
- Traiter les embranchements, convergences, cycles et composantes déconnectées sans supposer que le graphe est un arbre. Prévoir des espaces entre formes et autour des groupes pour les chemins de retour.
- Après toute modification de position ou de dimensions, recalculer les connexions. Stabiliser l’ordre de traitement pour que deux calculs sur la même entrée donnent le même résultat.
- Appeler `verifierPlacement` sur le résultat et résoudre tous les conflits avant de le déclarer valide ; retourner un diagnostic si le calcul échoue.

## Critères d'acceptation

- Chaque sommet possède exactement un placement avec coordonnées finies, dimensions positives et connexions cohérentes avec sa forme finale.
- `verifierPlacement` ne renvoie aucun conflit pour `diagram.json` et les cas représentatifs.
- Les libellés longs et multilignes disposent d’une zone adaptée ; les formes restent espacées, y compris aux limites des boîtes englobantes.
- Le calcul termine sur les cycles et conserve tous les sommets des composantes déconnectées. L’entrée reste inchangée et le résultat est déterministe.

## Tests à effectuer

- Calculer les placements de `diagram.json`, vérifier leur nombre et leurs coordonnées, puis exiger une liste vide de `verifierPlacement`.
- Tester une chaîne, un embranchement suivi d’une convergence, un cycle, un sommet isolé et plusieurs composantes.
- Tester des positions initiales superposées ou négatives, ainsi que des libellés longs, accentués et multilignes ; vérifier les marges et dimensions calculées.
- Comparer deux résultats successifs et vérifier que les connexions suivent toute modification de position ou de taille. Exécuter `npm run typecheck`.
