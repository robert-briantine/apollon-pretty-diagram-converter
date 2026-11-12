# Guidage vers les cibles majeures — évolution 4

Le rendu rectangulaire possède désormais un seul repère de navigation : un
médaillon sombre bordé de cyan, avec une flèche claire pointant vers la cible.
Il se distingue des aiguilles à double pointe des tirs hostiles et des quatre
équerres des objets destructibles, même en niveaux de gris. La catégorie,
l'identifiant et la distance au joueur figurent dans la bande droite, hors
canvas. La planète reste un disque du monde ; la fenêtre n'est jamais masquée
par ce disque.

## Contrat de sélection et de placement

`src/client/jeu/guidance.ts` réunit les boss et vaisseaux mères dont `state`
vaut `actif`. Une seule enveloppe visuelle partiellement visible suffit à
masquer tout guidage, même si une autre cible hors champ est plus proche.
`isVisible` réemploie l'enveloppe `dimensions` du contrat de l'évolution 0,
la projection de caméra et le rectangle `game` de l'évolution 1. Les sprites
majeurs sont ajustés dans ces enveloppes. Le HUD est exclu ; une tangence sans
aire reste hors champ, conformément aux oracles historiques.

Sans cible visible, la distance euclidienne entre centres monde du joueur et
de chaque cible détermine le choix, puis l'ordre lexical des identifiants
stables départage les égalités. L'ordre de dessin, la catégorie et le zoom
n'interviennent pas dans cette sélection. Le dépôt ne fournit aucune métrique
moteur, aucun monde bouclé, aucune rotation de caméra. Il n'est donc pas
possible de valider un franchissement de frontière bouclée en jeu réel.

Le cap est le vecteur entre les projections écran du joueur et de la cible,
normalisé ; sa pointe est orientée avec `atan2`. Un rayon portant ce cap part
du centre du rectangle de jeu et rencontre son bord intérieur, réduit d'une
marge de 16 px CSS et du rayon de 20 px du médaillon (contour compris). Le cap
reste joueur→cible en caméra libre ; la translation de caméra détermine quelles
cibles sont visibles. La marge et le rayon diminuent dans les fenêtres
miniatures, jusqu'au cas 1×1 px. Le DPR ne change pas ces coordonnées CSS.

`RectangularView.getSnapshot().guidance` expose uniquement des valeurs copiées
(`targetId`, catégorie, distance, direction, angle, position, rayon), ou `null`.
Le calcul est refait sur l'instantané courant à chaque dessin, après `setScene`,
`setCamera`, `followPlayer` et `resize`. Il n'existe aucun cache de cible ni
référence d'entité à nettoyer. L'absence d'un joueur actif, ou un vecteur nul
entre joueur et cible superposés hors écran, produit `null` faute de cap défini.
Les instantanés et les métadonnées opaques de combat restent immuables.

## Parcours reproductible

Après `npm run build` et `npm start`, ouvrir `/jeu-demo.html` (port 3000 par
défaut). « Guidage · scène dense » charge un banc fixe avec 41 entités : douze
solides, douze tirs hostiles, douze tirs alliés, un joueur, un ennemi et trois
cibles majeures hors champ. Le repère vise `banc-boss`. Les contrôles de fond,
de niveaux de gris, d'orientation et d'effets restent disponibles.
« Planète entière » montre le cercle conservé et rend les trois cibles visibles :
la flèche disparaît. Les douze scénarios historiques restent accessibles pour
les absences de cible, les cibles inactives, les égalités et la visibilité partielle.

Les captures de ce parcours sont dans [captures/evolution4/](captures/evolution4/).
Les références des évolutions précédentes sont conservées. Examen des captures
1280×720 couleur, 360×640 gris et planète entière : sprites détaillés,
solides à équerres distincts des tirs, flèche lisible et contenue, HUD séparé,
fenêtre rectangulaire et disque planétaire conservés. Ce constat et les mesures
de pixels portent sur une démonstration de rendu, **pas sur un jeu réel**.

## Vérifications exécutées

Commandes lancées depuis la racine, le 12 novembre 2026 :

| Commande | Résultat |
| --- | --- |
| `node scripts/test.mjs jeu-guidage-plus-proche-toutes-categories-distance-monde` | 1 cas réussi, compilation incluse |
| `node --test tests/jeu-guidance.test.mjs tests/jeu-guidance-browser.test.mjs` | Première passe : 10 réussites et 1 échec de fixture, corrigé ci-dessous |
| `node scripts/test.mjs jeu-guidage-parcours-visuel-complet-scenes-effets-et-diagrammes` | Cas corrigé réussi ; relancé après amélioration du cadrage des captures |
| `npm test` | 207 cas réussis, 0 échec, 0 ignoré ; compilation serveur/client/bureau incluse |
| `npm run typecheck` | Réussi pour les trois cibles TypeScript |
| `node scripts/verify-jeu-engine.mjs` | Sortie 2 : recette moteur indisponible, aucune validation en jeu annoncée |

L'échec initial utilisait le scénario historique « partiellement-visible »
prévu pour 1280×720 dans une fenêtre carrée. Sa cible est réellement hors champ
dans ce format. Le test replace désormais la limite de la cible à 0,01 px du
bord du rectangle courant ; le comportement de visibilité n'a pas été changé.

Onze nouveaux cas exécutables séparément avec
`node scripts/test.mjs NOM_EXACT_DU_CAS` :

| Cas | Vérifications de l'évolution 4 |
| --- | --- |
| `jeu-guidage-aucune-cible-active-ni-reference` | 0, 3 : absence, inactivité, destruction, joueur absent |
| `jeu-guidage-boss-seul-hors-ecran` | 0 : boss seul, distance, unicité |
| `jeu-guidage-vaisseau-mere-seul-hors-ecran` | 0 : vaisseau mère seul |
| `jeu-guidage-plus-proche-toutes-categories-distance-monde` | 0 : union des catégories, distance joueur indépendante de la caméra |
| `jeu-guidage-egalites-identifiants-stables-sans-mutation` | 0 : permutations, entrées gelées, égalités |
| `jeu-guidage-visibilite-croisee-partielle-tangence-et-hud` | 1 : deux catégories, quatre bords, tangences et HUD |
| `jeu-guidage-huit-directions-marges-formats-camera-et-sans-hud` | 2, 4 : géométrie, huit caps, sept formats, quatre zooms, HUD optionnel |
| `jeu-guidage-douze-scenarios-oracles-evolution-zero` | 0, 1 : oracles de sélection historiques exécutés par le nouveau module |
| `jeu-guidage-instantanes-deplacements-destructions-camera-et-nettoyage` | 1, 3 : mouvements, retrait, destruction, suivi, caméra et zoom |
| `jeu-guidage-rendu-unique-huit-caps-redimensionnement-dpr-et-hud` | 0, 2, 4 : pixels réels, pointe, unicité, cinq formats, DPR 1/2 |
| `jeu-guidage-parcours-visuel-complet-scenes-effets-et-diagrammes` | 0, 1, 4, 5 : parcours UI, seize captures denses et quatre planètes, effets, retour et conversion 18 nœuds/24 arcs |

Audit : les 196 cas préexistants restent pertinents et passent. Aucune attente
n'est devenue obsolète, aucun cas n'est supprimé. Les tests de sprites,
de hiérarchie des tirs et de destructibilité conservent leur couverture.
Les scripts de découverte exécutent déjà chaque nouveau cas par son nom exact.
Les tests de conversion, import, géométrie, HTTP, interface navigateur et bureau
simulé ont été rejoués dans la suite complète.

## Intégrations indisponibles et arrêt des processus

La recette moteur nécessite le véritable moteur, son adaptateur vers `Scene`
et un script Node avec assertions/replays avant-après ; définir ensuite
`JEU_ENGINE_VERIFICATION` vers ce script et relancer
`node scripts/verify-jeu-engine.mjs`. Ces replays doivent couvrir le guidage
réel, la métrique et le bouclage éventuels, en plus des déplacements, tirs,
collisions et dégâts déjà requis. Les successions d'instantanés de test ne
simulent aucune de ces mécaniques.

La recette native Linux `node scripts/test-desktop-native.mjs` reste non
exécutée : WebKitWebDriver, Xvfb et xdotool manquent ; elle exige également le
binaire ARM64 préparé et tauri-driver. La recette Windows
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-windows.ps1`
exige Windows 10/11 x64, WebView2, l'application installée et un opérateur.
Ces indisponibilités n'affectent pas la réalisation web.

Les fixtures démarrent leurs propres serveurs sur un port éphémère et ferment
navigateur et serveur dans leurs hooks de nettoyage, y compris en cas d'échec.
Le bilan fournit les PID/ports effectivement journalisés et leur arrêt vérifié.
Aucun serveur de démonstration durable ni watcher n'a été lancé. Le pilotage
préexistant PID 3397860 est préservé. Aucun commit ni fichier de suivi modifié.
