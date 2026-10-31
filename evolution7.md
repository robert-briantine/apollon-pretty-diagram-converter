# Évolution 7 — Sélectionner un diagramme et consulter son SVG dans l’interface

## Objectif

Terminer le parcours utilisateur : sélectionner un fichier de diagramme Appolon JS dans l’interface Express, lancer sa génération, consulter le SVG puis l’enregistrer pour une présentation.

## Dépendances

- `evolution6.md` : API Express de génération et service de l’interface.
- `evolution4.md` : exigences de qualité du SVG à vérifier dans le parcours complet.

## Instructions de réalisation

- Remplacer le contenu provisoire de l’interface dans `public/` et `src/client/main.ts` par un sélecteur de fichier JSON avec libellé, une action de génération et une zone de consultation du SVG. Réutiliser le frontend natif et le socle existants.
- Lire le fichier sélectionné et envoyer son contenu à `POST /api/generate`. Afficher le nom du fichier, les états de chargement, de succès et d’erreur ; empêcher les demandes incohérentes sans sélection ou pendant une génération.
- Afficher le SVG retourné dans une zone adaptée à la taille du diagramme, permettant de voir l’ensemble puis de lire ses détails par ouverture à taille réelle ou agrandissement. Proposer l’enregistrement du SVG généré comme fichier.
- Présenter les erreurs de lecture, de format, de conversion et de réseau avec un message lisible. Permettre de corriger la sélection et de relancer la génération ; éviter qu’un ancien aperçu soit présenté comme le résultat d’une nouvelle génération échouée.
- Gérer le remplacement de l’aperçu et la libération des URL temporaires éventuelles. Garder les contrôles utilisables au clavier et les changements d’état perceptibles.
- Documenter le parcours complet avec `diagram.json`, les commandes d’exécution et les vérifications finales. Confirmer que la chaîne utilise les connexions par forme et les trois vérificateurs avant le rendu.

## Critères d'acceptation

- Depuis la page servie par Express, l’utilisateur peut sélectionner `diagram.json`, générer et consulter son SVG, puis enregistrer un fichier autonome sans utiliser le terminal pour la conversion.
- Le résultat représente les 18 nœuds et les 24 arcs, leurs formes, leurs orientations et leurs libellés, avec une présentation lisible sans éléments coupés.
- Les quatre connexions des losanges et ovales et les connexions multiples des rectangles sont respectées par les chemins ; les trois vérificateurs ne signalent aucun conflit pour le diagramme fourni.
- Les erreurs sont visibles, une nouvelle génération reste possible après échec et le résultat affiché correspond au fichier annoncé.
- Le fichier enregistré s’ouvre seul dans un navigateur avec le même rendu que l’aperçu.

## Tests à effectuer

- Exécuter `npm run typecheck` et `npm run build`, démarrer une instance de test, puis effectuer au navigateur le parcours sélection de `diagram.json`, génération, consultation et enregistrement. Ouvrir le SVG enregistré séparément.
- Vérifier visuellement textes longs et multilignes, accents, branches « oui/non », boucles, flèches et lisibilité de présentation ; confirmer les trois listes de conflits vides dans le service.
- Tester une absence de sélection, un fichier illisible ou invalide, une erreur de l’API et une coupure réseau, puis une nouvelle sélection valide. Vérifier les états et l’absence d’aperçu périmé présenté comme un succès récent.
- Générer successivement deux diagrammes différents ; vérifier le remplacement du résultat et le bon fichier enregistré. Parcourir les contrôles au clavier et essayer une fenêtre étroite.
- Arrêter uniquement les serveurs et processus de surveillance démarrés pour ces essais ; préserver les processus déjà présents, notamment le serveur de pilotage Codex Drivers.
