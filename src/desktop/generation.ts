import { invoke } from '@tauri-apps/api/core';

/** Un worker dédié garde les contrôles réactifs et peut être arrêté à expiration. */
export function genererSvg(json: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    const finish = (action: () => void) => { clearTimeout(timer); worker.terminate(); action(); };
    const timer = window.setTimeout(() => finish(() => reject(new Error(
      'La génération locale met trop de temps. Réessayez avec un diagramme plus petit.',
    ))), 60000);
    worker.onmessage = (event: MessageEvent<{ svg?: string; error?: string }>) => {
      finish(() => event.data.svg !== undefined ? resolve(event.data.svg) : reject(new Error(event.data.error ?? 'La conversion locale a échoué.')));
    };
    worker.onerror = event => {
      event.preventDefault();
      finish(() => reject(new Error('Impossible de démarrer la conversion locale. Relancez la génération.')));
    };
    worker.postMessage(json);
  });
}

export function installerActionsResultat(
  open: HTMLAnchorElement, download: HTMLAnchorElement,
  svg: () => string | undefined, name: () => string, error: (message: string) => void,
): void {
  for (const [link, command] of [[open, 'open_svg'], [download, 'save_svg']] as const) {
    let pending = false;
    link.addEventListener('click', async event => {
      event.preventDefault();
      const content = svg();
      if (pending || content === undefined) return;
      pending = true; link.setAttribute('aria-busy', 'true');
      try { await invoke(command, { svg: content, name: name() }); }
      catch (cause) { error(`Impossible ${command === 'save_svg' ? 'd’enregistrer' : 'd’ouvrir'} le SVG : ${String(cause)}`); }
      finally { pending = false; link.removeAttribute('aria-busy'); }
    });
  }
  open.textContent = 'Ouvrir à taille réelle (nouvelle fenêtre)';
}
