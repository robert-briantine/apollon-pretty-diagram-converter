import { convertirFichier } from './fichiers.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args.some(arg => arg.trim() === '')) {
  console.error('Usage : node dist/server/convertir.js <source.json> <destination.svg>');
  process.exitCode = 1;
} else {
  try {
    await convertirFichier(args[0], args[1]);
    console.log(`SVG généré : ${args[1]}`);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
