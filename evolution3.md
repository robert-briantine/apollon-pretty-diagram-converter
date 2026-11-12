# Évolution 3 — Distinguer les objets destructibles des projectiles ennemis

## Objectif

Permettre au joueur de reconnaître immédiatement les éléments qu'il peut détruire et de les différencier des projectiles envoyés par les ennemis, même dans une scène dense.

## Dépendances

- `evolution0.md` : propriétés de destructibilité et d'origine des projectiles.
- `evolution1.md` : espace de jeu rectangulaire.
- `evolution2.md` : sprites et effets graphiques intégrés.

## Instructions de réalisation

- Associer aux objets destructibles un langage visuel stable : silhouette ou contour caractéristique, matière et retour d'impact cohérents. Ne pas appliquer ces signes au décor indestructible.
- Donner aux projectiles ennemis une forme, une orientation et, si utile, une traînée propres, clairement différentes des objets destructibles et des tirs du joueur. Utiliser la couleur comme renfort et conserver au moins un indice de forme ou de mouvement distinctif.
- Déduire ces traitements des propriétés de scène et de l'origine réelle du tir. Un tir conserve son identité visuelle pendant toute sa trajectoire et un objet conserve sa lisibilité dans ses états endommagés.
- Ajuster taille apparente, contours et ordre de dessin pour éviter que les tirs ennemis disparaissent derrière des effets ou que les objets destructibles se confondent avec le fond.
- Préserver les règles de combat : cette distinction visuelle ne rend pas automatiquement les projectiles destructibles et ne change pas les cibles que les tirs ennemis peuvent endommager.
- Si un projectile est lui-même destructible selon le moteur, conserver simultanément son identité de tir ennemi et un signe secondaire de destructibilité ; documenter cette combinaison pour éviter une catégorie ambiguë.

## Critères d'acceptation

- Dans une scène mêlant décor, objets destructibles, tirs du joueur et projectiles ennemis, chaque catégorie reste identifiable sans sélectionner l'entité ni lire un identifiant technique.
- Un objet destructible et un projectile ennemi possèdent au moins un signe distinctif autre que la couleur ; cette différence reste perceptible en niveaux de gris.
- Les traitements correspondent aux propriétés réelles, y compris après dégâts, déplacement et changement de scène.
- Les effets d'impact et de destruction ne masquent pas durablement les projectiles ennemis à proximité.
- Les possibilités de destruction, les collisions et les dégâts restent conformes aux règles antérieures lorsqu'un moteur est présent.

## Tests à effectuer

- Construire une scène dense contenant au moins un exemplaire de chaque catégorie, avec des projectiles passant près d'objets destructibles et du décor ; vérifier l'identification à l'échelle réelle.
- Examiner les mêmes captures en couleur et en niveaux de gris, sur fond clair puis sombre, pour contrôler les indices autres que la couleur.
- Comparer l'apparence aux données de scène : destructible ou non, projectile ennemi ou joueur, état intact ou endommagé.
- Observer les tirs pendant les effets d'impact et de destruction, puis après redimensionnement ; vérifier leur visibilité et la continuité de leur apparence.
- Rejouer les cas existants de destruction et de collisions, ainsi que celui d'un projectile destructible si cette mécanique existe ; vérifier qu'aucune règle n'a changé.
