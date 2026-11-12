# Évolution 6 — Exposer la génération SVG avec le serveur Express

## Objectif

Étendre le serveur Express Node.js existant pour recevoir le contenu d’un diagramme sélectionné et renvoyer son SVG généré.

## Dépendances

- `evolution5.md` : service commun de conversion en mémoire et diagnostics.

## Instructions de réalisation

- Ajouter au serveur TypeScript existant une route documentée `POST /api/generate` recevant le contenu JSON Appolon JS. Réutiliser le service de conversion plutôt que dupliquer les traitements métier.
- En cas de réussite, retourner le SVG autonome avec le type `image/svg+xml` et un encodage UTF-8. Le navigateur doit pouvoir le consulter et l’enregistrer comme fichier.
- Définir des réponses d’erreur JSON cohérentes : `400` pour un JSON ou un diagramme invalide, `413` pour un corps dépassant une limite documentée et `500` pour un échec interne inattendu. Inclure un message exploitable par l’interface.
- Configurer la lecture du corps des requêtes et sa limite explicitement. Ne pas interpréter le contenu reçu comme un chemin de fichier local.
- Préserver le service des fichiers `public/` et `/assets/`, les variables `HOST` et `PORT`, le support de `PORT=0` et les diagnostics de démarrage du socle.
- Documenter le contrat de la route avec un exemple de requête utilisant `diagram.json` et les commandes de compilation/démarrage.

## Critères d'acceptation

- Une requête valide contenant `diagram.json` reçoit `200`, un contenu `image/svg+xml` et un SVG conforme aux étapes précédentes.
- Une requête invalide reçoit le statut et le message documentés, sans arrêter le serveur ; la requête valide suivante réussit.
- La page d’accueil et les ressources du navigateur restent accessibles avec les réglages de démarrage existants.
- La génération utilise réellement les trois vérificateurs avant de produire une réponse de succès.

## Tests à effectuer

- Exécuter `npm run typecheck` et `npm run build`, démarrer une instance de test sur un port libre, puis envoyer `diagram.json` à la route et valider la réponse SVG.
- Tester un JSON mal formé, une référence d’arc invalide, un corps dépassant la limite et une erreur interne contrôlée ; vérifier les statuts et messages, puis renouveler une requête valide.
- Vérifier la page d’accueil, la feuille de style et le JavaScript compilé ; tester les paramètres `HOST`, `PORT` et le démarrage avec `PORT=0`.
- Comparer le SVG HTTP à celui du service pour la même entrée. Arrêter uniquement l’instance de test et les éventuels processus de surveillance lancés pour ces essais.
