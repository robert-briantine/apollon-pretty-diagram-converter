import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { fileURLToPath } from 'node:url';
import { convertirDiagramme, ErreurConversion } from './conversion.js';
import { ErreurImportDiagramme } from './importer.js';

/** Limite en octets du document JSON, indépendante des chemins locaux. */
export const LIMITE_JSON = 1024 * 1024;

export function creerApplication() {
  const app = express();
  app.disable('x-powered-by');

  app.post('/api/generate', (req, res, next) => {
    if (!req.is('application/json')) {
      res.status(400).json({ error: {
        code: 'CONTENT_TYPE_INVALIDE', message: 'Envoyez le diagramme avec Content-Type: application/json.',
      } });
      return;
    }
    next();
  }, express.json({ limit: LIMITE_JSON, strict: false, inflate: false }), (req, res) => {
    // Le corps est un document Appolon JS, jamais un nom de fichier à ouvrir.
    const svg = convertirDiagramme(req.body);
    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': 'inline; filename="diagram.svg"',
      'Cache-Control': 'no-store',
    }).status(200).send(svg);
  });

  // Chemins relatifs au fichier compilé, indépendants du répertoire de lancement.
  app.use('/assets', express.static(fileURLToPath(new URL('../client/', import.meta.url))));
  app.use(express.static(fileURLToPath(new URL('../../public/', import.meta.url))));

  const erreurs: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    if (type === 'entity.too.large') {
      res.status(413).json({ error: {
        code: 'CORPS_TROP_VOLUMINEUX', message: `Le corps JSON dépasse la limite de ${LIMITE_JSON} octets (1 Mio).`,
      } });
    } else if (type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'JSON_INVALIDE', message: 'Le corps contient un JSON mal formé.' } });
    } else if (['encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(String(type))) {
      res.status(400).json({ error: {
        code: 'CORPS_INVALIDE', message: 'Envoyez un corps JSON complet en UTF-8, sans compression.',
      } });
    } else if (error instanceof ErreurConversion && error.etape === 'import' && error.cause instanceof ErreurImportDiagramme) {
      res.status(400).json({ error: { code: 'DIAGRAMME_INVALIDE', message: error.message } });
    } else {
      console.error('Échec interne de génération SVG :', error);
      res.status(500).json({ error: {
        code: 'ERREUR_INTERNE', message: 'La génération SVG a échoué. Réessayez ou contactez le responsable du serveur.',
      } });
    }
  };
  app.use(erreurs);
  return app;
}
