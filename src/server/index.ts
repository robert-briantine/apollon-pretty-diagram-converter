import { creerApplication } from './app.js';

const host = process.env.HOST ?? '127.0.0.1';
const portValue = process.env.PORT ?? '3000';
const port = Number(portValue);

if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT doit être un entier compris entre 0 et 65535.');
}

const app = creerApplication();

const server = app.listen(port, host, () => {
  const address = server.address();
  // Express appelle aussi ce rappel en cas d'échec d'écoute. Ne pas annoncer
  // une adresse disponible quand le port n'a pas pu être lié.
  if (!address) return;
  const boundPort = address && typeof address !== 'string' ? address.port : port;
  const displayHost = host.includes(':') ? `[${host}]` : host;
  console.log(`Serveur disponible sur http://${displayHost}:${boundPort}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Impossible de démarrer le serveur : ${error.message}`);
  process.exitCode = 1;
});
