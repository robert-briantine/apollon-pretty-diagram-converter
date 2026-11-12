# Vue rectangulaire — évolution 1

Après `npm run build` puis `npm start`, ouvrir
<http://127.0.0.1:3000/jeu-demo.html>. L'application de diagrammes reste à `/`.
La démonstration indique explicitement l'absence de moteur. Elle utilise les
instantanés de l'évolution 0, copiés vers `dist/client/jeu/data/` par la compilation,
sans modifier les fichiers sources. Aucun asset externe ni dépendance ajoutée.

Le sélecteur charge les douze scènes préparées. Glisser la vue ou employer
les flèches du clavier après avoir focalisé le canvas pour déplacer la caméra.
Les boutons +/− (ou les touches +/−) modifient son zoom ; « Recadrer » recharge
le cadrage du scénario, « Planète entière » montre le disque complet.
Cliquer une enveloppe affiche son identifiant, sa catégorie et sa position monde.
« Suivre le joueur » centre la caméra sur sa position, y compris lors de la
réception d'un nouvel instantané ; déplacer manuellement la caméra libère le suivi.
Les rectangles colorés sont les enveloppes de référence : les sprites et la
flèche de cible relèvent des évolutions suivantes.

Le jeu occupe toute la hauteur et la largeur restante après la bande droite.
Sa largeur vaut `largeurFenêtre − min(240, floor(largeurFenêtre × 0.2))` en pixels CSS.
Cela donne 240 px de bande à 1280/1920 px, 160 px à 800 px et 72 px à 360 px.
La bande reste hors canvas ; ses informations et commandes restent accessibles
par défilement vertical sur petite fenêtre. Aucun HUD de jeu (vie, score, etc.)
n'existait dans le dépôt : les informations du convertisseur sont conservées
dans leur interface et les informations d'inspection sont dans la bande.

`src/client/jeu/camera.ts` fournit `layout`, `worldToScreen`, `screenToWorld`,
`screenBounds`, `worldBounds`, `isVisible` et `pickEntity`. Tous emploient le même
rectangle et les unités CSS, sans DPR. Les formules et la tangence exclue restent
conformes au contrat v1. Le rayon de planète 2400 est une géométrie du monde,
jamais un masque. Le fond espace remplit les zones hors disque. La caméra est
libre, car aucun moteur ni limite de déplacement de joueur n'existe ici.
Le zoom est uniforme sur les deux axes. Une densité d'écran différente change
uniquement le backing store ; les coordonnées et les interactions sont stables.

`RectangularView` dans `renderer.ts` consomme un `Scene` par `setScene`.
`setCamera({x,y,zoom})`, `followPlayer(bool)` et `resize(width,height,dpr,withHud)`
pilotent sa présentation sans modifier les données. `getSnapshot()` expose des
copies exactes de `game`, `hud`, `world`, `camera`, `dpr` et des IDs visibles.
Les évolutions suivantes doivent placer les éléments en bord d'écran dans
`game` et exclure `hud` ; elles ne doivent pas reconstruire ces limites.
`inspect` est une sélection des enveloppes visuelles, pas une collision de jeu.
Les effets futurs doivent utiliser la même projection que les entités.

Le futur moteur fournira les positions, états, collisions et événements réels,
puis appellera `setScene` sur ses instantanés et activera éventuellement le suivi.
La démonstration n'ajoute ni déplacement de joueur, ni dégâts, ni tirs simulés.
L'observation de taille et la veille DPR sont arrêtées à la sortie de la page.

`npm test` compile et exécute les 170 cas préexistants et les dix nouveaux cas.
Chaque nouveau cas est relançable indépendamment :
`node scripts/test.mjs NOM_EXACT_DU_CAS`. Le script découvre aussi les nouveaux
fichiers et prépare les scènes même si `dist/` est absent. `npm run typecheck`
vérifie les trois cibles TypeScript.

Les quatre cas de `tests/jeu-camera.test.mjs` contrôlent la partition avec/sans
bande, les oracles de conversion, les coins/tangences/états et les scènes
reproductibles sans mutation. Les six cas de `tests/jeu-browser.test.mjs`
automatisent les parcours visuels demandés : 1280×720, 1920×1080, 800×800,
360×640, redimensionnement à chaud, dessin effectif des coins et du centre,
entités hors champ et partiellement visibles, mesure des deux diamètres de
planète, fond aux quatre bords du monde, conservation des proportions, clics,
glissement, clavier, suivi et DPR 1/1.5/2 sans changement de dimensions CSS.
Les assertions de pixels portent sur le rendu réel et non sur une image simulée.
Pour conserver les captures : définir `JEU_SCREENSHOT_DIR` avant `npm test`.

Audit : aucune attente du convertisseur ni des données de préparation ne devient
obsolète ; aucun test supprimé. Les recettes Python du bilan de l'évolution 0
restent applicables aux données inchangées. Le bureau simulé reste couvert par
la suite. Les recettes natives conservées nécessitent Linux ARM64 avec
WebKitWebDriver/Xvfb/xdotool, ou Windows 10/11 x64 avec WebView2, application
installée, PowerShell et opérateur. Elles ne valident pas la démonstration web.
