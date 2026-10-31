/** Transport du navigateur Express ; le paquet Tauri fournit un transport local. */
export async function genererSvg(json: string): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60000);
  try {
    let response: Response;
    let body: string;
    try {
      response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, signal: controller.signal,
      });
      body = await response.text();
    } catch {
      throw new Error(controller.signal.aborted
        ? 'Le serveur met trop de temps à répondre. Réessayez la génération.'
        : 'Impossible de joindre le serveur ou de recevoir le SVG. Vérifiez la connexion réseau et réessayez.');
    }
    if (!response.ok) {
      let message = `Le serveur a refusé la génération (HTTP ${response.status}). Réessayez ou corrigez le diagramme.`;
      try {
        const payload: unknown = JSON.parse(body);
        if (payload && typeof payload === 'object' && 'error' in payload) {
          const detail = payload.error;
          if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string' && detail.message.trim()) {
            message = detail.message;
          }
        }
      } catch { /* Une réponse intermédiaire conserve le message HTTP lisible. */ }
      throw new Error(message);
    }
    if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('image/svg+xml')) {
      throw new Error('Le serveur a retourné un SVG invalide. Réessayez la génération.');
    }
    return body;
  } finally { window.clearTimeout(timeout); }
}

/** Dans le navigateur les liens blob natifs assurent ouverture et téléchargement. */
export function installerActionsResultat(
  _open: HTMLAnchorElement, _download: HTMLAnchorElement,
  _svg: () => string | undefined, _name: () => string, _error: (message: string) => void,
): void {}
