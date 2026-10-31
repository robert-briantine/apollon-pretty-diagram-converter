// Injection réservée aux sous-processus de tests : aucune porte dérobée dans
// le service ou la commande. Les trois vérificateurs restent les vrais modules.
import { mock } from 'node:test';

const fault = process.env.DIAGRAM_TEST_FAULT;
if (fault === 'rendu') {
  mock.module('../dist/server/svg.js', { namedExports: {
    rendreSvg() { throw new Error('RENDU_CONTROLE'); },
  } });
} else if (fault === 'ecriture') {
  const fs = await import('node:fs/promises');
  mock.module('node:fs/promises', { namedExports: { ...fs,
    async writeFile(...args) {
      await fs.writeFile(args[0], 'sortie partielle', 'utf8');
      throw Object.assign(new Error('ENOSPC : disque plein contrôlé'), { code: 'ENOSPC' });
    },
  } });
} else {
  const routage = await import('../dist/server/routage.js');
  mock.module('../dist/server/routage.js', { namedExports: { ...routage,
    computeSpatialGraphe(g, options) {
      const spatial = routage.computeSpatialGraphe(g, options);
      const placement = (id, x, y) => ({ forme: { ...spatial.sommets[id].forme, dx: 100, dy: 40 },
        p: { x, y }, connexions: [{ x: x + 50, y }, { x: x + 100, y: y + 20 },
          { x: x + 50, y: y + 40 }, { x, y: y + 20 }] });
      return { sommets: {
        a: placement('a', 0, 0), b: placement('b', 0, 200),
        c: placement('c', fault === 'placement' ? 0 : fault === 'obstacle' ? 25 : 300,
          fault === 'placement' ? 0 : 100),
      }, chemins: [{ arcId: 'ab', debut: 'a', fin: 'b', idx: 2,
        listeDePas: [{ type: 'vertical', distance: fault === 'chemin' ? 159 : 160 }] }] };
    },
  } });
}
