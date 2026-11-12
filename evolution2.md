# Évolution 2 — Réaliser et intégrer des sprites soignés

## Objectif

Améliorer significativement la qualité visuelle du jeu grâce à des sprites travaillés et cohérents, lisibles dans la nouvelle vue rectangulaire.

## Dépendances

- `evolution0.md` : direction artistique, catégories d'entités et scènes de référence.
- `evolution1.md` : caméra rectangulaire et échelle d'affichage.

## Instructions de réalisation

- Créer ou retravailler les sprites des catégories présentes : joueur, ennemis, boss, vaisseaux mères, objets destructibles, projectiles et décor de planète. Prévoir des silhouettes distinctes pour les boss et les vaisseaux mères.
- Appliquer la palette, les contours, les volumes, l'ombrage et les détails définis à l'étape 0. Fournir des fonds transparents pour les sprites qui se superposent au monde et éviter les bordures opaques parasites.
- Intégrer les ressources dans le rendu du jeu avec des pivots, dimensions et orientations explicites. Conserver la correspondance entre position logique et position dessinée, ainsi que les zones de collision et règles de dégâts existantes.
- Préserver et harmoniser les animations existantes ; améliorer les retours visuels de déplacement, tir, impact et destruction lorsqu'ils correspondent à des actions du jeu. Si aucun moteur n'est disponible, montrer ces états dans la scène dédiée sans créer de nouvelles règles de combat.
- Travailler le fond et les effets pour soutenir les sprites : conserver une hiérarchie visuelle qui laisse les menaces et les objets interactifs lisibles, y compris en scène chargée.
- Utiliser des ressources locales correctement référencées et documenter leur origine ainsi que leurs droits d'utilisation. Éviter le chargement de ressources externes indispensable à l'affichage.
- Produire des comparaisons de scènes identiques avant/après lorsqu'une référence existe ; sinon présenter une planche des sprites et leurs captures intégrées à l'échelle réelle.

## Critères d'acceptation

- Chaque catégorie présente possède un sprite final cohérent avec la direction artistique ; aucun élément central ne reste un substitut provisoire sans traitement graphique.
- Les boss, vaisseaux mères, ennemis et joueur restent identifiables par leur silhouette à l'échelle de jeu, sans dépendre d'un libellé.
- Les captures montrent des contours propres, des volumes et des détails visibles à l'échelle réelle ; aucune ressource ne présente de fond opaque indésirable ou de coupure accidentelle.
- Les sprites restent proportionnés et lisibles dans les formats de fenêtre de l'étape 1.
- Les changements visuels ne modifient ni les positions logiques, ni les collisions, ni les valeurs de dégâts existantes ; les ressources se chargent sans erreur.

## Tests à effectuer

- Afficher une planche de toutes les catégories puis la scène de référence aux différentes tailles prévues ; examiner silhouettes, transparence, netteté et cohérence de style.
- Comparer avant/après sur la même scène, le même cadrage et la même échelle, ou contrôler la planche intégrée en l'absence de rendu antérieur.
- Observer les orientations et états animés disponibles, notamment impact et destruction : vérifier les pivots, l'absence de saut de position et les transitions.
- Charger la scène sans accès aux ressources distantes ; vérifier l'absence de sprite manquant et d'erreur de chargement.
- Avec le moteur réel, rejouer les cas de déplacement, tir et collision préexistants pour confirmer l'identité des résultats logiques.
