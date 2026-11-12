# Diagrammes d’activité — Génération SVG

Application Node.js, TypeScript et Express, avec une interface HTML/CSS et
TypeScript natif, sans framework frontend. Prérequis : Node.js 22 ou supérieur
et npm.

Le besoin actuellement enregistré dans `evolution.md` concerne un jeu. Cette
intervention conserve l’application de diagrammes préexistante et réutilise son
socle technique. Les sprites, la vue rectangulaire, la distinction des éléments
destructibles et les indicateurs de boss/vaisseau mère restent à réaliser dans
les évolutions ultérieures. `evolution.md` est conservé sans modification et
aucun nouveau découpage du besoin n’est créé.

## Commandes

Depuis la racine du projet :

```sh
npm run setup       # Installation reproductible des dépendances (npm ci)
npm run typecheck   # Vérification des types serveur, navigateur et bureau, sans émission
npm run check:static # Compilation et vérification HTTP/navigateur des fichiers statiques
npm test            # Compilation et tests métier, SVG, conversion Node.js et HTTP
npm run dev         # Compilation initiale, surveillance TS et redémarrage serveur
```

Le serveur écoute par défaut sur <http://127.0.0.1:3000>. Les modifications HTML
et CSS sont servies directement ; rechargez la page après une modification de
l’interface. Arrêtez le mode développement avec Ctrl+C, qui arrête également
ses processus de surveillance.

Pour compiler et démarrer sans surveillance :

```sh
npm run build
npm start
```

Le démarrage nécessite une compilation préalable. Conservez `public/`,
`dist/`, `package.json` et les dépendances installées pour exécuter l’application.
Le serveur ne publie que `public/` et le JavaScript compilé dans `dist/client/`.

Variables d’environnement (exemple pour un shell POSIX) :

```sh
HOST=0.0.0.0 PORT=8080 npm start
# Les mêmes variables sont acceptées par npm run dev.
```

`HOST` vaut `127.0.0.1` par défaut et `PORT` vaut `3000`. `PORT=0` demande
un port libre au système ; l’adresse effective est affichée au démarrage.

`npm run check:static` réutilise le contrôle HTTP existant : il démarre un
serveur temporaire avec `HOST=127.0.0.1` et `PORT=0`, depuis un autre répertoire,
vérifie le contenu et les types MIME du HTML, du CSS et des deux modules
JavaScript compilés, puis charge l’interface dans Chromium. Le navigateur et
le serveur temporaire sont arrêtés en fin de contrôle, même en cas d’échec.
Si Chromium est absent, installer le navigateur de test avec
`npx playwright install chromium` avant de relancer cette commande.

## Organisation

- `src/server/index.ts` : serveur Express → `dist/server/`.
- `src/server/app.ts` : application Express, route de génération et erreurs JSON.
- `src/server/graphe.ts` : contrats métier basés sur la référence `graphe.ts`.
- `src/server/importer.ts` : import et validation du JSON Appolon JS.
- `src/server/connexions.ts` : connexions absolues à une origine fournie.
- `src/server/geometrie.ts` : calcul des destinations, validation et conflits.
- `src/server/placement.ts` : disposition des formes, sans routage.
- `src/server/routage.ts` : assemblage du graphe spatial et routage orthogonal.
- `src/server/texte.ts` : composition et dimensionnement partagés avec le futur rendu.
- `src/server/svg.ts` : rendu SVG autonome du graphe spatial validé.
- `src/client/main.ts` : code navigateur → `dist/client/`, servi sous `/assets/`.
- `public/` : page HTML et feuille de style.
- `tsconfig.server.json` et `tsconfig.client.json` : compilations strictes séparées,
  avec respectivement les types Node.js et DOM.
- `evolution.md`, `graphe.ts`, `diagram.json` et `prompt.md` : fichiers préexistants
  conservés à l’identique. Les modules métier sous `src/server/` sont inclus
  dans la compilation stricte du serveur.

## Import métier — évolution 0

Les fonctions `importerDiagramme(objet: unknown)`, `parserDiagramme(texte: string)`
et `importerFichierDiagramme(chemin)` retournent un `Graphe` (une promesse pour
la lecture du fichier). Exemple après `npm run build`, depuis la racine :

```js
import { importerFichierDiagramme } from './dist/server/importer.js';
const graphe = await importerFichierDiagramme('diagram.json');
console.log(Object.keys(graphe.sommets).length, graphe.arretes.length); // 18, 24
```

Correspondances prises en charge :

| Type Appolon JS | `Forme.type` |
| --- | --- |
| `activityActionNode` | `rectangle` |
| `activityDecisionNode` | `losange` |
| `activityMergeNode` | `losange` |
| `activityInitialNode` | `ovale` |
| `activityFinalNode` | `ovale` (double contour de fin) |

Les arcs doivent être de type `ActivityControlFlow`. Tout autre type de nœud
ou d'arc produit `TYPE_NON_PRIS_EN_CHARGE` ; aucun élément n'est ignoré.
`nodes` et `edges` sont obligatoires et peuvent être vides. Les identifiants
sont des chaînes non vides et uniques dans l'ensemble du document (nœuds et
arcs). Chaque source/cible doit désigner un nœud existant.

Les dimensions obligatoires `width` et `height` deviennent `dx` et `dy` sans
redimensionnement ; elles doivent être finies et strictement positives. Les
dimensions `measured`, si présentes, sont également validées et conservées.
Les positions facultatives acceptent des coordonnées finies, y compris négatives.
Les libellés viennent de `node.data.name` et `edge.data.label` (chaîne vide en
leur absence) et sont conservés exactement, avec accents et retours à la ligne.
Pour un nœud initial, le nom technique par défaut `ActivityInitialNode` (ou un
nom absent/vide) est remplacé par **Début**. Un nom personnalisé reste intact,
et le document source complet reste conservé dans les métadonnées.

`Graphe.sommets` est indexé par identifiant, y compris pour des clés comme
`__proto__`. `Graphe.arretes` conserve l'ordre, les identifiants, l'orientation,
les cycles et les arcs parallèles. `Chemin.arcId` associera chaque futur chemin
à `A.id` et donc à son libellé ; `Chemin.idx` désigne exclusivement un indice de
connexion dans le placement source.

`Forme.position`, `A.sourceHandle`, `A.targetHandle`, `A.sourceAnchor`,
`A.targetAnchor` et `A.points` exposent les indications spatiales d'origine.
Les handles sont des chaînes libres ou `null` ; les ancres comportent un côté
`top`, `right`, `bottom` ou `left` et un ratio fini dans [0, 1]. Handles et ancres
sont conservés séparément, même lorsqu'ils indiquent des côtés différents.
Les points intermédiaires conservent leur ordre. Les champs `metadata` de
chaque forme et arc gardent leur objet JSON source complet ; `Graphe.metadata`
contient les autres propriétés du document. Toutes ces données sont copiées
sans alias vers l'entrée ; ni l'objet reçu ni le fichier source ne sont modifiés.

Les diagnostics `ErreurImportDiagramme` exposent un `code`, un `chemin` précis
(par exemple `$.edges[0].target`) et un message en français. Ils distinguent
`JSON_INVALIDE`, `STRUCTURE_INVALIDE`, `IDENTIFIANT_INVALIDE`,
`IDENTIFIANT_DUPLIQUE`, `REFERENCE_ABSENTE`, `DIMENSION_INVALIDE` et
`TYPE_NON_PRIS_EN_CHARGE`. Les erreurs d'accès au fichier conservent leur code
Node.js d'origine.

`SpaceGraphe` est le nom de la référence pour le « SpatialGraphe » du besoin.
Les contrats `Placement`, `Point`, `Pas` et `Chemin` préparent les futures étapes.
`Placement.connexions` contient des points absolus : quatre points cardinaux
pour un losange ou un ovale, plusieurs points possibles sur les côtés d'un
rectangle. Leur génération est réalisée par l'évolution 1 décrite ci-dessous.

## Connexions et géométrie — évolution 1

Les fonctions sont exportées depuis `src/server/graphe.ts` (et leurs modules
respectifs). `creerPlacement(forme, p, arcs)` crée un placement à l'origine
fournie ; `genererConnexions(forme, p, arcs)` retourne seulement ses points.
`p` reste le coin supérieur gauche de la boîte, `forme.dx` et `forme.dy` ses
dimensions. Aucun calcul de disposition ni de routage n'est effectué ici.
L'origine est copiée et les entrées ne sont pas modifiées.

Pour un losange ou un ovale, il y a exactement quatre connexions absolues,
indépendamment du nombre d'arcs, dans cet ordre stable :

| Indice | Position | Coordonnées |
| --- | --- | --- |
| 0 | Haut | `(p.x + dx/2, p.y)` |
| 1 | Droite | `(p.x + dx, p.y + dy/2)` |
| 2 | Bas | `(p.x + dx/2, p.y + dy)` |
| 3 | Gauche | `(p.x, p.y + dy/2)` |

Pour un rectangle, fournir les arcs du graphe (seuls les incidents à `forme.id`
sont utilisés). Chaque extrémité d'arc constitue une demande, donc une boucle
en constitue deux. L'ancre explicite source/cible impose son côté et son ratio ;
sinon un handle exactement égal à `top`, `right`, `bottom` ou `left` indique
le côté. Sans indication reconnue, les sorties utilisent le bas et les entrées
le haut. Un ratio mesure la position de gauche à droite sur le haut/bas et de
haut en bas sur les côtés gauche/droit. Les ancres priment sur les handles.

Les ratios explicites sont conservés et dédupliqués. Pour `f` ratios fixes
distincts et `n` demandes sans ratio sur un côté, ces dernières occupent les
premières positions libres de la grille `k/(f+n+1)`, avec `1 <= k < f+n+1`.
Si nécessaire la grille est subdivisée en deux jusqu'à attribution complète.
Un côté sans demande reçoit son milieu. Les points sont ordonnés par côté
haut/droite/bas/gauche puis par ratio croissant ; les coordonnées identiques
(y compris les coins partagés) sont dédupliquées en conservant la première.
Chaque point est sur le contour, jamais à l'intérieur. Les indices sont donc
stables pour les mêmes demandes et ne dépendent pas de l'ordre des arcs.

```js
import { creerPlacement } from './dist/server/graphe.js';
const placement = creerPlacement(graphe.sommets[id], { x: 20, y: 40 }, graphe.arretes);
// Le futur routeur choisira un indice dans placement.connexions.
```

`calculerDestination(point, pas)` additionne les distances signées des pas
`horizontal` (x) et `vertical` (y). Une liste vide conserve la position.
Les vérificateurs retournent des listes de conflits, vides si tout est correct :

- `verifierChemin(sg, epsilon)` part de `sg.sommets[c.debut].connexions[c.idx]`
  et compare l'arrivée à **toutes** les connexions de `c.fin`. Il retourne les
  chemins incorrects, avec leur `arcId`. Comme dans la référence, `epsilon`
  représente une **distance au carré**, finie et positive ou nulle :
  `(arrivee.x - connexion.x)² + (arrivee.y - connexion.y)² <= epsilon` accepte
  l'arrivée. L'égalité est acceptée ; zéro impose une arrivée exacte. Par
  exemple un écart `(2, 1)` est accepté à partir de `epsilon = 5`.
- `verifierPlacement(sg)` retourne une seule paire `[sommetA, sommetB]` pour
  chaque intersection des **boîtes englobantes fermées**, quelle que soit
  la forme. Un contact par un côté ou par un coin est un conflit, comme un
  chevauchement ou une inclusion. Les paires suivent l'ordre des sommets.
- `verifierPlacementChemin(sg)` teste chaque segment contre l'**intérieur
  ouvert** des boîtes tierces. Longer un bord ou toucher seulement un coin
  ou un côté est permis ; entrer à l'intérieur, même avec une extrémité
  intérieure, est un conflit. Source et cible sont exclues, y compris pour
  une boucle. La liste contient une seule paire `[arcId, sommetTiers]` par
  chemin et boîte touchée, même après plusieurs traversées. `arcId` distingue
  les arcs parallèles. Un pas nul à l'intérieur compte comme intersection ;
  une liste de pas vide ne contient aucun segment à tester.

`segmentIntersecteRectangle` expose le test d'intérieur, symétrique dans les
deux sens du segment (y compris diagonal). Aucune marge implicite n'est ajoutée
aux boîtes ou aux segments ; les calculs utilisent les nombres JavaScript.

Avant chacun des trois vérificateurs, tous les placements et chemins sont
validés : coordonnées et dimensions finies, dimensions strictement positives,
sommes de coordonnées finies, connexions non vides et finies, références source
et cible présentes comme clés propres, indice source entier dans les limites,
types et distances des pas valides, destinations intermédiaires finies.
Les données invalides lèvent `ErreurGeometrie` avec `code`, `chemin` et message
explicites ; elles ne sont pas confondues avec les listes de conflits. Les
diagnostics de chemin incluent sa position dans la liste et son `arcId`.
Les codes sont `NOMBRE_NON_FINI`, `DIMENSION_INVALIDE`, `REFERENCE_ABSENTE`,
`INDICE_CONNEXION_INVALIDE`, `CONNEXIONS_INVALIDES`, `PAS_INVALIDE`,
`TOLERANCE_INVALIDE`, `ANCRE_INVALIDE` et `FORME_INVALIDE` (les deux derniers
concernent la génération des connexions).

## Placement — évolution 2

`calculerPlacements(graphe)` est exportée depuis `src/server/graphe.ts`.
Elle retourne une union discriminée :

```js
import { calculerPlacements, REGLES_TEXTE } from './dist/server/graphe.js';
const resultat = calculerPlacements(graphe);
if (!resultat.ok) {
  console.error(resultat.diagnostic); // code, chemin, message, éventuels conflits
} else {
  console.log(resultat.sommets, resultat.textes, resultat.cadre);
  // Le futur routeur utilisera resultat.sommets et graphe.arretes.
  // Le futur rendu utilisera resultat.textes et REGLES_TEXTE.
}
```

Le résultat de `calculerPlacements` ne contient aucun chemin. Pour produire un
`SpaceGraphe` routé, utiliser `computeSpatialGraphe` décrit ci-dessous.
Pour contrôler uniquement les placements, utiliser
`verifierPlacement({ sommets: resultat.sommets, chemins: [] })` après succès.
Cette vérification est déjà exécutée par le calcul : un résultat en conflit
n'est jamais déclaré valide. Les erreurs géométriques et de références sont
retournées sous `ok: false`, sans placements partiels. Les erreurs de
programmation inattendues ne sont pas masquées.
Les coordonnées finies trop grandes pour représenter les marges en arithmétique
JavaScript produisent `PRECISION_INSUFFISANTE`.

La lecture suit les arcs de haut en bas. Le calcul condense les composantes
fortement connexes, classe leur graphe acyclique par plus long chemin, puis
déroule chaque cycle sur plusieurs rangs. Ses arcs de retour pourront utiliser
les couloirs extérieurs. Le parcours est itératif ; les boucles, arcs parallèles,
convergences et sommets isolés sont conservés. Les composantes déconnectées
occupent des bandes horizontales distinctes.

Les constantes `REGLES_PLACEMENT` fixent 48 px de réserve extérieure,
64 px entre formes d'un rang, 80 px entre rangs et 128 px entre composantes.
Ces distances portent sur les boîtes englobantes, pas seulement sur les contours.
Les positions importées servent d'indications : elles sont conservées lorsqu'elles
respectent l'ordre de lecture et ces espaces. Une translation commune ramène
les indications négatives dans les marges ; les collisions sont résolues en
décalant les formes vers la droite ou vers le bas. Les identifiants départagent
les égalités, indépendamment de l'ordre des propriétés JSON et des arcs.

`dimensionnerForme(forme)` retourne une copie de la forme et sa composition
`texte`. Les dimensions importées sont des minima. `REGLES_TEXTE` définit une
police monospace de 14 px, une avance de 9 px, un interligne de 20 px et un
espacement interne de 16 px. La largeur de composition vise 144 à 288 px selon
la largeur importée. Les mots sont coupés aux espaces lorsque possible et les
mots trop longs entre graphèmes ; accents combinés et emoji restent entiers.
Les retours explicites, y compris les lignes vides finales, sont préservés ;
CRLF/CR deviennent LF et les tabulations quatre espaces pour la composition.
Le libellé source reste inchangé.

Le texte et son espacement interne tiennent dans un rectangle central occupant
la moitié de chaque axe du losange, ou `1/√2` de chaque axe de l'ovale. Les
quatre coins de cette zone utile restent à l'intérieur du contour. Les lignes
seront centrées horizontalement et verticalement dans `texte.zoneUtile`, relative
au coin de la forme. Le rendu devra reprendre `texte.lignes`, `texte.largeurs`
(comme `textLength` pour les lignes non vides) et `REGLES_TEXTE`, sans mesurer
ou recomposer les textes après routage. Les connexions sont générées uniquement
après la fixation des tailles et positions finales, avec les ancres d'origine.
L'entrée et ses métadonnées ne sont pas modifiées, ni partagées avec les formes
du résultat.

## Vérifications

`npm test` recompile les deux parties puis découvre tous les cas de
`tests/*.test.mjs` avec le moteur de test Node.js, sans serveur. Chaque
cas peut être relancé seul, en donnant son nom exact, par exemple :

```sh
node scripts/test.mjs diagram-reference
node scripts/test.mjs dimensions-invalides
node scripts/test.mjs connexions-rectangle-ancres-multiples
node scripts/test.mjs segments-interieur-bords-contacts-deux-sens
node scripts/test.mjs placements-diagram-reference
node scripts/test.mjs placements-libelles-longs-multilignes
node scripts/test.mjs placements-determinisme-et-immuabilite
```

La suite vérifie le fichier fourni, les quatre correspondances de formes,
les arcs parallèles, cycles et boucles, les nœuds isolés, les tableaux vides,
les textes accentués/multilignes, les métadonnées et ancres, les diagnostics
invalides et l'absence de mutation. Aucun test métier préexistant n'était
présent dans le socle. Les 17 tests de l'évolution 0 restent pertinents et sont
conservés sans modification. Les 17 nouveaux cas vérifient les connexions aux
origines non nulles, les ancres multiples et les coins dédupliqués, les pas
signés, les limites de tolérance, les contacts et traversées dans les deux
sens, les exclusions, les arcs parallèles, les diagnostics et l'intégration
avec les 18 formes du diagramme fourni. Les scénarios de l'évolution 1 sont
entièrement automatisés ; aucun cas n'a été supprimé.

Les 34 cas d'import et de géométrie restent pertinents à l'évolution 2 : l'import
conserve les dimensions d'origine et `creerPlacement` reste une primitive à
position fournie. Ils sont conservés sans modification. Les 17 nouveaux cas
vérifient le placement du diagramme fourni, les topologies demandées, les positions
superposées/négatives, la conservation des indications compatibles, les marges
aux limites des boîtes, les textes longs et Unicode, les connexions recalculées,
le déterminisme, l'absence de mutation, les diagnostics et 30 graphes générés
avec une graine fixe. Le script découvre automatiquement tous les cas ; chaque
nouveau cas est également relançable seul. Tous les scénarios de l'évolution 2
sont automatisés, sans serveur ni intervention manuelle.

## Routage — évolution 3

```js
import { importerFichierDiagramme } from './dist/server/importer.js';
import { computeSpatialGraphe, ErreurRoutage } from './dist/server/graphe.js';
const g = await importerFichierDiagramme('diagram.json');
try {
  const spatial = computeSpatialGraphe(g);
  // 18 placements, 24 chemins pour le fichier fourni.
  for (const c of spatial.chemins) {
    const libelle = g.arretes.find(a => a.id === c.arcId).label;
    console.log(c.arcId, c.idx, c.listeDePas, libelle);
  }
} catch (e) {
  if (e instanceof ErreurRoutage) console.error(e.diagnostic);
  else throw e;
}
```

`computeSpatialGraphe(g, options?)` assemble les placements de l'évolution 2
avec un chemin par arc, dans l'ordre du tableau d'origine. `Chemin.arcId`
référence l'arc et son libellé exact, y compris pour les arcs parallèles.
`idx` indexe les connexions de la source ; `calculerDestination` reconstruit
chaque polyligne et son arrivée sur une connexion de la cible. Les pas sont
finis, horizontaux ou verticaux, signés et non nuls ; les segments colinéaires
de même sens sont fusionnés. Le calcul ne modifie aucune entrée et ne partage
pas les métadonnées des formes avec le résultat.

Les ancres priment sur les handles cardinaux ; par défaut une sortie préfère
le bas, une entrée le haut. Les rectangles répartissent les arcs entre les
connexions disponibles d'un côté, avec un coût supplémentaire pour un port
déjà utilisé. Les losanges et ovales gardent exactement quatre connexions ;
un ratio importé y sélectionne le côté cardinal, sans ajouter de port.
Les points importés sont des coordonnées absolues. Un trajet orthogonal qui
respecte les connexions, les dégagements et les obstacles est repris, y compris
ses ports latéraux si aucun côté n'est explicitement demandé. Les points
devenus incompatibles après placement sont recalculés. Les préférences ne
permettent jamais de traverser une forme.

La recherche déterministe de Dijkstra utilise une grille non uniforme sur
les boîtes dilatées et les dégagements des ports. `REGLES_ROUTAGE` impose
12 px de marge autour des boîtes tierces et 24 px de dégagement perpendiculaire
au départ et à l'arrivée. Source et cible sont aussi des obstacles pendant la
recherche ; aucun segment ne traverse leur boîte, même pour une boucle sur
soi. La recherche mémorise les quatre directions : les demi-tours sont interdits,
y compris au raccordement des dégagements. Les points importés qui créent une
impasse suivie d'un retour sont recalculés. Des pistes espacées de 32 px et des
pénalités de longueur, de coude, de proximité parallèle, de superposition et de croisement limitent les
détours et les jonctions ambiguës. Les liaisons les plus courtes sont routées
d'abord, puis les grands retours les contournent si possible. Les croisements
restent permis et les ports uniques des ovales/losanges peuvent partager leur
dégagement. L'identifiant d'arc départage les distances égales ; inverser les
propriétés JSON ou les arcs conserve la même géométrie par identifiant.

La pénalité de proximité est proportionnelle à la longueur de deux segments
parallèles distants de moins de 32 px. Elle évite aussi les pistes trop proches
issues des coordonnées de ports différents, sans interdire un passage étroit
ou déplacer une ancre imposée. Les points importés valides restent respectés.

Les rectangles réservent aussi 32 px entre leurs ports libres : leur largeur
ou hauteur augmente si nécessaire avant le placement, sans recomposer le texte.
Les ancres à ratio imposé gardent leur répartition. Les dégagements communs aux
quatre ports des losanges et ovales, les passages étroits et les ancres explicites
peuvent empêcher cet écart localement ; 32 px est l'objectif du routage, pas une
garantie universelle sur des contraintes importées incompatibles.

Le calcul essaie d'abord les côtés préférés puis, si aucun trajet n'est
possible, les autres connexions. La limite explicite est de **deux essais**,
sans boucle de correction infinie. Les options `maxEssais` (1 ou 2),
`maxEtats` (250 000 états explorés par arc par défaut, tous essais cumulés)
et `maxNoeudsGrille` (200 000 par défaut) bornent la recherche. Un dépassement
ou un échec produit `ErreurRoutage` : `diagnostic` contient `code`, `chemin`,
`message`, `essais` et, si l'erreur concerne un arc, `arcId`. Aucun graphe
partiel n'est retourné. Les diagnostics de placement sont repris ; le routeur
distingue aussi `OPTION_INVALIDE`, `ARC_INVALIDE`, `GRILLE_TROP_GRANDE`,
`BUDGET_ROUTAGE_DEPASSE`, `ROUTAGE_IMPOSSIBLE`, `DEGAGEMENT_INVALIDE` et
`CONFLITS_ROUTAGE`.

Avant tout retour, les trois vérificateurs sont exécutés. La tolérance
d'arrivée est `REGLES_ROUTAGE.toleranceCarree = 1e-12` (distance **au carré**,
soit un écart linéaire maximal de 0,000001 px), pour absorber l'arrondi des
sommes de pas. Les dégagements et l'absence de traversée de la source et de
la cible font l'objet d'un contrôle supplémentaire.

Les 51 tests antérieurs restent pertinents et sont conservés sans modification.
Les 20 nouveaux cas couvrent le fichier fourni, les trajets directs, obstacles,
embranchements, convergences, cycles, boucles, arcs parallèles, connexions multiples,
préférences et recalcul des indications incohérentes, les 48 combinaisons de
côtés et formes, les budgets et limites d'essais, le déterminisme, les entrées
invalides, les identifiants spéciaux et 16 graphes générés avec une graine fixe.
Un oracle indépendant reconstruit les polylignes et contrôle les extrémités,
les dégagements, toutes les formes et les marges tierces. Tous les scénarios
demandés sont automatisés ; aucun serveur ni opérateur n'est nécessaire.
Les recettes individuelles recompilent automatiquement, par exemple :

```sh
node scripts/test.mjs routage-diagram-reference
node scripts/test.mjs routage-arcs-paralleles
node scripts/test.mjs routage-degagements-source-cible-tous-cotes
node scripts/test.mjs routage-echec-controle-budget
node scripts/test.mjs routage-repli-et-limite-essais
```

L'interface Express affiche toujours la page d'accueil. La consultation du SVG
dans l'interface relève de l'évolution suivante.

## Rendu SVG — évolution 4

`rendreSvg(spatial, textes, arcs)` retourne une chaîne SVG XML autonome en
UTF-8. `spatial` est le `SpaceGraphe` validé, `textes` le dictionnaire de
`TextePlace` retourné par `calculerPlacements` pour le même graphe, et `arcs`
un tableau de `{ id, label }` (le tableau `Graphe.arretes` convient).
La fonction est exportée par `src/server/graphe.ts` et `src/server/svg.ts`.
Exemple en mémoire après `npm run build` :

```js
import { importerFichierDiagramme } from './dist/server/importer.js';
import { calculerPlacements, computeSpatialGraphe, rendreSvg } from './dist/server/graphe.js';

const graphe = await importerFichierDiagramme('diagram.json');
const placement = calculerPlacements(graphe);
if (!placement.ok) throw new Error(placement.diagnostic.message);
const spatial = computeSpatialGraphe(graphe); // Exécute les trois vérificateurs.
const svg = rendreSvg(spatial, placement.textes, graphe.arretes);
```

Les rectangles, losanges et ovales utilisent les dimensions définitives et
les coordonnées du placement. Chaque polyligne commence sur la connexion
`idx` de sa source et applique exactement ses pas signés. Le marqueur SVG
orienté place sa pointe sur la connexion d'arrivée. Les textes de nœuds
reprennent les lignes, largeurs et interlignes calculés avant routage,
avec `textLength` : aucun redimensionnement ni nouveau découpage des formes.

La présentation utilise une police monospace de 14 px, un fond bleu nuit,
des formes aux teintes bleues, ambrées et vertes, un texte clair contrasté et
des contours de 2 px. Les rectangles ont un rayon de 12 px, réduit près des
connexions proches des coins pour conserver chaque port sur le contour.
Les branches « oui » ont un chemin et une pointe verts, les branches « non »
un chemin et une pointe rouges, contrastés sur le fond sombre. La comparaison
ignore la casse et les espaces en bordure du libellé. Le vert et le rouge sont
réservés à ces branches : les arcs ordinaires utilisent une palette grise,
bleue, ambrée et violette. Les étiquettes « oui » et « non » sont remplacées
par une légende compacte (flèche verte **Oui**, flèche rouge **Non**) sous le
diagramme, présente seulement pour les conditions utilisées. Le titre et le
nom accessible de chaque arc conservent son libellé source. Tous les autres
libellés, par exemple « non disponible » ou « oui/non », restent affichés.
Les styles et les marqueurs
sont intégrés au SVG, donc conservés à l'enregistrement et hors ligne.
Les pointes de flèche mesurent 20 × 16 px, contre 10 × 8 px auparavant,
et restent entièrement en dehors des formes grâce aux dégagements de 24 px.
Les libellés d'arcs sont composés avec les mêmes règles de texte, sur fond sombre. Leur
placement réserve 8 px autour des formes et des autres étiquettes, et évite
les couloirs de tous les chemins. Une recherche déterministe les place près
des segments à partir de la source. En cas de forte densité, une colonne
extérieure avec trait de rappel permet de conserver tous les libellés.
Les 12 branches « oui »/« non » de `diagram.json` ne créent plus
d’étiquettes ni de traits de rappel. La légende réserve sa propre zone hors
des formes et des chemins ; elle est incluse dans le `viewBox`.

Le `viewBox` englobe les formes, les textes, les chemins et une réserve
de 20 px pour les marqueurs, puis ajoute 16 px de marge sur chaque bord.
Il conserve les coordonnées négatives. Les dimensions intrinsèques du SVG
permettent une ouverture à l'échelle 1:1 et un agrandissement sans perte.
Styles et marqueurs sont internes ; aucune ressource réseau n'est requise.
Les identifiants issus du diagramme figurent dans des attributs `data-*`
échappés ; les identifiants XML techniques sont générés par le rendu.
Textes et attributs échappent les caractères XML réservés. Les retours à la
ligne sont composés en `tspan` et conservés dans les titres accessibles.
Les caractères interdits en XML 1.0 sont remplacés par U+FFFD.
Les compositions absentes ou les associations arc/chemin incomplètes
produisent une erreur explicite, sans modifier les entrées.

Les 71 cas précédents ont été audités et sont conservés : leurs attentes
sur l'import, la géométrie, le placement et le routage restent requises.
Les 16 cas supplémentaires vérifient le XML, les 18 nœuds et 24 arcs avec
leurs libellés, les contours et flèches, la réutilisation des compositions,
l'absence de collisions, les coordonnées négatives et grands détours,
l'échappement, les libellés vides, les identifiants spéciaux, les arcs
parallèles et boucles, l'immuabilité et le repli des étiquettes denses.
Quatre de ces cas ouvrent les fichiers SVG locaux dans Chromium, hors ligne,
à 100 % et 200 %, mesurent les glyphes affichés, contrôlent les contours,
les branches, retours, textes longs, marges et l'absence d'exécution/inclusion
de balisage injecté. Ils ferment le navigateur et nettoient leurs fichiers
temporaires, même en cas d'échec. Aucun serveur n'est démarré.

Installer Chromium une fois pour les tests navigateur (après `npm ci`) :

```sh
npx playwright install chromium
# Sur une machine sans bibliothèques système de navigateur :
# npx playwright install --with-deps chromium
npm run typecheck
npm test
node scripts/test.mjs svg-diagram-xml-complet
node scripts/test.mjs svg-navigateur-diagram-taille-normale-et-double
```

Les tests navigateur échouent explicitement si Chromium est indisponible.
Pour conserver des captures PNG à examiner, à taille normale et double,
y compris un détail des branches, choisir un dossier extérieur au projet :

```sh
SVG_SCREENSHOT_DIR=/tmp/diagrams-svg-captures node scripts/test.mjs svg-navigateur-diagram-taille-normale-et-double
```

## Conversion Node.js — évolution 5

Après compilation, convertir le diagramme fourni depuis la racine du projet :

```sh
npm run build
node dist/server/convertir.js diagram.json /tmp/diagram.svg
# Variante npm, avec les mêmes deux arguments :
npm run convert -- diagram.json /tmp/diagram.svg
```

Le répertoire de destination doit exister. Les chemins sont relatifs au
répertoire courant ; les entourer de guillemets s'ils contiennent des espaces.
Ouvrir ensuite `/tmp/diagram.svg` directement dans un navigateur ou l'insérer
dans une présentation, puis supprimer ce fichier d'exemple lorsqu'il n'est plus
utile. La sortie est un document XML/SVG autonome encodé en UTF-8.

La commande exige exactement deux arguments. Elle retourne 0 et affiche le
chemin produit en cas de succès, ou retourne 1 avec un diagnostic sur stderr
en cas d'échec. Les diagnostics distinguent lecture, syntaxe JSON, import
(avec code et chemin métier), calcul spatial, validation, rendu et écriture.
Le fichier source est lu en UTF-8 et n'est jamais écrit. Une destination
identique à la source, même via un chemin équivalent, un lien symbolique ou un
lien physique, est refusée avec `DESTINATION_IDENTIQUE`.

Le SVG est intégralement calculé et contrôlé avant toute écriture. La commande
écrit dans un répertoire temporaire privé à côté de la destination puis publie
le fichier par renommage. Elle remplace une destination existante uniquement
au succès ; en cas d'erreur, celle-ci reste intacte et les fichiers temporaires
sont nettoyés. Les scripts `start` et `dev` restent ceux du serveur existant.

Le service commun n'accède ni aux fichiers ni à HTTP. Après compilation :

```js
import { convertirDiagramme, convertirJson, ErreurConversion } from './dist/server/conversion.js';

const svg = convertirDiagramme({ nodes: [], edges: [] }); // Objet Appolon JS.
const memeSvg = convertirJson('{"nodes":[],"edges":[]}'); // Texte JSON.
// La route Express transmet directement req.body à convertirDiagramme.
```

Ces deux fonctions synchrones retournent une chaîne SVG et acceptent en second
argument les `OptionsRoutage` existantes. Elles enchaînent import, composition
du texte et calcul spatial, les trois vérifications explicites
`verifierChemin`, `verifierPlacement`, `verifierPlacementChemin`, puis rendu.
Une `ErreurConversion` expose `etape` (`json`, `import`, `calcul`, `validation`
ou `rendu`) et conserve la cause d'origine. `convertirFichier(source, destination)`
dans `dist/server/fichiers.js` adapte ce service aux fichiers ; la commande
compilée provient de `src/server/convertir.ts`.

Les 87 cas antérieurs restent requis et sont conservés. Les nouveaux tests
contrôlent le service en mémoire, sa correspondance exacte avec le fichier
produit, l'UTF-8, le XML et l'ouverture du fichier dans Chromium, les diagnostics,
les refus des trois vérificateurs, les liens vers la source, les chemins avec
espaces et le remplacement atomique. Des injections isolées dans les processus
de test simulent un graphe invalide, une erreur de rendu et un disque plein
après écriture partielle ; aucun mécanisme d'injection n'est ajouté au produit.
Toutes les sorties d'essai sont créées dans des répertoires temporaires puis
supprimées ; chaque scénario de fichiers compare également `diagram.json`
avant et après. Exemples de recettes indépendantes (avec recompilation) :

```sh
node scripts/test.mjs conversion-cli-commande-documentee-utf8-et-service
node scripts/test.mjs conversion-cli-erreur-geometrique-controlee
node scripts/test.mjs conversion-cli-refus-chemin-traversant-forme
node scripts/test.mjs conversion-cli-ecriture-interrompue-atomique
node scripts/test.mjs conversion-cli-refus-destination-source
```

## Génération HTTP — évolution 6

Compiler puis démarrer le serveur depuis la racine du projet :

```sh
npm run typecheck
npm run build
HOST=127.0.0.1 PORT=3000 npm start
```

`HOST`, `PORT`, `PORT=0` (port libre affiché au démarrage), les diagnostics de
démarrage et le service de `public/` et `/assets/` restent disponibles. Le serveur
peut aussi être lancé depuis un autre répertoire via le chemin absolu de
`dist/server/index.js`. La page permet de sélectionner un fichier local, de
générer son SVG et de l’enregistrer, comme décrit dans le parcours ci-dessous.

### Contrat de `POST /api/generate`

Envoyer **le contenu** d'un document Appolon JS avec `Content-Type:
application/json`, en UTF-8 sans compression. Les propriétés `nodes` et `edges`
suivent le contrat de l'import décrit plus haut. Aucun nom de fichier, chemin
local ou objet `{ "path": "diagram.json" }` n'est interprété comme un fichier.
Le corps est limité explicitement à **1 Mio, soit 1 048 576 octets**, limite
inclusive mesurée en octets UTF-8, et non en nombre de caractères.

Exemple dans un second terminal, pour le port 3000 :

```sh
curl --fail-with-body --request POST http://127.0.0.1:3000/api/generate \
  --header 'Content-Type: application/json' \
  --data-binary @diagram.json --output /tmp/diagram-http.svg
```

Au succès : `200`, `Content-Type: image/svg+xml; charset=utf-8`,
`Content-Disposition: inline; filename="diagram.svg"` et `Cache-Control: no-store`.
Le corps est le SVG XML autonome complet, identique octet pour octet au service
en mémoire. Ouvrir `/tmp/diagram-http.svg` dans un navigateur ou l'enregistrer
dans une présentation. Un client navigateur peut aussi consulter le corps avec
une URL de `Blob` et l'enregistrer avec un lien `download` (puis libérer l'URL).
La réponse n'est envoyée qu'après import, calcul, exécution de
`verifierChemin`, `verifierPlacement`, `verifierPlacementChemin` et rendu par
le service commun `convertirDiagramme`. Aucun SVG partiel n'est retourné.

Toutes les erreurs ci-dessous ont `Content-Type: application/json; charset=utf-8`
et la même enveloppe `{ "error": { "code": "…", "message": "…" } }` :

| Statut | `error.code` | `error.message` |
| --- | --- | --- |
| 400 | `JSON_INVALIDE` | `Le corps contient un JSON mal formé.` |
| 400 | `DIAGRAMME_INVALIDE` | Diagnostic du service avec code métier et chemin, par exemple `Conversion (import) : REFERENCE_ABSENTE — $.edges[0].target : …` |
| 400 | `CONTENT_TYPE_INVALIDE` | `Envoyez le diagramme avec Content-Type: application/json.` |
| 400 | `CORPS_INVALIDE` | `Envoyez un corps JSON complet en UTF-8, sans compression.` |
| 413 | `CORPS_TROP_VOLUMINEUX` | `Le corps JSON dépasse la limite de 1048576 octets (1 Mio).` |
| 500 | `ERREUR_INTERNE` | `La génération SVG a échoué. Réessayez ou contactez le responsable du serveur.` |

Un corps vide, une valeur JSON primitive ou une structure non Appolon donne
`DIAGRAMME_INVALIDE`. Une erreur inattendue, un échec de calcul, de vérification
géométrique ou de rendu donne `500` ; son détail est journalisé côté serveur,
sans exposer sa pile au navigateur. Une nouvelle requête valide reste possible
après ces erreurs.

Les tests antérieurs restent applicables et sont conservés intégralement.
Les tests HTTP démarrent chacun leurs instances sur des ports libres, vérifient
leur arrêt effectif et ne touchent pas aux processus préexistants. Ils couvrent
la limite exacte et son dépassement, les messages et la reprise après erreur,
les trois vérificateurs avant rendu, la conservation des ressources, `HOST`,
`PORT`, `PORT=0`, les diagnostics de démarrage et l'ouverture/enregistrement
du SVG dans Chromium. Les erreurs internes et les conflits sont injectés
uniquement par les modules de test dans des sous-processus isolés.

```sh
npm test
# Chaque cas peut également être exécuté seul, avec recompilation :
node scripts/test.mjs http-diagram-reference-svg-utf8-et-equivalence-service
node scripts/test.mjs http-limite-un-mio-octets-et-reprise
node scripts/test.mjs http-erreur-interne-rendu-controlee-et-reprise
node scripts/test.mjs http-svg-consultation-et-enregistrement-navigateur
```

Les prérequis Chromium sont les mêmes que pour les tests SVG précédents.
Les fichiers enregistrés par les essais navigateur sont temporaires et nettoyés.


## Parcours dans l’interface — évolution 7

Après `npm run setup` si nécessaire, lancer `npm run typecheck`, `npm run build`
puis `npm start`. Ouvrir <http://127.0.0.1:3000> (ou l’adresse affichée avec
`HOST`/`PORT`). La conversion se fait ensuite entièrement dans l’interface :

1. Activer **Fichier du diagramme JSON** et choisir le fichier `diagram.json`
   fourni dans le projet. Son nom apparaît sous le sélecteur.
2. Activer **Générer le SVG**. Les états de lecture et de génération sont annoncés.
   Le sélecteur et l’action sont verrouillés jusqu’à la fin pour éviter les
   demandes concurrentes. Sans fichier, l’action est désactivée.
3. Au succès, consulter la vue d’ensemble sombre, aux formes arrondies.
   Lire la légende **Oui / Non** sous le diagramme pour les branches colorées.
   Les `activityFinalNode` sont représentés par des ovales à double contour
   rose, distincts du début vert. Leur nom technique ou vide devient **Fin** ;
   les noms personnalisés sont conservés, y compris leurs accents et retours à la ligne.
   **Plein écran** occupe tout l’écran ; si l’API du navigateur est indisponible
   ou refusée, la vue occupe toute la fenêtre. **Quitter le plein écran** ou
   **Échap** revient à la page et restaure ses contrôles. Les boutons **− / +**,
   le curseur **Zoom**, ou **Ctrl + molette** sur l’aperçu agrandissent de 100 à
   400 % par pas de 25 %. Les boutons et le curseur sont utilisables au clavier ;
   le pourcentage est annoncé et les boutons sont désactivés aux limites.
   La molette conserve le détail sous le pointeur, les autres commandes gardent
   le centre de la vue. La molette sans Ctrl permet de défiler. Faire défiler l’aperçu pour
   lire les détails. **Vue d’ensemble** réinitialise zoom et défilement.
   **Ouvrir à taille réelle** ouvre le
   SVG dans un nouvel onglet ; utiliser le zoom du navigateur et le défilement
   pour examiner les textes, les flèches et les boucles.
4. Activer **Enregistrer le SVG** : `diagram.json` produit `diagram.svg`.
   Ouvrir ce fichier séparément, même hors ligne : ses formes, textes, styles
   et flèches sont intégrés et son contenu est celui de l’aperçu. Un autre
   fichier prend son propre nom, par exemple `présentation.JSON` donne
   `présentation.svg`.
5. Choisir un autre diagramme pour recommencer. L’ancien aperçu et ses liens
   disparaissent immédiatement. Le nom du résultat correspond au fichier
   réellement envoyé. Les URL de Blob précédentes sont libérées lors du
   remplacement et à la sortie de la page (hors conservation par le navigateur).

Le navigateur lit le contenu local et l’envoie à `POST /api/generate` ; il
n’envoie pas un chemin à ouvrir sur le serveur. La limite de 1 Mio est contrôlée
avant lecture et par l’API. Une lecture impossible, une syntaxe JSON incorrecte,
un document Appolon invalide, une erreur de conversion ou une coupure réseau
produit un message visible et annoncé aux technologies d’assistance. Une réponse
inexploitable et un délai réseau de plus de 60 secondes sont également signalés.
Corriger le fichier ou changer de sélection puis relancer ; aucun aperçu ancien
n’est présenté comme le résultat de la tentative échouée. Les diagnostics sont
affichés en texte, et le SVG est consulté comme image à partir du document reçu.

Le frontend est natif (HTML, CSS, TypeScript), avec libellé explicite, contrôles
clavier, focus visible, région de statut et alerte d’erreur. Les actions se
réorganisent sur fenêtre étroite. L’aperçu conserve les proportions et montre
l’ensemble ; le zoom, le plein écran et l’ouverture séparée permettent la lecture
des détails. Le plein écran garde ses commandes accessibles au clavier et rend
les contrôles de sélection en arrière-plan inactifs jusqu’à la fermeture.

Le service partagé par l’API et la commande de conversion produit une disposition
compacte par défaut. Les positions importées donnent un ordre initial, sans
réserver leurs espaces vides. Les longues successions sont repliées en deux à six colonnes, choisies d'après
les tailles réelles pour se rapprocher d'un format 16:9, puis les rangs reliés
sont rapprochés par échanges déterministes. Les formes sont centrées dans leurs
cellules pour aligner les connexions malgré leurs dimensions différentes. Le coût estimé
utilise les distances orthogonales entre connexions et pénalise les côtés tournés
à l'opposé de leur voisin. Les ancres explicites conservent leur côté et leur ratio.
Les lignes restent indivisibles ; leur largeur et leur hauteur réservent les
espaces nécessaires aux formes et aux textes. La recherche est limitée à huit
passes pour au plus 64 lignes ; au-delà, le repli simple est conservé. Les connexions sont régénérées aux positions finales, puis les
chemins sont recalculés et les trois vérificateurs sont exécutés avant le rendu.
Les dimensions et compositions de texte ne changent pas. Les marges entre rangs
restent de 56 px et entre colonnes repliées de 112 px pour laisser passer flèches
et libellés. Le SVG conserve une marge extérieure de 16 px sans coupure.

Le routeur réserve les dégagements imposés des arcs encore à tracer. Il pénalise
les tronçons partagés et les croisements sur les coudes pour éviter qu'un trajet
court bloque une sortie ou crée une jonction ambiguë. Les ports communs imposés
aux losanges et ovales restent utilisables par plusieurs arcs.

Sur `diagram.json`, le SVG mesure désormais 1 710 × 1 176 px, contre
1 475 × 1 237 px : environ 16 % de largeur supplémentaire, sans étirement des
formes. Le placement utilise cinq colonnes sur quatre rangs. Les 24 polylignes
comptent 71 coudes au lieu de 93 (24 % de moins), au maximum sept au lieu de huit.
Le coût d'un coude passe de 16 à 240 pour préférer un grand segment rectiligne
à une succession de petits raccourcis. Les dégagements partagés des ovales et
losanges restent autorisés ; leurs segments conservent les extrémités de l'arc
pour distinguer une séparation imposée d'un croisement entre arcs indépendants.

La longueur totale est de 17 463,83 px, contre 16 106,67 px au format précédent
et 24 055,33 px avant le rapprochement des rangs. Elle augmente de 8,4 % avec
la disposition élargie, mais reste 27 % plus courte qu'avant ce rapprochement.
Cinq chemins dépassent 1 000 px, contre six auparavant ; le plus long mesure
3 148 px contre 2 480 px. Ce compromis privilégie la largeur et la réduction des
escaliers demandées. L'oracle compte neuf croisements transversaux contre douze,
sans demi-tour, tronçon partagé, raccord en T ni auto-intersection. Les 18 nœuds,
24 arcs, leurs orientations et leurs connexions restent présents, avec les trois
listes de conflits vides. Cette optimisation heuristique ne garantit pas un
minimum global de longueur, de coudes ou de croisements.

Chaque croisement intérieur porte un petit passage au-dessus : le chemin
inférieur est interrompu par un masque SVG local de 7 px, et le trait supérieur
conserve la couleur attribuée à son chemin entier, y compris sa pointe.
Le trait horizontal passe au-dessus par convention ; une pointe verticale
proche est prioritaire pour garder sa silhouette entière, avec une coupure
adaptée à sa largeur. Les masques n'affectent que le chemin inférieur, sans
effacer les pistes voisines, les formes ou les textes. Aucun repère n'est ajouté
aux ports ou aux coudes. Les polylignes validées, les orientations et les
connexions restent inchangées par le rendu. Styles et masques sont inclus dans
le SVG autonome, avec le même résultat dans l'aperçu et l'export hors ligne.

La coloration construit le graphe des intersections intérieures puis choisit
les couleurs par saturation et degré, avec un départage stable par identifiant
d'arc. Les arcs ordinaires ont six couleurs possibles : `#94a3b8`, `#60a5fa`,
`#fbbf24`, `#c084fc`, `#f0abfc`, `#a5b4fc`. Ceux sans croisement restent gris.
Deux branches « oui » qui se croisent gardent leur sens avec des nuances de
vert (`#4ade80`, `#bbf7d0`, `#16a34a`) ; les branches « non » utilisent des
nuances rouges (`#f87171`, `#fecaca`, `#fb7185`). Une couleur reste constante
sur toute la polyligne, la pointe et le passage au-dessus. Sur `diagram.json`,
les croisements ont deux couleurs distinctes, y compris ceux
entre branches de même condition. La coloration ne change pas la géométrie.
Pour un graphe exceptionnel dépassant les possibilités de sa palette, le choix
minimise les voisins de même couleur ; il ne réaffecte jamais rouge ou vert à
un arc ordinaire et ne garantit pas une coloration optimale de tout graphe.

Les fonctions de bas niveau gardent leur disposition historique par défaut.
`calculerPlacements(graphe, true)` et
`computeSpatialGraphe(graphe, { dispositionCompacte: true })` permettent de
demander explicitement cette présentation. Pour conserver les indications
spatiales historiques dans le service, passer `{ dispositionCompacte: false }`
en deuxième argument de `convertirDiagramme` ou `convertirJson`.

### Vérifications finales reproductibles

```sh
npm run typecheck
npm run build
npm test
# Chaque nouveau cas est également exécutable seul, avec compilation :
node scripts/test.mjs ui-parcours-diagram-selection-apercu-ouverture-et-enregistrement-autonome
node scripts/test.mjs ui-absence-selection-json-invalide-et-diagramme-invalide-puis-reprise
node scripts/test.mjs ui-fichier-illisible-et-nouvelle-selection-valide
node scripts/test.mjs ui-erreur-conversion-api-reelle-et-reprise
node scripts/test.mjs ui-reponses-api-inexploitables-et-reprise-sans-apercu-perime
node scripts/test.mjs ui-coupure-reseau-et-reprise
node scripts/test.mjs ui-delai-reseau-expire-et-reprise
node scripts/test.mjs ui-deux-diagrammes-remplacement-telechargement-et-liberation-des-url
node scripts/test.mjs ui-verrouillage-lecture-requete-et-double-soumission
node scripts/test.mjs ui-clavier-fenetre-etroite-et-etats-accessibles
node scripts/test.mjs http-interface-finale-ressources-host-port-zero
node scripts/test.mjs conversion-disposition-compacte-reference-connexions-et-conflits
node scripts/test.mjs svg-arrondis-ports-proches-et-coins
node scripts/test.mjs svg-navigateur-theme-sombre-export-et-cadrage-compact
node scripts/test.mjs ui-plein-ecran-natif-zoom-retour-et-enregistrement
node scripts/test.mjs ui-plein-ecran-repli-api-absente-ou-refusee-et-echap
node scripts/test.mjs ui-plein-ecran-nouvelle-selection-et-echec-liberent-la-vue
node scripts/test.mjs import-nom-initial-presentation-et-noms-personnalises
node scripts/test.mjs routage-sans-demi-tour-degagements-et-points-importes
node scripts/test.mjs routage-reference-croisements-reduits-et-absence-de-jonctions-ambigues
node scripts/test.mjs svg-navigateur-debut-fleches-agrandies-et-export-autonome
node scripts/test.mjs svg-branches-oui-non-casse-espaces-et-arcs-neutres
node scripts/test.mjs ui-branches-rouges-vertes-apercu-remplacement-et-export-hors-ligne
node scripts/test.mjs routage-presentation-large-coudes-reduits-longueur-bornee-et-ancres
node scripts/test.mjs routage-compact-cycle-entrelace-court-deterministe-et-immuable
node scripts/test.mjs ui-chemins-raccourcis-apercu-et-fichier-autonome-identiques
node scripts/test.mjs routage-paralleles-32px-hors-ports-communs-des-trois-formes
node scripts/test.mjs routage-reference-proximite-32px-reduite-et-trajets-courts
node scripts/test.mjs placements-ports-libres-32px-texte-centre-et-ancres-fixes
node scripts/test.mjs routage-reference-corps-hors-degagements-et-sans-auto-intersection
node scripts/test.mjs svg-libelles-personnalises-sans-collision-et-legende-hors-geometrie
node scripts/test.mjs svg-croisements-halos-couleurs-et-geometrie-preservee
node scripts/test.mjs svg-croisements-excluent-ports-coudes-et-paralleles
node scripts/test.mjs svg-navigateur-croisements-couleurs-et-pointes-proches-preservees
node scripts/test.mjs ui-croisements-halos-visibles-apercu-export-et-remplacement
node scripts/test.mjs svg-croisements-six-pistes-distinctes-pointes-reperes-et-contraste
node scripts/test.mjs svg-croisements-couleurs-stables-conditions-prioritaires-et-arcs-isoles
node scripts/test.mjs svg-croisements-palette-saturee-reduit-les-collisions-sans-rouge-ni-vert
node scripts/test.mjs ui-pistes-32px-croisements-couleurs-distinctes-export-et-remplacement
node scripts/test.mjs ui-zoom-boutons-clavier-bornes-et-export-inchange
node scripts/test.mjs ui-zoom-molette-ancrage-defilement-et-vue-ensemble
node scripts/test.mjs ui-zoom-fenetre-etroite-plein-ecran-remplacement-et-reprise
```

Les tests Chromium exigent le navigateur Playwright et ses bibliothèques système
(préparation si absents : `npx playwright install --with-deps chromium`). La
suite lance ses propres instances Express sur ports libres, puis ferme les
navigateurs, termine ses serveurs et contrôle qu’ils n’écoutent plus, même en
cas d’échec. Elle préserve les processus déjà présents. Pour un essai interactif,
arrêter uniquement le `npm start` lancé pour cet essai avec Ctrl+C.

Le parcours automatisé sélectionne réellement les fichiers, télécharge les SVG,
compare leurs octets au service, les ouvre séparément hors ligne et vérifie
l’identité de leur DOM avec l’ouverture de l’aperçu. Il contrôle les 18 nœuds
(11 rectangles, 6 losanges, 1 ovale), les 24 arcs orientés, les six branches vertes
« oui » et les six rouges « non », expliquées par une seule légende intégrée. Les tests SVG antérieurs mesurent les textes, les
marges et les collisions au navigateur à échelle normale et double, y compris
les textes longs, multilignes et accentués. Le second diagramme du parcours
comprend également ces textes et une boucle. Une fenêtre de 360 px et l’ordre
des contrôles au clavier sont vérifiés.

La chaîne reste `importerDiagramme` → placement avec connexions par forme →
`computeSpatialGraphe` → `verifierChemin`, `verifierPlacement`,
`verifierPlacementChemin` → `rendreSvg`. Les tests de routage conservés vérifient
les quatre connexions cardinales des losanges/ovales, les connexions multiples
des rectangles, les extrémités de chaque chemin et l’absence de traversée des
formes. Pendant le parcours du diagramme fourni, un module de test isolé trace
les trois listes réellement retournées par le service avant rendu : elles sont
vides. Les tests d’injection de conflits existants continuent de vérifier le
refus d’un SVG si l’un de ces contrôles échoue.

L’audit conserve 119 cas antérieurs. Le cas
`http-socle-statique-host-port-zero-et-navigateur`, qui attendait le message
provisoire « Interface prête. », est effectivement remplacé par
`http-interface-finale-ressources-host-port-zero`. Il conserve les contrôles des
ressources statiques, des chemins non publiés, de HOST/PORT=0, de la feuille de
style et des erreurs JavaScript, puis vérifie l’état initial de la vraie
interface. Cette correction conserve ces 130 cas et ajoute six cas, soit 136.
Les attentes de couleur exacte claire, marge de 32 px, conversion avec disposition
historique et nombre fixe de contrôles sont adaptées au rendu actuel. Le contrôle
de couleur est remplacé par une mesure du contraste réel (au moins 4,5:1) pour
chaque texte de nœud et d’arc ; les contrôles de marges, géométrie, immuabilité,
clavier et autonomie restent exécutés. Aucun cas n’est supprimé.

Les nouveaux cas vérifient le cadrage équilibré et la réduction de surface du
diagramme fourni, les trois listes de conflits vides, le maintien des connexions
près des coins arrondis, le rendu sombre exporté hors ligne, le plein écran natif,
le zoom après redimensionnement, le défilement au clavier et la sortie native.
Ils simulent également une API plein écran absente ou refusée, la sortie par
Échap et une nouvelle sélection invalide depuis la vue agrandie, suivie d’une
reprise valide. Les captures permettent de contrôler la vue complète, les
branches et le plein écran agrandi.

La correction des couleurs conserve les 140 cas existants et ajoute deux cas
(142 au total). Les attentes d'une couleur et d'un marqueur uniques sont adaptées
aux trois types d'arcs, en conservant les contrôles de géométrie et d'autonomie.
Les nouveaux cas vérifient les libellés « oui »/« non » avec casse et espaces,
le maintien des autres arcs en gris, puis les six branches de chaque couleur
dans l'aperçu de `diagram.json` et leur remplacement par un autre diagramme.
Ils contrôlent la couleur effective des traits et des pointes, ainsi que le
rendu du SVG téléchargé ouvert séparément hors ligne.

La correction de longueur conserve les 142 cas existants et ajoute trois cas
(145 au total), sans suppression ni attente devenue obsolète. Ils mesurent les
longueurs réelles des polylignes avec un objectif d'au moins 25 % de réduction,
contrôlent les ancres, les dégagements, les conflits et l'immutabilité, puis un
cycle de douze nœuds dont l'ordre importé éloigne les voisins. Le parcours de
l'interface mesure aussi les chemins réellement rendus dans Chromium et confirme
leur identité dans le fichier téléchargé ouvert séparément hors ligne. Les cas
existants de croisements et d'arcs parallèles restent exécutés.

La correction des intersections et de l'espacement conserve ces 145 cas et en
ajoute six (151 au total), sans suppression ni modification des anciennes
attentes. La coupe des trois arcs parallèles est séparée d'au moins 16 px pour
chaque forme, hors dégagements communs imposés. Sur la référence, la longueur
cumulée des portions parallèles distantes de moins de 16 px passe de 2 283,33 à
617 px, soit 73 % de moins ; les ancres empêchent de promettre cet écart partout.
Les tests comparent chaque croisement aux segments finaux, contrôlent les
couleurs et les pixels de coupure dans l'image d'aperçu, la conservation d'une
pointe proche, l'export ouvert hors ligne et le remplacement par un second
diagramme. Les trois vérificateurs sont toujours exécutés avant le rendu.

La correction de coloration conserve les 151 cas et ajoute quatre cas, soit
155 cas. Aucun cas n'est supprimé. Les anciennes attentes d'un gris unique,
d'une pointe grise plus claire ou d'une seule nuance par condition sont adaptées
aux couleurs attribuées, en conservant les contrôles de formes, connexions,
flèches, contraste, libellés, géométrie et autonomie. Les nouveaux cas couvrent
six pistes toutes entrecroisées, la saturation de palette sur sept pistes,
les nuances conditionnelles, la stabilité malgré l'ordre des arcs et
l'immutabilité. Le parcours Chromium confirme les 11 croisements avec couleurs
distinctes, les pixels de l'aperçu, les pointes et repères assortis, l'export
hors ligne et le remplacement par un second fichier sans conditions. Les tests
existants de clavier, fenêtre étroite, erreurs et reprise restent exécutés.

La correction suivante porte l'écart cible de 16 à 32 px et renforce la pénalité
de proximité. Le côtoiement cumulé sous 32 px passe de 3 585 à 706,67 px,
soit 80 % de moins. Les tests de séparation
de 16 px et de proximité sous 16 px sont remplacés par deux cas à 32 px qui
conservent aussi le contrôle de la proximité sous 16 px et la réduction de longueur
d'au moins 25 % par rapport à la disposition avant rapprochement. La contrainte
de ne jamais allonger les trajets cède la place à ces contrôles avec l'écart accru
et l'interdiction des auto-intersections. Le cas de coloration
qui imposait exactement 11 croisements est remplacé par un cas conservant la
limite de 25 et les mêmes contrôles de couleurs, pointes, pixels, export et
remplacement. Un cas de placement contrôle les ports libres sur les quatre
côtés, le texte et les ancres fixes. Trois cas Chromium couvrent les boutons
de zoom, la molette, l'ancrage, les limites, l'export inchangé, la fenêtre de
320 px, le plein écran, le remplacement et la reprise après erreur. Le routeur
est aussi contrôlé contre les auto-intersections sur les deux dispositions.
Le test de libellés de l'évolution 4 est remplacé : leur distance à la sortie
est bornée à 96 px pour ces pistes plus larges et un trait de rappel explicite
est requis au-delà de 64 px. Les contrôles de collision avec formes, autres
libellés et chemins restent identiques. Les autres
cas, y compris ceux des évolutions précédentes, restent dans la suite : 160 cas.
Le contrôle de largeur sur fenêtre étroite inclut les nouveaux boutons.

Captures facultatives pour revoir visuellement les essais :

```sh
UI_SCREENSHOT_DIR=/tmp/diagrams-ui SVG_SCREENSHOT_DIR=/tmp/diagrams-svg npm test
```

Examiner la vue d’ensemble, les captures de branches à taille normale et double,
les textes longs et la fenêtre étroite. Ces captures ne sont pas nécessaires à
l’exécution des assertions et ne sont pas écrites dans le projet.
`croisement-detail.png` montre à 3× le passage au-dessus dans le fichier exporté.


## Correction — nœuds finaux et légende des conditions

`activityFinalNode` suit la chaîne existante d’import, de placement et de
routage : quatre connexions cardinales d’ovale, ancres respectées et les trois
vérificateurs exécutés avant rendu. Le double contour est décoratif et reste
à l’intérieur de la forme ; les chemins atteignent le contour extérieur.
Les noms techniques sont traduits en **Fin**, sans modifier le JSON source
ni les métadonnées. Les noms personnalisés restent affichés.

Pour vérifier cette correction indépendamment :

```sh
npm run typecheck
npm run build
node scripts/test.mjs import-noeud-final-nom-par-defaut-personnalise-et-metadonnees
node scripts/test.mjs svg-noeud-final-quatre-ports-entrees-orientees-et-trois-verificateurs
node scripts/test.mjs svg-diagram-xml-complet-conditions-en-legende
node scripts/test.mjs svg-libelles-personnalises-sans-collision-et-legende-hors-geometrie
node scripts/test.mjs ui-noeuds-finaux-legende-reprise-remplacement-et-export-autonome
npm test
```

Le parcours Chromium fournit cinq nœuds, dont un `activityFinalNode` à
`nodes[4]`, deux fins (nom par défaut et nom personnalisé multiligne), une
décision et des branches avec casse/espaces. Il vérifie une erreur suivie
d’une sélection valide, les trois listes de conflits vides du service,
le zoom au clavier sur fenêtre de 360 px, le remplacement par un fichier
sans conditions et l’export autonome ouvert hors ligne. Vérification
interactive complémentaire : sélectionner un JSON contenant un nœud final,
contrôler **Fin** et le double contour, puis enregistrer et ouvrir le SVG ;
la légende et les deux styles de fin/début doivent rester identiques.

Audit des tests : deux cas sont remplacés. `svg-diagram-xml-complet`
attendait une étiquette visible par arc ; son remplacement conserve les
18 nœuds, 24 arcs, titres, noms accessibles et textes des nœuds, et contrôle
la légende unique. `svg-libelles-pistes-32px-proximite-rappels-et-absence-collision`
attendait 12 étiquettes de condition à proximité des sorties ; son remplacement
contrôle leur absence, la légende sans collision ni coupure, ainsi que les
libellés personnalisés toujours affichés sans collision. Les tests de couleur,
flèches, géométrie, contraste et export restent conservés ; leurs comptages
portent désormais sur les branches plutôt que sur les étiquettes retirées.
Trois cas supplémentaires couvrent l’import final, ses quatre ports et le
parcours de l’interface. La suite contenait alors 163 cas.


## Correction — trajets moins découpés et disposition plus large

Pour reproduire les contrôles de cette correction :

```sh
npm run typecheck
npm run build
node scripts/test.mjs placements-presentation-large-centres-alignes-et-connexions-regenerees
node scripts/test.mjs routage-presentation-large-coudes-reduits-longueur-bornee-et-ancres
node scripts/test.mjs ui-presentation-large-trajets-simplifies-apercu-et-export-autonome
npm test
```

Pour vérifier le parcours dans l'interface : lancer `npm start`, ouvrir
`http://127.0.0.1:3000`, sélectionner `diagram.json`, puis **Générer le SVG**.
Observer la disposition plus large et les trajets simplifiés en **Plein écran**,
essayer les boutons de zoom puis **Vue d’ensemble**. Utiliser **Enregistrer le
SVG**, ouvrir le fichier enregistré séparément et vérifier les mêmes formes,
flèches, accents, textes multilignes et légende. Tester aussi une fenêtre étroite,
les erreurs puis une nouvelle sélection. Arrêter uniquement l'instance lancée
pour cette vérification. Ces parcours restent automatisés avec Chromium, y
compris les trois listes de conflits vides dans le service, l'export hors ligne,
les erreurs de lecture/JSON/API/réseau, le remplacement du résultat et le clavier.

Audit : le cas `routage-compact-reference-longueur-reduite-et-ancres-conservees`
est remplacé par `routage-presentation-large-coudes-reduits-longueur-bornee-et-ancres`.
La borne absolue de 2 823,34 px sur le plus long retour imposait de ne jamais
l'allonger, avant la demande de disposition plus large. Le remplacement borne
ce retour à 3 200 px et ajoute au plus 75 coudes au total et sept par flèche.
Il conserve la réduction de longueur totale d'au moins 25 %, au plus six grands
retours, les côtés et ratios des ancres, les trois vérificateurs et l'immuabilité.
Les tests distincts d'espacement à 32 px, d'absence de raccords en T, de tronçons
partagés, d'auto-intersections, de couleurs et de nœuds finaux restent conservés.
Deux cas supplémentaires contrôlent une grille de formes de tailles différentes
(centres alignés, texte, ports régénérés, marges et déterminisme) et le document
réel consulté puis enregistré depuis Express (cadrage large, nombre de coudes,
plein écran, zoom au clavier, absence de coupure et export autonome identique).
La suite de cette correction contenait 165 cas.

## Application Tauri — DGX Spark et Windows

Le projet peut aussi être compilé en application de bureau Tauri 2. Le DGX
Spark est ciblé en **Linux ARM64** (`aarch64-unknown-linux-gnu`) ; le build
Windows vise **Windows x64 / MSVC** (`x86_64-pc-windows-msvc`) avec
**cargo-xwin** depuis Linux. Le serveur Express, ses commandes et son API
restent disponibles pour l'utilisation dans un navigateur.

L'application embarque les fichiers de l'interface et le même moteur TypeScript
que le service Express. La conversion fonctionne dans un worker local, sans
serveur HTTP, connexion Internet ou installation de Node.js à l'exécution.
L'import en mémoire a été séparé de la lecture de fichiers Node ; les exports
Node existants restent compatibles. `conversion.ts` conserve les connexions
par forme et la barrière des trois vérificateurs **avant** le rendu SVG.
L'enregistrement passe par un dialogue natif ; son annulation conserve l'aperçu.
L'ouverture à taille réelle utilise une nouvelle fenêtre de consultation.
Le zoom, le plein écran, le clavier et la reprise après erreur sont partagés
avec l'interface web. Le SVG enregistré est autonome et identique au résultat
du service Express.

### Compiler sur le DGX Spark (Ubuntu ARM64)

Installer Node.js ≥ 22, npm et Rust stable via rustup, puis les dépendances
système [requises par Tauri](https://v2.tauri.app/start/prerequisites/) :

```sh
sudo apt update
sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
rustup target add aarch64-unknown-linux-gnu
npm ci
npm run typecheck
npm run build
npm run desktop:build:spark
```

Artefacts :

- Exécutable : `src-tauri/target/aarch64-unknown-linux-gnu/release/diagrammes-activite`.
- Paquet installable : `src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/Diagrammes_0.1.0_arm64.deb`.

Installer le paquet sur le Spark, puis lancer **Diagrammes** depuis le menu
d'applications :

```sh
sudo apt install ./src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/Diagrammes_0.1.0_arm64.deb
```

La machine destinataire doit disposer d'un bureau graphique, GTK 3 et
WebKitGTK 4.1 ; le paquet déclare ces dépendances. Compiler sur la même base
Ubuntu que la machine destinataire (ici Ubuntu 24.04 ARM64). Pour travailler
dans une fenêtre native sans installer le paquet : `npm run desktop:dev`.
Ce mode recompile l'interface au démarrage ; relancer après modification du
TypeScript/HTML/CSS. Ctrl+C termine le processus de développement.

### Compiler Windows depuis Linux avec cargo-xwin

Suivre la [procédure officielle Tauri pour la compilation Windows depuis
Linux](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos).
Aux dépendances Node et Rust ci-dessus s'ajoutent :

```sh
sudo apt install clang llvm lld nsis
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm ci
npm run desktop:build:windows
```

Le script utilise `tauri build --runner cargo-xwin --target
x86_64-pc-windows-msvc --bundles nsis -- --locked`. Le verrou Cargo est
conservé, comme `package-lock.json`. Au premier build, cargo-xwin télécharge
les bibliothèques du SDK Windows et les outils Tauri téléchargent leurs
composants NSIS : prévoir un accès réseau. `XWIN_CACHE_DIR` peut désigner un
cache partagé. Aucun Node.js pour Windows ni serveur Express n'est embarqué.

Artefacts :

- Application : `src-tauri/target/x86_64-pc-windows-msvc/release/diagrammes-activite.exe`.
- Installateur : `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Diagrammes_0.1.0_x64-setup.exe`.

Utiliser l'installateur sur Windows 10/11 x64 avec WebView2. L'installateur
propose les langues française et anglaise et installe WebView2 si nécessaire
(accès réseau requis si ce runtime est absent). Ces builds locaux ne sont pas
signés. NSIS est utilisé pour la compilation depuis Linux ; MSI nécessite
une machine Windows. Les bibliothèques graphiques Linux ne sont pas requises
sur la machine Windows destinataire.

### Vérifications du bureau et du parcours conservé

```sh
npm run typecheck
npm run build
npm test
npm run desktop:build:spark
npm run desktop:build:windows
```

La suite web/métier conserve ses **165 cas**, tous toujours pertinents, et
ajoute trois cas du frontend Tauri : égalité du SVG local/Express, remplacement
et commandes natives, erreurs du worker/expiration/reprise, annulation et
erreur d'écriture. Ces tests de frontend utilisent Chromium et une doublure
de l'IPC ; ils ne prétendent pas valider le dialogue natif.

Un quatrième cas vérifie la **véritable application Linux ARM64** avec
WebKitGTK, son worker, l'IPC Rust, le dialogue d'enregistrement (annulation
puis écriture réelle), l'égalité du fichier, la fenêtre à taille réelle,
le zoom, le plein écran, une erreur suivie d'une autre sélection et une fenêtre
étroite. Il tourne dans son propre Xvfb et son propre bus D-Bus, puis arrête
uniquement ses processus. Pour l'exécuter :

```sh
sudo apt install webkit2gtk-driver xvfb xdotool dbus-x11
cargo install --locked tauri-driver
npm run test:desktop
```

Les exécutables de test peuvent aussi être fournis par les variables
`WEBKIT_WEBDRIVER`, `XVFB`, `XDOTOOL` et `TAURI_DRIVER` (chemins absolus).
Les captures se trouvent dans `dist/verification-desktop/`. Le test utilise
un rendu logiciel adapté à Xvfb ; le rendu accéléré sur écran physique doit
également être observé lors de l'installation sur le Spark.

Sur chaque système destinataire, lancer l'application installée, choisir
`diagram.json`, générer puis examiner les 18 nœuds et 24 arcs : accents,
textes longs et multilignes, formes, flèches, boucles et légende rouge/verte.
Essayer le zoom, le plein écran, le clavier et une fenêtre étroite. Enregistrer
le SVG et ouvrir ce fichier séparément dans un navigateur hors ligne.
Choisir ensuite un autre diagramme et vérifier son nom et son export. Tester
un JSON invalide puis une sélection valide, annuler un enregistrement et
vérifier qu'aucun aperçu ancien ne représente une génération échouée.
Fermer les fenêtres ouvertes pour l'essai. La validation interactive de
l'installateur et de WebView2 nécessite une machine Windows ; un build Linux
réussi ne valide pas ce parcours Windows.

Après installation sur Windows, la recette suivante guide l'opérateur et
contrôle le XML du fichier réellement enregistré (18 nœuds, 24 arcs). Elle
échoue si un contrôle n'est pas confirmé ; elle ferme uniquement l'instance
de Diagrammes qu'elle a lancée. Si le dossier d'installation diffère, fournir
`-Application C:\chemin\diagrammes-activite.exe`.

```powershell
powershell.exe -NoProfile -File scripts/verify-windows.ps1
```
