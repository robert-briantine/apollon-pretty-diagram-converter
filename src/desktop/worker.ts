import { convertirJson } from '../server/conversion.js';

self.addEventListener('message', (event: MessageEvent<string>) => {
  try { self.postMessage({ svg: convertirJson(event.data) }); }
  catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : 'La conversion locale a échoué.' }); }
});
