# Évolution 4 — Transformer le graphe spatial en SVG de présentation

## Objectif

Transformer le `SpaceGraphe` validé en document SVG autonome, soigné, complet et lisible.

## Dépendances

- `evolution3.md` : graphe spatial complet, vérifié et associé aux libellés.

## Instructions de réalisation

- Créer une fonction de rendu TypeScript qui reçoit le graphe spatial et les libellés associés, puis retourne une chaîne SVG avec l’espace de noms SVG.
- Dessiner les rectangles, les losanges et les ovales selon leurs placements et dimensions finales. Dessiner les chemins à partir des connexions et des pas calculés, avec des flèches indiquant la direction des arcs.
- Afficher tous les libellés des nœuds et des arcs, notamment les branches « oui » et « non ». Réutiliser les règles de disposition du texte établies lors du placement, sans redimensionner les formes après le routage.
- Appliquer une présentation cohérente : typographie lisible, couleurs contrastées, contours et flèches homogènes, textes centrés dans leur forme et libellés d’arcs placés à distance des formes et des autres textes. Corriger les collisions de libellés sur le diagramme fourni.
- Calculer un `viewBox` englobant formes, textes, chemins et pointes de flèche, avec une marge extérieure, même en présence de coordonnées négatives.
- Échapper les textes et attributs issus des données afin qu’ils restent du contenu SVG et ne deviennent pas du balisage exécutable. Garder styles et ressources nécessaires dans le SVG pour une ouverture autonome.

## Critères d'acceptation

- Le document est un SVG XML valide et autonome représentant tous les sommets, tous les arcs orientés et tous leurs libellés.
- Le SVG de `diagram.json` s’ouvre dans un navigateur, sans coupure aux bords, texte tronqué ni libellé masqué par une forme.
- Les rectangles, losanges et ovales sont reconnaissables ; les flèches atteignent les contours aux connexions calculées.
- Les caractères accentués, retours à la ligne et caractères réservés XML sont correctement restitués.
- Le rendu n’altère pas les placements et chemins validés.

## Tests à effectuer

- Générer le SVG de `diagram.json`, le parser comme XML/SVG et vérifier la présence des éléments associés aux 18 nœuds et aux 24 arcs, avec leurs libellés.
- Ouvrir le SVG dans un navigateur à sa taille normale et agrandi ; contrôler la lisibilité, les branches, les retours, les textes longs, les flèches et les marges.
- Tester des coordonnées négatives et des chemins dépassant les formes ; vérifier que leur rendu reste dans le `viewBox`.
- Tester des libellés contenant `&`, `<`, `>`, guillemets et une chaîne ressemblant à une balise ; ils doivent être affichés comme texte. Vérifier l’ouverture sans ressource externe et exécuter `npm run typecheck`.
