declare global { interface Window { __diagramSvg: string } }
const image = document.querySelector<HTMLImageElement>('img')!;
const url = URL.createObjectURL(new Blob([window.__diagramSvg], { type: 'image/svg+xml;charset=utf-8' }));
image.src = url;
window.addEventListener('pagehide', () => URL.revokeObjectURL(url));
export {};
