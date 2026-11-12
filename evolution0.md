# Évolution 0 — Préparer le rendu du jeu et sa direction graphique

## Objectif

Préparer une amélioration significative des graphismes du jeu : de beaux sprites cohérents, des objets destructibles immédiatement reconnaissables face aux projectiles ennemis, une vue rectangulaire occupant la fenêtre et une indication de la cible majeure la plus proche lorsqu'aucun boss ni vaisseau mère n'est visible.

Le dépôt inspecté contient actuellement un convertisseur de diagrammes, sans moteur de jeu identifié. Préparer une intégration isolée et vérifiable sans transformer cette application ni inventer des règles de jeu étrangères au besoin.

## Dépendances

Aucune

## Instructions de réalisation

- Identifier les éventuels points d'entrée, ressources et systèmes de jeu disponibles au moment de la réalisation. Consigner les chemins réels et les fonctions conservées : commandes, déplacements, collisions, dégâts, progression et informations affichées lorsqu'ils existent.
- Si aucun moteur n'est disponible, préparer un module de rendu isolé, par exemple sous `src/client/jeu/`, et une scène de démonstration dédiée accessible sans remplacer l'interface de diagrammes. Cette scène sert à valider les exigences visuelles ; elle ne doit pas être présentée comme un jeu complet. Documenter le raccordement restant au moteur réel.
- Définir un contrat de scène indépendant du dessin : identifiant stable, catégorie, position et dimensions dans le monde, état actif/détruit, caractère destructible et origine des projectiles. Distinguer explicitement joueur, décor, objet destructible, projectile ennemi, boss et vaisseau mère. Conserver les règles de collision du moteur lorsqu'il existe.
- Définir les coordonnées du monde, celles de la caméra et celles de l'écran, ainsi que les limites circulaires de la planète. La forme du monde et celle de la fenêtre de vision sont deux notions distinctes.
- Établir une direction artistique concrète : palette, silhouettes par catégorie, échelle des sprites, contours, ombrages, effets et niveaux de contraste avec le fond. Prévoir une différenciation par forme, en complément de la couleur.
- Préparer des scènes reproductibles couvrant chaque catégorie, un regroupement dense d'objets et de tirs, plusieurs boss/vaisseaux mères, l'absence de cible, les bords de planète et différentes tailles de fenêtre. Conserver une référence visuelle avant amélioration lorsqu'un rendu de jeu existe.
- Ces fichiers décrivent des travaux futurs : pendant le présent découpage, ne produire aucun code, sprite ou installation. Lors de leur réalisation, préserver `evolution.md`, les fichiers de pilotage et les fonctions préexistantes sans rapport avec le jeu ; ne pas réutiliser les anciennes évolutions conservées sous `init/` comme spécification du jeu.

## Critères d'acceptation

- Les points d'intégration et l'éventuelle absence de moteur sont documentés sans supposer des fichiers de jeu inexistants.
- Une scène de référence reproductible expose toutes les catégories nécessaires aux évolutions suivantes, avec des identifiants et positions connus.
- Le contrat permet de déterminer séparément la destructibilité d'un objet, l'origine d'un tir, la visibilité d'une entité et sa distance au joueur.
- La direction artistique indique un traitement concret pour chaque catégorie et une règle de lisibilité indépendante de la seule couleur.
- L'application de diagrammes conserve son accès et son comportement ; aucune mécanique de jeu existante n'est remplacée par le banc de démonstration.

## Tests à effectuer

- Charger la scène de référence deux fois et vérifier les mêmes entités, positions, catégories et états.
- Contrôler des exemples séparés d'objet destructible, de décor indestructible et de projectile ennemi : leurs propriétés ne doivent pas être déduites uniquement de leur apparence.
- Vérifier la cohérence des conversions monde/écran avec quelques positions connues avant d'introduire la nouvelle caméra.
- Ouvrir l'application préexistante et vérifier son parcours de conversion. Lors de la future réalisation, exécuter les contrôles existants pertinents, notamment `npm run typecheck` si du TypeScript est ajouté.
