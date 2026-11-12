# Ressources orbitales locales

Origine : créations vectorielles originales réalisées dans ce dépôt pour
l'évolution 2, à partir de la direction artistique de `docs/jeu/README.md`.
Aucun élément tiers, police, photo, modèle ou ressource externe incorporé.

Droits : les dix SVG de ce dossier sont mis à disposition sous **CC0-1.0**
(dédicace au domaine public, usage, modification et redistribution autorisés,
y compris commerciaux, sans attribution obligatoire). Ce choix concerne ces
ressources graphiques uniquement et ne change pas la licence du reste du dépôt.
Identifiant SPDX : `CC0-1.0`.

| Fichier | Taille nominale | Source déclarée |
| --- | --- | --- |
| joueur.svg | 32×32 | 64×64 |
| ennemi.svg | 40×36 | 80×72 |
| caisse.svg | 32×32 | 64×64 |
| rocher.svg | 48×48 | 96×96 |
| boss.svg | 96×80 | 192×160 |
| vaisseau-mere.svg | 200×120 | 400×240 |
| tir-ennemi.svg | 10×20 | 20×40 |
| tir-joueur.svg | 6×14 | 12×28 |
| tir-neutre.svg | 8×16 | 16×32 |
| sol.svg | 128×128 | 256×256 |

Tous les fonds sont transparents. Les traits et ombres sont contenus dans le
viewBox, avec une marge transparente contrôlée pour les neuf sprites. Pivot au
centre ; avant vers le haut (−Y). Pas de texte incorporé. Les images de sol sont
des cratères discrets, posés uniquement dans le disque de planète.

Les états animés sont composés par le renderer, sans texture externe et sans
changer les données de scène. Voir `docs/jeu/sprites.md` pour leur contrat,
les captures à taille réelle et les recettes de contrôle.
