# Évolution 3 — Router les arcs et implémenter computeSpatialGraphe

## Objectif

Implémenter `computeSpatialGraphe(g: Graphe): SpaceGraphe` pour produire un graphe spatial complet dont les chemins relient les connexions et évitent les autres placements.

## Dépendances

- `evolution0.md` : arcs, libellés et indications d’ancrage importés.
- `evolution1.md` : connexions et trois vérificateurs géométriques.
- `evolution2.md` : calcul de placements sans chevauchement.

## Instructions de réalisation

- Assembler les placements et le routage dans une implémentation effective de `computeSpatialGraphe`, conformément aux contrats inspirés de `graphe.ts`.
- Pour chaque arc, choisir une connexion source et une connexion cible. Renseigner `Chemin.idx` avec l’indice de connexion source et produire une `listeDePas` composée exclusivement de déplacements horizontaux ou verticaux finis.
- Utiliser les handles, ancres et points importés comme préférences lorsque leur géométrie reste valide. En cas d’incohérence, recalculer un trajet valide ; les losanges et ovales restent limités à leurs quatre connexions.
- Router autour des boîtes des placements tiers avec une marge. Gérer embranchements, retours, cycles et arcs parallèles sans perdre d’arc ni de libellé. Éviter autant que possible les superpositions de chemins et les détours inutiles, sans imposer l’absence de croisements entre arcs.
- Préserver une association stable entre chaque arc, son chemin et son libellé. Garder les dégagements nécessaires au départ et à l’arrivée afin de ne pas traverser sa propre forme source ou cible.
- Exécuter `verifierChemin`, `verifierPlacement` et `verifierPlacementChemin` avant de retourner un résultat valide. Si nécessaire, ajuster placements, connexions et routage avec une limite explicite d’essais ; fournir un diagnostic en cas d’échec plutôt qu’un résultat invalide.

## Critères d'acceptation

- `computeSpatialGraphe` contient une implémentation exécutable et retourne un placement par sommet et un chemin par arc, y compris les arcs parallèles.
- Pour `diagram.json`, les 18 placements et les 24 chemins sont présents, et les trois vérificateurs renvoient des listes vides.
- Chaque `idx` est valide et chaque extrémité calculée atteint une connexion de destination dans la tolérance documentée.
- Les chemins respectent les formes source et cible ainsi que les obstacles tiers. Les libellés d’arcs restent disponibles pour le SVG.
- Le calcul est déterministe et termine par un résultat ou une erreur explicite.

## Tests à effectuer

- Exécuter la conversion spatiale de `diagram.json` et vérifier automatiquement les nombres d’éléments, les associations d’arcs et les trois listes de conflits vides.
- Tester un trajet direct, un obstacle interposé, une convergence, une boucle de retour, des arcs parallèles et un rectangle recevant plusieurs connexions sur le même côté.
- Reconstruire les polylignes avec `calculerDestination` et vérifier leurs points de départ et d’arrivée, ainsi que leur dégagement de la source et de la cible.
- Tester un échec de routage contrôlé et vérifier l’arrêt du calcul avec diagnostic ; comparer deux résultats identiques et exécuter `npm run typecheck`.
