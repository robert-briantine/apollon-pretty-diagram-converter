# Évolution 1 — Définir les connexions et fiabiliser les vérificateurs géométriques

## Objectif

Disposer de connexions explicites dans chaque `Placement` et de vérifications géométriques fiables avant de calculer le placement et les chemins.

## Dépendances

- `evolution0.md` : contrats métier et informations importées.

## Instructions de réalisation

- Reprendre les principes de `graphe.ts` dans les modules métier et définir `Placement.connexions: Point[]` en coordonnées absolues. Conserver `p` comme origine de la boîte englobante et `dx`/`dy` comme dimensions.
- Générer exactement quatre connexions pour un losange : ses sommets haut, droite, bas et gauche. Pour un ovale, générer exactement quatre connexions à ses extrémités haut, droite, bas et gauche. Fixer et documenter un ordre stable.
- Pour un rectangle, permettre plusieurs connexions distinctes sur un même côté, réparties selon les arcs incidents et leurs indications d’ancrage. Garantir que chaque connexion appartient au contour et dédupliquer les positions identiques.
- Implémenter et vérifier `calculerDestination`, `verifierChemin`, `verifierPlacement` et `verifierPlacementChemin`, en s’appuyant sur la référence. Préserver leurs résultats sous forme de listes de conflits ; identifier suffisamment les arcs pour diagnostiquer des arcs parallèles.
- Documenter la tolérance de `verifierChemin` : la référence compare une distance au carré au paramètre de tolérance. Définir les cas de contact : `verifierPlacement` considère les boîtes qui se touchent comme en conflit ; `verifierPlacementChemin` détecte la traversée de l’intérieur d’une boîte tierce et exclut source et destination.
- Contrôler les références de sommets, indices de connexion et nombres non finis avant les vérifications, pour obtenir des diagnostics explicites plutôt que des exceptions accidentelles.

## Critères d'acceptation

- Losanges et ovales possèdent exactement quatre connexions aux positions attendues. Un rectangle peut en présenter plusieurs sur un côté sans connexion intérieure.
- Un chemin part de `connexions[idx]` et son extrémité est comparée aux connexions de sa destination.
- Les trois vérificateurs détectent respectivement une mauvaise arrivée, un chevauchement de placements et la traversée d’un placement tiers ; une configuration correcte renvoie trois listes vides.
- Les comportements aux limites et la convention de tolérance sont documentés et reproductibles.

## Tests à effectuer

- Vérifier les coordonnées des connexions pour chaque forme, avec une origine non nulle et des dimensions différentes ; tester un rectangle avec plusieurs arcs sur un même côté.
- Tester des pas horizontaux et verticaux positifs et négatifs, une bonne et une mauvaise destination, puis les valeurs juste en dessous, égale et juste au-dessus du seuil de tolérance.
- Tester des boîtes séparées, tangentes et superposées ; tester un segment traversant, longeant et touchant une boîte tierce, dans les deux sens.
- Vérifier l’exclusion de la source et de la cible, ainsi que les diagnostics pour un indice hors limites ou un sommet absent. Exécuter `npm run typecheck`.
