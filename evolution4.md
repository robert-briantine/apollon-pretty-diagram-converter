# Évolution 4 — Guider vers le boss ou le vaisseau mère le plus proche

## Objectif

Afficher une flèche directionnelle vers le boss ou le vaisseau mère le plus proche lorsqu'aucune entité de ces deux catégories n'est visible à l'écran, puis valider l'ensemble des améliorations visuelles.

## Dépendances

- `evolution0.md` : catégories, identifiants stables, positions et états des cibles.
- `evolution1.md` : rectangle de jeu, transformations et visibilité.
- `evolution2.md` : direction artistique et sprites définitifs.
- `evolution3.md` : hiérarchie visuelle des objets et menaces à préserver.

## Instructions de réalisation

- Considérer ensemble les boss et les vaisseaux mères actifs et non détruits. Une entité est visible dès qu'une partie de ses limites visuelles intersecte le rectangle de jeu ; la bande d'informations ne fait pas partie de cette zone.
- Afficher la flèche uniquement si aucune cible de ces deux catégories n'est visible et s'il en existe au moins une dans le monde. Masquer la flèche dès qu'un boss ou un vaisseau mère devient visible, même si une autre cible hors écran est plus proche. Ne rien afficher s'il n'existe aucune cible valide.
- Choisir la cible la plus proche du joueur parmi les deux catégories réunies, selon la distance dans les coordonnées du monde. Utiliser la métrique du moteur si elle existe, notamment pour un monde bouclé ; sinon utiliser la distance euclidienne entre les centres. Départager les égalités par identifiant stable.
- Calculer la direction vers la cible dans la transformation de caméra utilisée pour dessiner la scène. Positionner la flèche à l'intersection de cette direction avec le bord intérieur du rectangle de jeu, avec une marge qui garde toute la flèche visible.
- Orienter la pointe vers la cible. Appliquer le style graphique du jeu tout en la distinguant des tirs et du décor ; ne pas masquer les informations de jeu.
- Actualiser sélection, direction et position après déplacement du joueur, mouvement ou destruction d'une cible, changement de caméra et redimensionnement. Retirer toute référence à une cible disparue.
- Terminer la recette sur une scène combinant planète, nouvelle caméra, sprites, objets destructibles, tirs ennemis et plusieurs cibles. Documenter les commandes réellement utilisées pour les vérifications et leurs résultats, ainsi que toute intégration au moteur encore impossible en son absence.

## Critères d'acceptation

- Aucun boss et aucun vaisseau mère visible, avec des cibles existantes : une seule flèche désigne la cible valide la plus proche, toutes catégories confondues.
- Au moins un boss ou vaisseau mère visible, même partiellement : aucune flèche de recherche n'est affichée.
- Aucune cible active : aucune flèche ni référence périmée n'est conservée.
- Les cas d'égalité donnent un résultat stable. La destruction de la cible provoque une nouvelle sélection ou le masquage de la flèche.
- La flèche indique la bonne direction pour les quatre côtés et les diagonales ; elle reste entièrement dans le rectangle de jeu après redimensionnement et hors de la bande droite éventuelle.
- La recette confirme toutes les exigences : amélioration graphique significative, beaux sprites, distinction destructibles/projectiles ennemis, vue rectangulaire étendue à la fenêtre, planète circulaire conservée et guidage conditionnel vers la cible majeure la plus proche.
- Les fonctions préexistantes sans rapport avec le jeu restent opérationnelles. En l'absence de moteur, les résultats de la scène de démonstration sont explicitement distingués d'une validation en jeu réel.

## Tests à effectuer

- Tester séparément : aucune cible ; un boss hors écran ; un vaisseau mère hors écran ; plusieurs cibles des deux types à distances connues ; distances égales. Vérifier affichage, unicité et sélection.
- Placer un boss visible et un vaisseau mère hors écran, puis inverser les catégories ; la flèche doit être masquée dans les deux cas. Refaire avec une cible partiellement visible et avec une cible juste hors du bord.
- Placer une cible au-delà de chaque côté et de chaque coin ; comparer la direction de la flèche au vecteur attendu et contrôler que toute sa surface reste dans le rectangle autorisé.
- Déplacer joueur et cibles, détruire la cible sélectionnée puis toutes les cibles ; vérifier le recalcul sans indicateur périmé. Si le monde boucle, tester aussi le passage de sa frontière.
- Redimensionner selon les formats de l'étape 1, avec la bande droite si elle est retenue ; vérifier direction, visibilité et absence de chevauchement avec les informations.
- Effectuer le parcours visuel complet avec les sprites et effets définitifs, vérifier la distinction des objets et tirs en scène dense, puis rejouer les contrôles pertinents de l'application préexistante. Arrêter uniquement les serveurs et surveillances lancés pour ces essais ; préserver les processus préexistants, dont Codex Drivers, PID 3397860 lors du découpage.
