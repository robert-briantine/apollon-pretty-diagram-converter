# Évolution 5 — Générer un fichier SVG depuis Node.js

## Objectif

Fournir un programme Node.js en TypeScript qui transforme un fichier de diagramme, en particulier `diagram.json`, en fichier SVG réutilisable pour une présentation.

## Dépendances

- `evolution0.md` : lecture et validation du diagramme Appolon JS.
- `evolution3.md` : `computeSpatialGraphe` et validations géométriques.
- `evolution4.md` : rendu SVG autonome.

## Instructions de réalisation

- Exposer un service de conversion commun enchaînant import, calcul spatial, les trois vérifications et rendu SVG. Le rendre réutilisable par le futur serveur sans imposer une lecture ou écriture de fichier.
- Ajouter une entrée de programme Node.js TypeScript acceptant un chemin JSON source et un chemin SVG de destination. Documenter une commande concrète pour convertir `diagram.json` après compilation avec le socle existant.
- Lire les fichiers en UTF-8 et écrire le SVG uniquement après réussite de toute la conversion. Ne pas écraser le fichier source ; refuser une destination identique à la source.
- Fournir des diagnostics utiles pour les erreurs de lecture, JSON, import, calcul, validation et écriture. Retourner un code de sortie non nul en cas d’échec et ne pas laisser de fichier de sortie partiel.
- Compléter la documentation d’usage et les scripts strictement nécessaires, sans remplacer les commandes de démarrage existantes.

## Critères d'acceptation

- Une commande documentée produit un véritable fichier `.svg` à partir de `diagram.json` avec un code de sortie nul.
- Le fichier généré correspond au résultat du service commun et respecte les critères de rendu de l’évolution 4.
- L’entrée est préservée et aucun SVG de succès n’est produit lorsque l’import ou une vérification échoue.
- Le service peut être appelé en mémoire par Express à l’étape suivante.

## Tests à effectuer

- Exécuter `npm run typecheck` et `npm run build`, puis la commande documentée sur `diagram.json` vers un répertoire temporaire ; ouvrir le fichier obtenu et vérifier son encodage.
- Comparer le contenu du fichier au résultat en mémoire du service pour la même entrée.
- Tester un fichier inexistant, un JSON invalide, un diagramme invalide, une erreur géométrique contrôlée et une destination non accessible ; vérifier messages, code de sortie et absence de sortie partielle.
- Vérifier le refus d’une destination identique à la source et comparer le contenu de `diagram.json` avant et après les essais. Nettoyer les sorties temporaires créées pour les tests.
