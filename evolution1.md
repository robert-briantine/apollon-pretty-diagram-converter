# Évolution 1 — Remplacer le champ de vision circulaire par une vue rectangulaire

## Objectif

Afficher le jeu dans une vue rectangulaire utilisant toute la fenêtre disponible, avec éventuellement une bande à droite pour les informations de jeu. Supprimer la présentation sphérique ou le masque circulaire du champ de vision tout en conservant la géométrie circulaire de la planète.

## Dépendances

- `evolution0.md` : contrat de scène, coordonnées et scènes de référence.

## Instructions de réalisation

- Définir un rectangle de jeu couvrant la largeur et la hauteur de la fenêtre. Si une bande d'informations est retenue, la placer à droite et soustraire sa largeur du rectangle de jeu ; sans bande, utiliser toute la fenêtre.
- Remplacer le cadrage sphérique et le découpage circulaire du champ de vision par une caméra rectangulaire en coordonnées du monde. Utiliser ce même rectangle pour le dessin et le calcul de visibilité.
- Conserver le cercle de la planète comme géométrie du monde, sans étirer la planète ni la remplacer par un monde rectangulaire. Aux limites du monde, afficher le fond prévu plutôt que déformer les entités.
- Préserver le comportement de suivi du joueur et les limites de déplacement lorsqu'ils existent. Appliquer une transformation commune aux sprites, effets et coordonnées d'interaction ; les commandes et les collisions doivent continuer à utiliser les coordonnées du monde.
- Recalculer dimensions, cadrage et transformations lors d'un redimensionnement ou d'un changement de densité de pixels. Conserver les proportions des sprites et éviter les zones vides dues à l'ancien masque circulaire.
- Garder les informations de jeu lisibles et hors du rectangle réservé au jeu si la bande droite est utilisée. Adapter cette bande aux fenêtres étroites sans annuler la surface de jeu.
- Exposer les limites exactes du rectangle de jeu aux évolutions suivantes, notamment pour placer la flèche hors écran sans recouvrir la bande d'informations.

## Critères d'acceptation

- Les quatre coins du rectangle de jeu peuvent afficher le monde ou son fond ; aucun masque circulaire ne limite la vision.
- À toute taille testée, le rectangle de jeu et l'éventuelle bande droite occupent ensemble la fenêtre sans débordement ni marge héritée de l'ancienne vue.
- La planète reste circulaire dans les coordonnées du monde ; une même entité conserve ses proportions à l'écran.
- Les éléments affichés, leur visibilité et les interactions utilisent une transformation cohérente après déplacement et redimensionnement.
- Les informations de jeu existantes restent accessibles, avec ou sans bande droite.

## Tests à effectuer

- Examiner la scène aux formats 1280 × 720, 1920 × 1080, 800 × 800 et 360 × 640, puis redimensionner pendant l'affichage.
- Placer des entités dans chacun des quatre coins visibles, au centre et juste hors du rectangle ; vérifier le dessin et le résultat du calcul de visibilité.
- Déplacer la caméra jusqu'aux limites de la planète : contrôler la conservation du cercle du monde, l'absence de masque circulaire et l'absence de déformation.
- Vérifier les conversions monde/écran aller-retour sur des points connus et les interactions disponibles avant et après redimensionnement.
- Si la bande droite est utilisée, vérifier son absence de chevauchement avec le jeu et la conservation d'une surface de jeu positive sur fenêtre étroite.
