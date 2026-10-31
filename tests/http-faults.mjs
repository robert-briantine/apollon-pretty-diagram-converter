// Injection exclusivement dans les sous-processus de test. Le serveur publié
// n'expose aucun paramètre permettant de provoquer ces erreurs.
import { mock } from 'node:test';

const mode = process.env.DIAGRAM_HTTP_FAULT;
let premier = true;
if (mode === 'import') {
  const importer = await import('../dist/server/importer.js');
  mock.module('../dist/server/importer.js', { namedExports: { ...importer,
    importerDiagramme(document) {
      if (premier) { premier = false; throw new Error('IMPORT_INTERNE_CONTROLE'); }
      return importer.importerDiagramme(document);
    },
  } });
} else if (mode === 'rendu') {
  const svg = await import('../dist/server/svg.js');
  mock.module('../dist/server/svg.js', { namedExports: { ...svg,
    rendreSvg(...args) {
      if (premier) { premier = false; throw new Error('RENDU_INTERNE_CONTROLE'); }
      return svg.rendreSvg(...args);
    },
  } });
} else {
  const geometrie = await import('../dist/server/geometrie.js');
  const appels = {};
  const conflits = {};
  const noms = ['verifierChemin', 'verifierPlacement', 'verifierPlacementChemin'];
  mock.module('../dist/server/geometrie.js', { namedExports: { ...geometrie,
    ...Object.fromEntries(noms.map(nom => [nom, (...args) => {
      appels[nom] = (appels[nom] ?? 0) + 1;
      conflits[nom] = geometrie[nom](...args);
      return conflits[nom];
    }])),
  } });
  const routage = await import('../dist/server/routage.js');
  mock.module('../dist/server/routage.js', { namedExports: { ...routage,
    computeSpatialGraphe(g, options) {
      const spatial = routage.computeSpatialGraphe(g, options);
      for (const nom of noms) appels[nom] = 0;
      if (mode === 'trace' || !premier) return spatial;
      premier = false;
      const placement = (id, x, y) => ({ forme: { ...spatial.sommets[id].forme, dx: 100, dy: 40 },
        p: { x, y }, connexions: [{ x: x + 50, y }, { x: x + 100, y: y + 20 },
          { x: x + 50, y: y + 40 }, { x, y: y + 20 }] });
      return { sommets: {
        a: placement('a', 0, 0), b: placement('b', 0, 200),
        c: placement('c', mode === 'placement' ? 0 : mode === 'obstacle' ? 25 : 300,
          mode === 'placement' ? 0 : 100),
      }, chemins: [{ arcId: 'ab', debut: 'a', fin: 'b', idx: 2,
        listeDePas: [{ type: 'vertical', distance: mode === 'chemin' ? 159 : 160 }] }] };
    },
  } });
  const svg = await import('../dist/server/svg.js');
  mock.module('../dist/server/svg.js', { namedExports: { ...svg,
    rendreSvg(...args) {
      for (const nom of noms) {
        if (appels[nom] !== 1) throw new Error(`VERIFICATEUR_NON_APPELE_AVANT_RENDU : ${nom}`);
      }
      if (mode === 'trace') console.log(`conflits-service ${JSON.stringify(conflits)}`);
      return svg.rendreSvg(...args);
    },
  } });
}
