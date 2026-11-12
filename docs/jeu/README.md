# Préparation du rendu — évolution 0

Les sprites sont désormais intégrés : consulter [le guide des sprites](sprites.md).
Le guidage conditionnel est livré : consulter [la recette finale](guidage.md).

Ce document conserve l'inventaire et le contrat préparés lors de l'évolution 0.
La vue rectangulaire est maintenant implémentée par l'évolution 1 : consulter
[le guide actuel et les recettes de vérification](vue-rectangulaire.md).
Les mentions « futur » ci-dessous décrivent l'état de cette préparation.

Livrable de préparation, sans moteur, module de rendu, sprite ni installation.
Les fichiers JSON voisins sont des données de référence, pas une simulation.
Les chemins proposés ci-dessous n'existent pas encore. Les archives `init/`
ne constituent pas une spécification de jeu.

## Inventaire constaté

Inspection du 12 novembre 2026 : aucun jeu, boucle d'animation, caméra,
sprite, commande de joueur, déplacement, collision de jeu, dégât, progression,
boss ou vaisseau mère dans `src/`, `public/` ou `src-tauri/src/`.
Il n'existe donc aucun rendu de jeu « avant » à capturer. Les vérificateurs
géométriques de diagrammes ne sont pas des collisions de jeu.

| Chemin réel | Fonction conservée |
| --- | --- |
| `public/index.html`, `public/styles.css` | Interface de conversion à `/`, sélection JSON, aperçu, liens d'ouverture et d'enregistrement, erreurs, plein écran et zoom |
| `src/client/main.ts` | Lecture du fichier, états des commandes, clavier, zoom, plein écran, reprise après erreur et libération des URL |
| `src/client/generation.ts` | `genererSvg`, requête vers `/api/generate`, délai et erreurs ; `installerActionsResultat` pour les liens navigateur |
| `src/server/index.ts`, `src/server/app.ts` | Démarrage HOST/PORT ; `creerApplication`, POST `/api/generate`, fichiers `/assets` issus de `dist/client/`, ressources de `public/` |
| `src/server/conversion.ts` | `convertirDiagramme`, `convertirJson` : import, placement, routage, trois vérificateurs puis SVG |
| `src/server/importer.ts`, `importer-document.ts`, `placement.ts`, `routage.ts`, `geometrie.ts`, `svg.ts` | Import Appolon, géométrie et présentation des diagrammes, conservés intégralement |
| `src/server/convertir.ts`, `src/server/fichiers.ts` | CLI à deux arguments, `convertirFichier`, sortie atomique et diagnostics |
| `diagram.json` | Exemple de conversion : 18 nœuds, 24 arcs ; aucune donnée de jeu |
| `src/desktop/generation.ts`, `worker.ts`, `viewer.ts`, `viewer.html` | Conversion locale dans un worker, consultation SVG, sans serveur de conversion |
| `src-tauri/src/main.rs` | Commandes natives `save_svg`, `open_svg`, dialogues et fenêtres |
| `scripts/test.mjs`, `tests/` | 168 cas conservés : import, géométrie, placement, routage, SVG, CLI, HTTP, interface web et transport desktop simulé |

Les informations existantes sont celles du convertisseur (fichier, statut,
erreur, résultat et pourcentage de zoom). Aucune vie, munition, progression
ou information de jeu n'est disponible : ne pas en inventer.

## Raccordement prévu, pas encore réalisé

Réserver `src/client/jeu/` pour un futur consommateur du contrat, avec fonctions
pures de projection et de visibilité séparées du dessin. Une future entrée
`public/jeu-demo.html`, accessible à `/jeu-demo.html`, importerait uniquement
`/assets/jeu/demo.js`, avec un lien de retour à `/`. Elle afficherait
« Démonstration de rendu — sans moteur de jeu » et un sélecteur de scénarios.
Ne pas modifier l'entrée `main.ts`, le formulaire, l'API, le SVG ni Tauri.
La compilation TypeScript existante peut inclure ce sous-dossier ; aucune
nouvelle dépendance n'est nécessaire pour ce plan. La page n'est pas livrée
dans cette préparation conformément à l'interdiction de produire du code.

Le moteur réel devra fournir des instantanés en lecture seule : identifiants,
positions, dimensions et états. Son adaptateur devra renseigner catégories,
destructibilité et origine des tirs explicitement. Le rendu n'inférera rien
du sprite. Le moteur restera seul responsable des entrées, mouvements,
collisions, dégâts, destruction, apparition, progression et informations HUD.
L'adaptateur devra documenter les unités, axes et conversions depuis le moteur.
Les dimensions ci-dessous servent au cadrage visuel, jamais à remplacer ses
volumes de collision. Sans cet adaptateur, la démonstration reste statique.

## Contrat de scène v1

`scene-reference.json` est un instantané complet, sans aléatoire, horloge,
réseau ni asset externe. Charger le fichier à neuf à chaque essai. L'ordre du
tableau n'est pas une priorité de jeu. `playerId` désigne une entité joueur.

| Champ d'entité obligatoire | Sens et contraintes |
| --- | --- |
| `id` | Chaîne non vide, unique, stable entre instantanés ; jamais un index de dessin |
| `category` | `joueur`, `decor`, `objet-destructible`, `projectile`, `boss`, `vaisseau-mere` |
| `position` | Centre `{x,y}`, nombres finis, unités du monde |
| `dimensions` | `{width,height}` strictement positifs, enveloppe visuelle alignée aux axes |
| `state` | `actif`, `inactif` ou `detruit` ; seuls les actifs sont visibles et éligibles à l'indication |
| `destructible` | Booléen explicite ; propriété du moteur, indépendante de la catégorie et de la couleur |
| `projectileOrigin` | `null` hors projectile ; sinon `{faction, emitterId}`, faction `ennemi`, `joueur` ou `neutre` et ID stable de l'émetteur |

Un projectile ennemi est donc `category=projectile` ET
`projectileOrigin.faction=ennemi`. La fixture le rend indestructible ; un moteur
pourra en fournir un destructible sans changer sa catégorie. Aucun dommage ni
score n'est défini ici. L'émetteur peut avoir quitté l'instantané : son ID reste
traçable, sans obligation de présence. Aucun champ d'apparence n'est requis.

La visibilité se calcule à partir de l'état, de l'enveloppe et de la caméra.
La distance au joueur est la distance euclidienne entre centres dans le monde,
indépendante de la visibilité, du zoom, de l'origine du tir et du dessin.

## Coordonnées et planète

Monde cartésien : x vers la droite, y vers le bas. La planète a pour centre
`(0,0)` et rayon `2400`. Un point appartient au disque si
`(x-cx)²+(y-cy)² ≤ rayon²`. La bordure circulaire reste un élément du monde ;
elle ne découpe pas la fenêtre et ne change pas les collisions. Les zones
hors disque restent visibles comme espace sombre, sans étirement sphérique.

La caméra est définie par son centre monde et son zoom positif en pixels CSS
par unité. Son repère relatif est `monde - centreCamera`, sans rotation.
Le viewport est le rectangle écran `{x,y,width,height}` hors bande HUD.
La projection à appliquer ultérieurement est :

- `sx = viewport.x + viewport.width/2 + (wx-camera.x)*zoom`
- `sy = viewport.y + viewport.height/2 + (wy-camera.y)*zoom`
- Inverse : `wx = camera.x + (sx-viewport.x-viewport.width/2)/zoom`, idem y.

Les dimensions écran sont les dimensions monde multipliées par zoom. Une
entité active est visible si son enveloppe écran a une intersection d'aire
strictement positive avec le viewport. Une simple tangence au bord est hors
champ. Une entité partiellement visible compte comme visible. Les états
inactif/détruit sont exclus ; la bande HUD ne compte jamais comme champ visible.
Ne pas borner la caméra au disque, ni supprimer ses coins rectangulaires.

Les tailles reproductibles sont dans `scenarios.json` : large 1280×720 avec
240 px de HUD, étroite 360×800 avec 72 px, grande 1920×1080 avec 240 px.
Le rectangle utilise toute la hauteur et toute la largeur restante. Le zoom
reste 1 : redimensionner révèle plus ou moins de monde, sans déformer les sprites.
Le backing store futur utilisera `devicePixelRatio` sans modifier les coordonnées
CSS ni les distances. Tester DPR 1 et 2.

`conversions-reference.json` fournit des oracles numériques indépendants du
futur renderer : centre, négatifs, déplacement caméra, zoom, décalage viewport,
points hors champ et bord de planète. Ce sont des vérifications de formule,
pas la prétendue validation d'une caméra existante.

## Direction artistique à produire ultérieurement

Style : science-fiction 2D peinte en aplats nets, vue de dessus, silhouettes
asymétriques orientables, détails mécaniques sobres. Grille de travail 16 unités ;
sources à 2× l'échelle nominale, fond transparent, pas de texte dans les sprites.
L'échelle du tableau est à zoom 1, sans relation imposée avec les collisions.

Fond espace `#080F20`, planète `#17283A`, détails de sol `#26384A`.
Contre-contour sombre `#060A12` de 2 px CSS et liseré clair de 1 px sur les
éléments interactifs ; ombre basse à 30 %, lumière supérieure gauche fixe.
Palette : joueur `#70E1F5`, destructibles `#F6CD72`, tirs ennemis `#FF738F`,
boss `#C5A0FF`, vaisseaux mères `#B8CCE8`, décor `#64788D`.
Les valeurs lumineuses de premier plan doivent présenter un contraste d'au
moins 3:1 contre le fond local ; les textes HUD 4,5:1. Vérifier également en
niveaux de gris : un code de forme subsiste pour chaque catégorie.

| Catégorie | Silhouette et taille nominale | Matière, ombre et effet prévu |
| --- | --- | --- |
| Joueur | Chevron ouvert, deux ailes séparées, 32×32 | Coque cyan claire, cockpit sombre, deux traînées courtes orientées vers l'arrière |
| Décor indestructible | Rocher arrondi irrégulier, 48×48 | Mat, contraste atténué, ombre diffuse, aucun rivet lumineux ni pulsation |
| Objet destructible | Caisse carrée aux quatre coins coupés, 32×32 | Quatre verrous clairs, bande diagonale gravée et fissures ; flash bref et débris uniquement sur événement moteur |
| Projectile ennemi | Petite aiguille pleine avec deux pointes arrière, 10×20 | Cœur blanc, halo rose contenu à 3 px, traînée effilée ; jamais une caisse ou un rocher |
| Projectile joueur | Trait court simple, 6×14 | Cœur cyan clair, une seule traînée ; origine toujours portée par les données |
| Boss | Hexagone dentelé et deux pinces, 96×80 | Plaques violettes à trois valeurs, noyau clair, ombre nette ; animation décorative sans faux indice de dégâts |
| Vaisseau mère | Longue coque à trois baies et double anneau interrompu, 200×120 | Métal bleu clair, flancs sombres, baies régulières et halo discret ; silhouette distincte du boss |

Ordre futur : fond, planète, décor, destructibles, vaisseaux, joueur,
projectiles, effets, indication puis HUD. Les halos et débris ne doivent pas
masquer les pointes des tirs ni les quatre verrous des caisses ; transparence
des effets ≤ 35 % et durée ≤ 150 ms, sans clignotement continu.
À petite taille, garder la silhouette et les marques, supprimer les détails
internes. Le scénario dense doit permettre de compter séparément chaque tir
et chaque caisse, en couleur et en gris. La lisibilité artistique réelle
restera à contrôler lorsque les sprites seront produits.

## Scènes et indication préparées

Chaque scénario charge une copie de la référence puis remplace uniquement les
champs des entités nommées dans `overrides`. Les coordonnées et dimensions sont
remplacées en entier. `include` vaut `all` ou une liste explicite d'IDs ; aucune
génération d'entités. La caméra et le viewport sont propres à chaque scénario.
`expected` est un oracle, pas un champ du contrat d'entité.

L'indication implémentée considère les boss et vaisseaux mères actifs.
Si au moins un est visible, ne pas indiquer de cible hors champ. Sinon prendre
le centre le plus proche du joueur, départager une égalité par ID lexical ;
sans candidat, aucune flèche. Sa direction est le vecteur joueur→cible projeté
dans le viewport ; son médaillon reste à 16 px du bord hors HUD, avec catégorie,
identifiant et distance monde dans la bande droite. Aucun azimut, distance ou
choix ne dépend du rayon de la planète. Voir [le contrat livré](guidage.md),
y compris l'adaptation des marges aux fenêtres miniatures.

La référence comporte plusieurs cibles, dont la plus proche n'est pas la
première dans le tableau. Les variantes couvrent : toutes catégories, amas
dense, cible partiellement visible, cible tangente hors champ, aucune cible,
cibles détruites/inactives, égalité de distances, bord de planète, tailles
étroite et grande. Les IDs et états restent stables au rechargement.

## Vérification et audit

Les attentes des 168 tests initiaux restent nécessaires : aucune attente du
convertisseur n'est rendue obsolète par ces données isolées. Le cas desktop
`desktop-worker-hors-ligne-meme-svg-18-noeuds-24-arcs-et-remplacement` a cependant
été remplacé après un échec indépendant : il envoyait Échap sans attendre
l'entrée native asynchrone en plein écran. Trois cas conservent sa couverture :
conversion locale, remplacement et export autonome ; entrée/sortie native avec
attente des états réels et formulaire cliquable ; entrée native retardée après
Échap avec reprise de conversion. Ce dernier reproduit aussi un défaut corrigé
dans `src/client/main.ts` : une entrée aboutissant après annulation doit être
refermée. Aucun code de jeu n'est ajouté par cette correction du convertisseur.
La suite comporte désormais 170 cas, découverts par le script existant, sans
changement des scripts npm. `npm test` reconstruit le serveur,
le client et les ressources desktop avant d'exécuter tous ces cas. Un seul cas
se relance avec `node scripts/test.mjs NOM_EXACT_DU_CAS`. `npm run typecheck`
contrôle les trois configurations existantes, même sans ajout de TypeScript.

Les nouveaux contrôles de préparation sont des recettes autonomes `python3 -c`
consignées avec leurs arguments complets dans le bilan remis au pilotage :
chargement identique à deux reprises et inventaire des entités ; propriétés
sémantiques sans apparence ; projections et inverses sur oracles connus ;
résolution des scénarios, visibilité, distances et choix de cible.
Ces contrôles portent sur les données et les règles documentées, sans code
de production ni script de jeu ajouté au dépôt.

Le parcours manuel web est déjà automatisé par
`ui-parcours-diagram-selection-apercu-ouverture-et-enregistrement-autonome` :
ouverture de `/`, sélection de `diagram.json`, génération, aperçu réel,
18 nœuds/24 arcs, ouverture SVG, téléchargement, réouverture hors ligne et
comparaison. Les cas UI voisins couvrent clavier, petite fenêtre, erreurs,
reprise, zoom, plein écran et remplacement. Le desktop simulé ne vaut pas une
validation native : `scripts/test-desktop-native.mjs` demande le binaire Linux
ARM64, tauri-driver, WebKitWebDriver, Xvfb, xdotool et dbus-run-session ;
`scripts/verify-windows.ps1` demande Windows 10/11 x64, WebView2, paquet installé,
PowerShell et un opérateur. Les recettes indisponibles doivent être signalées
comme non exécutées. Aucune installation n'est autorisée par cette préparation.

La distinction fondée sur les propriétés réelles, le banc dense clair/sombre
et les contrôles en gris sont décrits dans [la lisibilité des catégories](lisibilite.md).
