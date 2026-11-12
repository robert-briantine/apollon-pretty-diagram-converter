# Distinguer les destructibles et les tirs ennemis — évolution 3

Après `npm run build` puis `npm start`, ouvrir `/jeu-demo.html` et cliquer
« Lisibilité · scène dense ». Le banc comporte 40 entités à l'échelle 1:1 :
décor mat, solides intacts et endommagés, joueur, ennemi, boss, vaisseau mère,
12 tirs ennemis et 12 tirs du joueur. Les tirs passent à quelques pixels des
solides. Les commandes de fond clair/sombre et de niveaux de gris permettent
le même examen sans sélection ni lecture d'identifiants. Le banc reste entier
à 360×640 ; le zoom, le déplacement et le redimensionnement restent disponibles.
Il s'agit d'instantanés de contrôle, pas d'une simulation de combat.

## Signes visuels et données réelles

| Donnée de scène | Traitement |
| --- | --- |
| Solide avec `destructible: true` | Quatre équerres claires avec contre-contour sombre, matière conservée |
| Solide avec `destructible: false` | Aucune équerre ; une ancienne catégorie `objet-destructible` contradictoire prend la roche mate sans verrous |
| `damageState: 'endommage'` et destructible | Fissure centrale persistante ; les quatre équerres restent intactes |
| Projectile d'origine `ennemi` | Aiguille à double pointe, cœur clair, contre-contour sombre ; orientation fournie dans la présentation |
| Projectile d'origine `joueur` | Trait simple avec une traînée ; pas de double pointe |
| Projectile d'origine neutre/absente | Losange neutre, sans assimilation à un tir joueur/ennemi |
| Projectile destructible, quelle que soit son origine | Même silhouette de tir, deux petits verrous latéraux secondaires ; jamais les quatre équerres d'un solide |

`damageState?: 'intact' | 'endommage'` est un champ optionnel de l'instantané
fourni par l'adaptateur moteur. Son absence représente l'aspect intact. Le
renderer ne déduit pas des dégâts d'un flash d'impact et ne calcule ni points
de vie, ni collisions. Un état endommagé ne suffit pas à rendre un objet
destructible. L'origine provient exclusivement de `projectileOrigin.faction`,
pas de l'ID, de la proximité ou de la présence de l'émetteur. Elle reste la même
dans les instantanés successifs de la trajectoire. L'adaptateur fournit l'angle
en radians dans `setPresentation` ; les positions seules ne donnent pas une
vitesse. Les présentations sont conservées entre instantanés du même ID de
scène, et vidées lors d'un changement d'ID de scène pour éviter les effets
résiduels. L'animation de destruction fait disparaître ensemble sprite et
marques, sans retirer l'entité des données.

Le contre-contour sombre et les marques claires restent visibles sur les deux
fonds, aussi en gris. L'impact d'un solide destructible reprend une forme
carrée, avec éclats et débris contenus. Aucun changement de cible, de dégât ou
de collision n'est introduit. Les métadonnées opaques du moteur sont conservées.

Les objets et leurs effets passent avant tous les projectiles ; les tirs ennemis
passent après les tirs joueur/neutre, quel que soit l'ordre des entités fourni.
Ils conservent leur taille en tournant, sans réduction pour rentrer dans
l'enveloppe logique. Leur échelle visuelle ne descend pas sous 8×16 px CSS
pour l'aiguille non tournée. Cela maintient un signe
lisible au dézoom sans changer les dimensions logiques, le culling, la sélection
ou les volumes de collision. Le viewport continue de tronquer les sprites aux
bords. Les effets restent à 35 % d'opacité ajoutée maximum, pendant la transition
conventionnelle de 150 ms. Dans le banc dense, cette transition s'applique aux
solides ; les tirs voisins continuent d'être affichés.

## Vérification reproductible

`npm test` compile et découvre automatiquement les cinq nouveaux cas de
`tests/jeu-readability.test.mjs`. Chacun peut être relancé indépendamment avec
`node scripts/test.mjs NOM_DU_CAS`, même sans `dist/` :

- `jeu-lisibilite-scene-dense-couleur-gris-fonds-et-quatre-formats` : 40 entités,
  échelle réelle, proximité, cadrage, contre-contours et valeurs lumineuses,
  captures aux quatre formats, en couleur/gris et sur fond clair/sombre.
- `jeu-lisibilite-proprietes-reelles-degats-origines-et-double-identite` : matrice
  des catégories, destructibilité, dégâts et trois origines, rendus réellement
  différents selon les propriétés ; masques binaires indépendants des couleurs,
  marques secondaires sur les tirs destructibles et émetteur absent.
- `jeu-lisibilite-tirs-prioritaires-effets-trajectoire-redimensionnement-et-zoom` :
  480 observations raster : tous les pixels opaques du tir restent devant
  les impacts/destructions et tirs du
  joueur, ordre d'entrée défavorable, trajectoire, quatre angles, quatre zooms,
  trois formats/DPR, animation complète de 150 ms.
- `jeu-lisibilite-instantanes-geles-changement-scene-et-metadonnees-combat` :
  entrées profondément gelées, dégâts, déplacement, tir destructible, changement
  de scène et retour sans effet résiduel ; aucune mutation des données de combat.

- `jeu-lisibilite-orientations-limites-visuelles-selection-et-disparition` :
  neuf variantes dans cinq orientations, limites de dessin, disparition finale
  et sélection logique inchangée, y compris les tirs ennemis tournés.

Les captures sont régénérées dans [captures/evolution3/](captures/evolution3/).
Les captures des évolutions précédentes restent des références historiques.
L'examen des PNG complète les assertions de géométrie, de contraste et de raster.

L'audit conserve la géométrie, les pivots, la sélection, la disparition finale
et les contrats du convertisseur. Un cas est effectivement remplacé :
`jeu-sprites-orientations-toutes-categories-enveloppes-et-disparition` dans
`tests/jeu-sprites.test.mjs` supposait que le tir hostile rétrécit en tournant
pour rentrer dans son enveloppe logique. Cette attente est obsolète avec sa
taille visuelle constante, nécessaire à sa lisibilité. Le nouveau cas
`jeu-lisibilite-orientations-limites-visuelles-selection-et-disparition` conserve
les 45 combinaisons, les limites des huit autres variantes, la disparition et
la sélection ; il mesure les limites orientées du tir hostile. Le cas des
480 observations vérifie en plus son minimum visuel au dézoom et ses pixels
opaques pendant tous les effets. La nouvelle matrice couvre aussi les
propriétés contradictoires absentes des fixtures historiques, sans modifier ces
fixtures. Les scripts existants découvrent déjà les nouveaux tests.

Le dépôt n'a toujours aucun moteur de combat. `node scripts/verify-jeu-engine.mjs`
reste une recette **non exécutée** pour les collisions/destructions réelles :
fournir le moteur, l'adaptateur et un script Node de replays avec assertions
avant/après, puis définir `JEU_ENGINE_VERIFICATION` vers ce script. Sans ce
prérequis la recette retourne 2, jamais une réussite. Les tests locaux de données
immuables ne remplacent pas ce replay. Les recettes natives Linux/Windows du
convertisseur demeurent également soumises à leurs plateformes et dépendances.
