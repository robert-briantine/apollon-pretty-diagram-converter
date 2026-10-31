import { genererSvg, installerActionsResultat } from './generation.js';

const form = document.querySelector<HTMLFormElement>('#generate-form')!;
const input = document.querySelector<HTMLInputElement>('#diagram-file')!;
const generate = document.querySelector<HTMLButtonElement>('#generate')!;
const fileName = document.querySelector<HTMLParagraphElement>('#file-name')!;
const status = document.querySelector<HTMLParagraphElement>('#app-status')!;
const error = document.querySelector<HTMLParagraphElement>('#app-error')!;
const result = document.querySelector<HTMLElement>('#result')!;
const resultName = document.querySelector<HTMLParagraphElement>('#result-name')!;
const preview = document.querySelector<HTMLImageElement>('#svg-preview')!;
const caption = document.querySelector<HTMLElement>('#preview-caption')!;
const open = document.querySelector<HTMLAnchorElement>('#open-svg')!;
const download = document.querySelector<HTMLAnchorElement>('#download-svg')!;
const fullscreen = document.querySelector<HTMLButtonElement>('#fullscreen')!;
const viewport = document.querySelector<HTMLElement>('.preview')!;
const zoom = document.querySelector<HTMLInputElement>('#zoom')!;
const zoomValue = document.querySelector<HTMLOutputElement>('#zoom-value')!;
const zoomIn = document.querySelector<HTMLButtonElement>('#zoom-in')!;
const zoomOut = document.querySelector<HTMLButtonElement>('#zoom-out')!;
const fit = document.querySelector<HTMLButtonElement>('#fit')!;
let busy = false;
let previewUrl: string | undefined;
let svgResultat: string | undefined;
let nativeFullscreen = false;

function expanded(value: boolean): void {
  result.classList.toggle('expanded', value);
  document.body.classList.toggle('viewer-open', value);
  fullscreen.setAttribute('aria-pressed', String(value));
  fullscreen.textContent = value ? 'Quitter le plein écran' : 'Plein écran';
  for (const sibling of result.parentElement!.children) {
    if (sibling !== result && sibling instanceof HTMLElement) sibling.inert = value;
  }
}
function leaveFullscreen(): void {
  expanded(false);
  if (document.fullscreenElement === result) void document.exitFullscreen().catch(() => {});
  nativeFullscreen = false;
}
fullscreen.addEventListener('click', async () => {
  if (result.classList.contains('expanded')) { leaveFullscreen(); return; }
  expanded(true);
  // La vue couvre aussi la fenêtre si l'API est absente ou refusée.
  if (result.requestFullscreen) {
    try { await result.requestFullscreen(); nativeFullscreen = true; }
    catch { nativeFullscreen = false; }
  }
});
document.addEventListener('fullscreenchange', () => {
  if (nativeFullscreen && document.fullscreenElement !== result) {
    nativeFullscreen = false;
    expanded(false);
    fullscreen.focus();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && result.classList.contains('expanded')) {
    leaveFullscreen();
    fullscreen.focus();
  }
});
function applyZoom(): void {
  const percent = Number(zoom.value);
  zoomValue.value = `${percent} %`;
  zoom.setAttribute('aria-valuetext', `${percent} % de la vue d’ensemble`);
  zoomIn.disabled = percent >= Number(zoom.max);
  zoomOut.disabled = percent <= Number(zoom.min);
  if (percent === 100 || !preview.naturalWidth) {
    preview.style.width = '100%'; preview.style.height = '100%';
  } else {
    const scale = Math.min(viewport.clientWidth / preview.naturalWidth, viewport.clientHeight / preview.naturalHeight) * percent / 100;
    preview.style.width = `${preview.naturalWidth * scale}px`;
    preview.style.height = `${preview.naturalHeight * scale}px`;
  }
}
function resetZoom(): void {
  zoom.value = '100'; applyZoom(); viewport.scrollTo(0, 0);
}
// Conserve le détail au centre (ou sous la souris), y compris les marges
// de l'image en object-fit: contain dans la vue d'ensemble.
function changeZoom(percent: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2): void {
  if (!preview.naturalWidth || !preview.naturalHeight) return;
  const bounds = () => {
    const scale = Math.min(preview.clientWidth / preview.naturalWidth, preview.clientHeight / preview.naturalHeight);
    const width = preview.naturalWidth * scale; const height = preview.naturalHeight * scale;
    return { width, height, left: (preview.clientWidth - width) / 2, top: (preview.clientHeight - height) / 2 };
  };
  const before = bounds();
  const px = Math.max(0, Math.min(1, (viewport.scrollLeft + x - before.left) / before.width));
  const py = Math.max(0, Math.min(1, (viewport.scrollTop + y - before.top) / before.height));
  zoom.value = String(Math.max(Number(zoom.min), Math.min(Number(zoom.max), percent)));
  applyZoom();
  const after = bounds();
  viewport.scrollTo(px * after.width + after.left - x, py * after.height + after.top - y);
}
zoom.addEventListener('input', () => changeZoom(Number(zoom.value)));
zoomIn.addEventListener('click', () => changeZoom(Number(zoom.value) + Number(zoom.step)));
zoomOut.addEventListener('click', () => changeZoom(Number(zoom.value) - Number(zoom.step)));
viewport.addEventListener('wheel', event => {
  if (!event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  changeZoom(Number(zoom.value) + (event.deltaY < 0 ? 1 : -1) * Number(zoom.step),
    event.clientX - rect.left - viewport.clientLeft, event.clientY - rect.top - viewport.clientTop);
}, { passive: false });
fit.addEventListener('click', resetZoom);
preview.addEventListener('load', applyZoom);
new ResizeObserver(applyZoom).observe(viewport);

function clearResult(): void {
  leaveFullscreen();
  resetZoom();
  result.hidden = true;
  preview.removeAttribute('src');
  preview.alt = '';
  open.removeAttribute('href');
  download.removeAttribute('href');
  download.removeAttribute('download');
  resultName.textContent = '';
  caption.textContent = '';
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
  svgResultat = undefined;
}
function clearError(): void {
  error.hidden = true;
  error.textContent = '';
}
function controls(): void {
  input.disabled = busy;
  generate.disabled = busy || !input.files?.length;
  generate.textContent = busy ? 'Génération en cours…' : 'Générer le SVG';
  form.setAttribute('aria-busy', String(busy));
}
input.addEventListener('change', () => {
  clearResult();
  clearError();
  const file = input.files?.[0];
  fileName.textContent = file ? `Fichier sélectionné : ${file.name}` : 'Aucun fichier sélectionné.';
  status.textContent = file ? 'Prêt à générer le SVG.' : 'Sélectionnez un fichier JSON pour commencer.';
  controls();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  clearResult();
  clearError();
  const file = input.files?.[0];
  if (!file) {
    error.textContent = 'Sélectionnez un fichier JSON avant de générer le SVG.';
    error.hidden = false;
    input.focus();
    return;
  }
  busy = true;
  controls();
  status.textContent = `Lecture de « ${file.name} »…`;
  try {
    if (file.size > 1024 * 1024) throw new Error('Le fichier dépasse la limite de 1 Mio. Sélectionnez un fichier plus petit.');
    let json: string;
    try { json = await file.text(); } catch {
      throw new Error('Impossible de lire le fichier sélectionné. Sélectionnez-le de nouveau et vérifiez son accès.');
    }
    try { JSON.parse(json); } catch {
      throw new Error('Le fichier ne contient pas un JSON valide. Corrigez son format ou sélectionnez un autre fichier.');
    }
    status.textContent = `Génération du SVG de « ${file.name} »…`;
    const body = await genererSvg(json);
    const documentSvg = new DOMParser().parseFromString(body, 'image/svg+xml');
    if (documentSvg.querySelector('parsererror')
      || documentSvg.documentElement.localName !== 'svg'
      || documentSvg.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') {
      throw new Error('Le serveur a retourné un SVG invalide. Réessayez la génération.');
    }
    // Une sélection modifiée pendant une lecture ne doit jamais annoncer un autre fichier.
    if (input.files?.[0] !== file) throw new Error('La sélection a changé. Relancez la génération du fichier sélectionné.');
    svgResultat = body;
    previewUrl = URL.createObjectURL(new Blob([body], { type: 'image/svg+xml;charset=utf-8' }));
    preview.src = previewUrl;
    preview.alt = `Diagramme généré depuis ${file.name}`;
    open.href = previewUrl;
    download.href = previewUrl;
    download.download = `${file.name.replace(/\.json$/i, '') || 'diagram'}.svg`;
    resultName.textContent = `Résultat de : ${file.name}`;
    caption.textContent = `Vue d’ensemble — ${file.name}`;
    result.hidden = false;
    status.textContent = `SVG de « ${file.name} » généré avec succès. Vous pouvez le consulter et l’enregistrer.`;
  } catch (cause) {
    clearResult();
    status.textContent = `Échec de la génération de « ${file.name} ». Vous pouvez réessayer ou changer de fichier.`;
    error.textContent = cause instanceof Error ? cause.message : 'La génération a échoué. Réessayez.';
    error.hidden = false;
  } finally {
    busy = false;
    controls();
  }
});
installerActionsResultat(open, download, () => svgResultat, () => download.download, message => {
  error.textContent = message; error.hidden = false;
});
window.addEventListener('pagehide', event => { if (!event.persisted) clearResult(); });
controls();
status.textContent = 'Sélectionnez un fichier JSON pour commencer.';
export {};
