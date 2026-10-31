import type { Forme, Point } from './graphe.js';
import { validerBoite } from './geometrie.js';

/** Contrat de composition à réutiliser tel quel par le futur rendu SVG.
 * Les lignes seront centrées, avec une avance fixe (textLength = largeur),
 * sans nouvelle mesure ni nouvelle coupure après routage. */
export const REGLES_TEXTE = Object.freeze({
  famille: 'DejaVu Sans Mono, monospace', taille: 14, avance: 9,
  interligne: 20, margeInterne: 16, largeurCible: 288,
});

export interface TextePlace {
  lignes: string[];
  largeurs: number[];
  largeur: number;
  hauteur: number;
  /** Rectangle centré, relatif au coin de la forme, incluant le padding. */
  zoneUtile: { p: Point; dx: number; dy: number };
}

const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const graphèmes = (texte: string): string[] => [...segmenter.segment(texte)].map(s => s.segment);
function cellules(g: string): number {
  // Idéogrammes et emoji occupent deux cellules ; un accent combiné reste
  // attaché à sa lettre. Aucun découpage au milieu d'un graphème.
  return /[\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(g) ? 2 : 1;
}
export function mesurerTexte(texte: string): number {
  return graphèmes(texte).reduce((s, g) => s + cellules(g) * REGLES_TEXTE.avance, 0);
}

export function composerLignes(texte: string, largeur: number = REGLES_TEXTE.largeurCible): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    let reste = graphèmes(paragraphe);
    if (reste.length === 0) lignes.push('');
    while (reste.length) {
      let taille = 0;
      let fin = 0;
      let espace = 0;
      while (fin < reste.length && taille + cellules(reste[fin]) * REGLES_TEXTE.avance <= largeur) {
        taille += cellules(reste[fin]) * REGLES_TEXTE.avance;
        if (/\s/u.test(reste[fin])) espace = fin + 1;
        fin++;
      }
      if (fin < reste.length && espace > 0) fin = espace;
      fin = Math.max(1, fin);
      lignes.push(reste.slice(0, fin).join(''));
      reste = reste.slice(fin);
    }
  }
  return lignes;
}

/** Ne réduit jamais les dimensions importées. La zone centrale occupe
 * 1/2 des deux axes du losange et 1/sqrt(2) de ceux de l'ellipse : ses
 * quatre coins sont sur le contour, et le texte reste en retrait de 16px. */
export function dimensionnerForme(source: Forme): { forme: Forme; texte: TextePlace } {
  validerBoite({ x: 0, y: 0 }, source, `forme[${JSON.stringify(source.id)}]`);
  const forme = structuredClone(source);
  const facteur = forme.type === 'losange' ? 0.5 : forme.type === 'ovale' ? 1 / Math.sqrt(2) : 1;
  const padding = REGLES_TEXTE.margeInterne;
  const cible = Math.min(REGLES_TEXTE.largeurCible, Math.max(144, source.dx * facteur - 2 * padding));
  const lignes = source.label === '' ? [] : composerLignes(source.label, cible);
  const largeurs = lignes.map(mesurerTexte);
  const largeur = largeurs.reduce((max, l) => Math.max(max, l), 0);
  const hauteur = lignes.length * REGLES_TEXTE.interligne;
  forme.dx = Math.max(forme.dx, Math.ceil((largeur + 2 * padding) / facteur));
  forme.dy = Math.max(forme.dy, Math.ceil((hauteur + 2 * padding) / facteur));
  const dx = forme.dx * facteur;
  const dy = forme.dy * facteur;
  return { forme, texte: { lignes, largeurs, largeur, hauteur,
    zoneUtile: { p: { x: (forme.dx - dx) / 2, y: (forme.dy - dy) / 2 }, dx, dy } } };
}
