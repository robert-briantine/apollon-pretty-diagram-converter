// Test de la véritable application Linux : WebKitGTK, IPC et dialogue de fichiers.
// Prérequis : tauri-driver, WebKitWebDriver, Xvfb, xdotool, dbus-run-session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertirJson } from '../dist/server/conversion.js';

const root = resolve(import.meta.dirname, '..');
const binary = resolve(root, 'src-tauri/target/aarch64-unknown-linux-gnu/release/diagrammes-activite');
const reference = await readFile(resolve(root, 'diagram.json'), 'utf8');
const pause = () => new Promise(accept => setTimeout(accept, 100));
async function until(action, message = 'Attente expirée') {
  const end = Date.now() + 20000;
  while (Date.now() < end) { const value = await action(); if (value) return value; await pause(); }
  throw new Error(message);
}
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening'); const port = server.address().port;
  await new Promise(accept => server.close(accept)); return port;
}

test('desktop-natif-linux-selection-worker-dialogue-export-fenetre-et-reprise', { timeout: 120000 }, async t => {
  assert.equal(process.platform, 'linux', 'Ce test natif nécessite Linux ARM64 et WebKitGTK.');
  assert.equal(process.arch, 'arm64');
  await access(binary);
  const directory = await mkdtemp(join(tmpdir(), 'diagrammes-native-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const groups = [];
  let stderr = '';
  function start(command, args, { port = null, ports = {}, ...options } = {}) {
    const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    const group = { child, port, ports, done: false };
    child.on('close', () => { group.done = true; });
    child.on('error', error => { stderr += `${error}\n`; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    groups.push(group); return child;
  }
  t.after(async () => {
    for (const { child, port, ports } of groups.reverse()) {
      if (!child.pid) continue;
      const processes = execFileSync('ps', ['-eo', 'pid,pgid,comm'], { encoding: 'utf8' }).split('\n')
        .map(line => line.trim().split(/\s+/)).filter(([, pgid]) => Number(pgid) === child.pid);
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await until(() => {
        const alive = execFileSync('ps', ['-eo', 'pgid,stat'], { encoding: 'utf8' }).split('\n')
          .some(line => { const [pgid, stat] = line.trim().split(/\s+/); return Number(pgid) === child.pid && !stat.startsWith('Z'); });
        return !alive;
      }, 'Groupe de processus de test non arrêté');
      for (const [pid, , command] of processes) {
        console.log(`serveur-test ${JSON.stringify({ pid: Number(pid), port: ports[command] ?? (command === 'tauri-driver' ? port : null), stopped: true })}`);
      }
    }
    if (t.signal.aborted || t.passed === false) console.error(stderr);
  });
  // Un écran distinct protège toutes les fenêtres et tous les processus préexistants.
  const xvfb = start(process.env.XVFB ?? 'Xvfb', ['-displayfd', '3', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'],
    { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
  let display = '';
  xvfb.stdio[3].on('data', chunk => { display += chunk; });
  await until(() => display.trim(), 'Xvfb indisponible : installer xvfb ou définir XVFB');
  const port = await freePort(); const nativePort = await freePort();
  const env = { ...process.env, DISPLAY: `:${display.trim()}`, NO_AT_BRIDGE: '1', GDK_BACKEND: 'x11',
    // Xvfb ne fournit pas l'accélération DRI du bureau réel.
    WEBKIT_DISABLE_DMABUF_RENDERER: '1', WEBKIT_DISABLE_COMPOSITING_MODE: '1',
    GTK_USE_PORTAL: '0', GIO_USE_VFS: 'local', GSETTINGS_BACKEND: 'memory' };
  // Le bus privé évite de toucher les portails du bureau de l'utilisateur.
  start('dbus-run-session', ['--', process.env.TAURI_DRIVER ?? 'tauri-driver', '--port', String(port),
    '--native-port', String(nativePort), '--native-driver', process.env.WEBKIT_WEBDRIVER ?? 'WebKitWebDriver'],
    { env, port, ports: { WebKitWebDriver: nativePort } });
  const base = `http://127.0.0.1:${port}`;
  await until(async () => { try { return (await fetch(`${base}/status`)).ok; } catch { return false; } }, 'Pilote WebDriver indisponible');
  let session;
  async function request(method, path, payload) {
    if (process.env.NATIVE_DEBUG) console.log(`webdriver ${method} ${path}`);
    const response = await fetch(`${base}${path}`, { method,
      ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(60000) });
    const body = await response.json();
    if (!response.ok || body.value?.error) throw new Error(JSON.stringify(body));
    return body.value;
  }
  const created = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binary } } } });
  session = created.sessionId;
  t.after(async () => { try { await request('DELETE', `/session/${session}`); } catch {} });
  const command = (method, path, payload) => request(method, `/session/${session}${path}`, payload);
  const script = (source, args = []) => command('POST', '/execute/sync', { script: source, args });
  const run = body => script(`return (${body})();`);
  const element = async selector => (await command('POST', '/element', { using: 'css selector', value: selector }))['element-6066-11e4-a52e-4f735466cecf'];
  const click = async selector => command('POST', `/element/${await element(selector)}/click`, {});
  const choose = async path => command('POST', `/element/${await element('#diagram-file')}/value`, { text: path });
  const ready = () => until(() => run("() => document.querySelector('#app-status').textContent.includes('avec succès')"), 'Génération native échouée');
  const imageSvg = () => command('POST', '/execute/async', { script:
    'const done = arguments[arguments.length - 1]; fetch(document.querySelector("#svg-preview").src).then(r => r.text()).then(done).catch(e => done({error: String(e)}));', args: [] });
  const artifact = resolve(root, 'dist/verification-desktop'); await mkdir(artifact, { recursive: true });
  const screenshot = async name => writeFile(resolve(artifact, name), Buffer.from(await command('GET', '/screenshot'), 'base64'));

  await until(() => run("() => !!document.querySelector('#diagram-file') && !document.querySelector('#diagram-file').disabled"), 'Interface Tauri non chargée');
  assert.equal(await run("() => document.querySelector('#generate').disabled"), true);
  await choose(resolve(root, 'diagram.json')); await click('#generate'); await ready();
  await until(() => run("() => document.querySelector('#svg-preview').naturalWidth > 0"), 'Image non chargée');
  assert.equal(await imageSvg(), convertirJson(reference), 'Même moteur et mêmes trois vérificateurs que le service Express');
  await screenshot('linux-apercu.png');
  await click('#zoom-in'); assert.equal(await run("() => document.querySelector('#zoom-value').textContent"), '125 %');
  await click('#fullscreen');
  await until(() => run("() => document.querySelector('#result').classList.contains('expanded')"));
  await screenshot('linux-plein-ecran.png');
  await script('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape"}));');

  const xdotool = (...args) => execFileSync(process.env.XDOTOOL ?? 'xdotool', args, { env, encoding: 'utf8', timeout: 5000 }).trim();
  async function dialog() {
    return until(() => { try { return xdotool('search', '--onlyvisible', '--name', '^Enregistrer le SVG$').split('\n')[0]; } catch { return false; } }, 'Dialogue natif non ouvert');
  }
  // Une vraie annulation puis un vrai enregistrement, sans doublure de l'IPC.
  await click('#download-svg');
  let window = await dialog(); xdotool('windowfocus', '--sync', window); xdotool('key', '--clearmodifiers', 'Escape');
  await until(() => run("() => !document.querySelector('#download-svg').hasAttribute('aria-busy')"));
  assert.equal(await run("() => document.querySelector('#app-error').hidden"), true);
  await click('#download-svg'); window = await dialog(); xdotool('windowfocus', '--sync', window);
  const saved = join(directory, 'présentation.svg');
  xdotool('key', '--clearmodifiers', 'ctrl+a'); xdotool('type', '--clearmodifiers', '--', saved); xdotool('key', 'Return');
  await until(async () => { try { return (await readFile(saved, 'utf8')) === convertirJson(reference); } catch { return false; } }, 'SVG natif non enregistré');
  await access(saved);
  // La fenêtre de consultation reçoit le contenu exact et l'affiche en taille réelle.
  await click('#open-svg');
  const handles = await until(async () => { const h = await command('GET', '/window/handles'); return h.length === 2 && h; });
  const main = await command('GET', '/window');
  await command('POST', '/window', { handle: handles.find(handle => handle !== main) });
  await until(() => run('() => document.querySelector("img")?.naturalWidth > 0'));
  assert.equal(await run('() => window.__diagramSvg'), await readFile(saved, 'utf8'));
  await screenshot('linux-taille-reelle.png');
  await command('DELETE', '/window'); await command('POST', '/window', { handle: main });
  const invalid = join(directory, 'invalide.json'); await writeFile(invalid, '{}');
  await choose(invalid); await click('#generate');
  await until(() => run("() => !document.querySelector('#app-error').hidden"));
  assert.equal(await run("() => document.querySelector('#result').hidden && !document.querySelector('#svg-preview').hasAttribute('src')"), true);
  const changed = JSON.parse(reference); changed.nodes[0].data = { ...changed.nodes[0].data, name: 'Deuxième présentation — Été' };
  const second = join(directory, 'autre.json'); await writeFile(second, JSON.stringify(changed));
  await choose(second); await click('#generate'); await ready();
  assert.match(await run("() => document.querySelector('#result-name').textContent"), /autre.json/);
  assert.equal(await imageSvg(), convertirJson(JSON.stringify(changed)));
  await command('POST', '/window/rect', { width: 360, height: 800 });
  assert.equal(await run('() => document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('linux-fenetre-etroite.png');
  console.log(`captures-natives ${artifact}`);
});
