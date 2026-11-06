import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar } from './car.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ETIQUETAS, PIEZAS, textoPaginas } from './data.js';
import { ajustes, registros, enlaceManual, copiar, montarAjustes } from './common.js';

const $ = (s, r = document) => r.querySelector(s);
const canvas = $('#gl'), pinsEl = $('#pins'), panel = $('#panel'), rail = $('#rail'), hint = $('#hint');
const HOME = { t: [0, 0.6, 0], d: 7.6, az: -38, el: 15 };
const XRAY_TAG = { carroceria: 0, ruedas: 0.35, frenos: 0.5 };       // resto de etiquetas: 1
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────────── escena ─────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 6, 3); scene.add(key);

const car = buildCar({ bodyColor: ajustes.cargar().color });
scene.add(car.group);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 1.0; controls.maxDistance = 20; controls.maxPolarAngle = Math.PI * 0.495;
controls.enablePan = false; controls.autoRotate = !reduceMotion; controls.autoRotateSpeed = 0.9;
controls.addEventListener('start', () => { controls.autoRotate = false; cancelFlight(); });

// ───────────── estado ─────────────
const tagById = Object.fromEntries(ETIQUETAS.map((e) => [e.id, e]));
const state = { tag: null, path: [] };

/** Para cada pieza, todas las rutas (etiqueta + cadena de ids) que llevan hasta ella. */
const chains = {};
for (const e of ETIQUETAS) {
  const visit = (id, path) => {
    const p = [...path, id];
    (chains[id] ||= []).push({ tag: e.id, path: p });
    (PIEZAS[id].hijos || []).forEach((h) => visit(h, p));
  };
  e.piezas.forEach((id) => visit(id, []));
}
const current = () => (state.path.length ? PIEZAS[state.path[state.path.length - 1]] : null);
const currentId = () => state.path[state.path.length - 1] || null;

function descendants(id, out = new Set()) {
  out.add(id); (PIEZAS[id].hijos || []).forEach((h) => descendants(h, out)); return out;
}
/** Piezas cuyo botón (pin) se muestra ahora. */
function visibleLevel() {
  if (!state.tag) return [];
  if (!state.path.length) return tagById[state.tag].piezas;
  const cur = current();
  if (cur.hijos && cur.hijos.length) return cur.hijos;
  if (state.path.length > 1) { const par = PIEZAS[state.path[state.path.length - 2]]; return par.hijos || []; }
  return tagById[state.tag].piezas;
}

// ───────────── cámara ─────────────
let flight = null;
function vistaAjustada(v) {
  const asp = innerWidth / innerHeight;
  const k = asp < 1 ? Math.pow(1 / asp, 0.9) : 1;
  return { ...v, d: Math.min(controls.maxDistance, v.d * k) };
}
function offsetOf(v) {
  const d = v.d, az = THREE.MathUtils.degToRad(v.az), el = THREE.MathUtils.degToRad(v.el);
  return new THREE.Vector3(d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az));
}
function flyTo(v, ms = 1100) {
  v = vistaAjustada(v);
  const t1 = new THREE.Vector3(...v.t), off1 = offsetOf(v);
  const t0 = controls.target.clone(), off0 = camera.position.clone().sub(t0);
  const sph0 = new THREE.Spherical().setFromVector3(off0), sph1 = new THREE.Spherical().setFromVector3(off1);
  let dTheta = sph1.theta - sph0.theta; dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
  if (reduceMotion) ms = 0;
  flight = { t0, t1, sph0, sph1, dTheta, start: performance.now(), ms };
  if (ms === 0) stepFlight(performance.now());
}
function cancelFlight() { flight = null; }
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function stepFlight(now) {
  if (!flight) return;
  const f = flight, k = f.ms === 0 ? 1 : Math.min(1, (now - f.start) / f.ms), e = ease(k);
  const t = f.t0.clone().lerp(f.t1, e);
  const s = new THREE.Spherical(THREE.MathUtils.lerp(f.sph0.radius, f.sph1.radius, e),
    THREE.MathUtils.lerp(f.sph0.phi, f.sph1.phi, e), f.sph0.theta + f.dTheta * e);
  controls.target.copy(t); camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s));
  if (k >= 1) flight = null;
}

// Desplazamiento de la imagen para que el coche quede libre del panel.
const viewOff = { x: 0, y: 0, tx: 0, ty: 0 };
function updateViewOffset() {
  const w = innerWidth, h = innerHeight, open = !panel.hidden;
  viewOff.tx = 0; viewOff.ty = 0;
  if (!open) return;
  if (w >= 900) { viewOff.tx = (panel.getBoundingClientRect().width + 16) / 2; return; }
  // Móvil: centrar el coche en el hueco visible entre la cabecera y el panel.
  const top = 58, bottom = panel.getBoundingClientRect().top;
  viewOff.ty = Math.max(0, h / 2 - (top + Math.max(top + 120, bottom)) / 2);
}
// ───────────── pines ─────────────
const pinEls = new Map();
function rebuildPins() {
  pinsEl.textContent = ''; pinEls.clear();
  const active = currentId();
  for (const id of visibleLevel()) {
    const p = PIEZAS[id]; if (!p.ancla) continue;
    const b = document.createElement('button');
    b.className = 'pin' + (id === active ? ' on' : '') + (p.refs && p.refs.length ? '' : ' vacio') + (p.lado === 'izq' ? ' izq' : '');
    b.type = 'button'; b.dataset.id = id;
    b.innerHTML = '<span class="dot"></span><span class="lbl"></span>'; b.lastChild.textContent = p.nombre;
    b.setAttribute('aria-label', p.nombre);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); selectPart(id); });
    pinsEl.appendChild(b); pinEls.set(id, { el: b, v: new THREE.Vector3(...p.ancla), lado: p.lado });
  }
}
const tmp = new THREE.Vector3();
function updatePins() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const { el, v, lado } of pinEls.values()) {
    tmp.copy(v).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
    el.style.display = vis ? '' : 'none';
    if (vis) {
      const px = (tmp.x * 0.5 + 0.5) * w;
      el.style.transform = `translate(${px.toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      // La etiqueta se abre hacia el lado con más sitio para que no se salga de la pantalla.
      el.classList.toggle('izq', px > w * 0.62 ? true : px < w * 0.38 ? false : lado === 'izq');
    }
  }
}

// ───────────── selección ─────────────
function applyScene() {
  const cur = current();
  let ids = [];
  if (!state.tag) { car.setHighlight([], false); car.setRegion(null); car.setXray(0); return; }
  if (cur) {
    ids = [...descendants(currentId())].filter((i) => car.partMeshes[i]);
    car.setRegion(cur.region || null);
  } else {
    car.setRegion(null);
    ids = tagById[state.tag].piezas.flatMap((i) => [...descendants(i)]).filter((i) => car.partMeshes[i]);
  }
  car.setHighlight(ids, ids.length > 0 && (!!cur || state.tag !== 'carroceria'));
  let x = XRAY_TAG[state.tag] ?? 1;
  if (cur && car.partMeshes[currentId()] && state.tag === 'carroceria') x = 1;
  if (cur && cur.region && state.tag === 'carroceria') x = 0;
  car.setXray(x);
}

function go(tag, path, { fly = true, push = true } = {}) {
  state.tag = tag; state.path = path;
  controls.autoRotate = false;
  rebuildPins(); applyScene(); renderPanel(); renderRail(); updateViewOffset();
  hint.hidden = !!tag;
  if (fly) {
    const v = !tag ? HOME : path.length ? (current().vista || tagById[tag].vista) : tagById[tag].vista;
    flyTo(v);
  }
  if (push) history.replaceState(null, '', tag ? '#' + [tag, ...path].join('/') : location.pathname + location.search);
}
function selectTag(id) { id === state.tag && !state.path.length ? go(null, []) : go(id, []); }
function selectPart(id) {
  const cur = current();
  if (cur && (cur.hijos || []).includes(id)) return go(state.tag, [...state.path, id]);                       // bajar a una subpieza
  if (state.path.length > 1 && (PIEZAS[state.path[state.path.length - 2]].hijos || []).includes(id))          // pieza hermana
    return go(state.tag, [...state.path.slice(0, -1), id]);
  if (state.tag && tagById[state.tag].piezas.includes(id)) return go(state.tag, [id]);                         // pieza de primer nivel
  const route = (state.tag && chains[id]?.find((c) => c.tag === state.tag)) || chains[id]?.[0];               // cualquier otra ruta
  if (route) go(route.tag, route.path);
}
function back() {
  if (state.path.length) go(state.tag, state.path.slice(0, -1));
  else if (state.tag) go(null, []);
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) back(); });

// ───────────── clic sobre el modelo 3D ─────────────
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 6 || dt > 600) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(car.pickables(), false).filter((h) => h.object.visible && h.object.material.opacity > 0.4);
  // Si el clic cae sobre la carcasa exterior antes que sobre una pieza interior, no se selecciona nada.
  if (!hits.length) return;
  const shellHit = ray.intersectObjects(car.shellMeshes().filter((o) => o.visible), false)[0];
  const xr = (XRAY_TAG[state.tag] ?? (state.tag ? 1 : 0));
  if (shellHit && shellHit.distance < hits[0].distance - 0.01 && xr < 0.6) return;
  const id = car.partIdAt(hits[0]); if (id) selectPart(id);
});

// ───────────── panel de información ─────────────
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function crumbs() {
  const out = [`<button class="crumb" data-act="home">Coche</button>`];
  if (state.tag) out.push(`<button class="crumb" data-act="tag" data-id="${state.tag}">${esc(tagById[state.tag].nombre)}</button>`);
  state.path.forEach((id, i) => out.push(`<button class="crumb" data-act="path" data-i="${i}">${esc(PIEZAS[id].nombre)}</button>`));
  return out.join('<span class="sep" aria-hidden="true">/</span>');
}
function refHtml(r) {
  const link = enlaceManual(r.a);
  return `<li class="ref">
    <span class="pg">${esc(textoPaginas(r))}</span>
    <span class="rt"><strong>${esc(r.t)}</strong>${r.n ? `<small>${esc(r.n)}</small>` : ''}</span>
    <span class="ra"><button class="mini" data-copy="${esc(textoPaginas(r))}" title="Copiar páginas">Copiar</button>${link ? `<a class="mini" href="${esc(link)}" target="_blank" rel="noopener">Abrir</a>` : ''}</span>
  </li>`;
}
function renderPanel() {
  const cur = current(), tag = state.tag && tagById[state.tag];
  if (!tag) { panel.hidden = true; updateViewOffset(); return; }
  panel.hidden = false;
  let h = `<div class="ph"><nav class="crumbs" aria-label="Ruta">${crumbs()}</nav><button class="x" data-act="back" aria-label="Volver">×</button></div>`;
  if (!cur) {
    h += `<h2>${esc(tag.nombre)}</h2><p class="lead">Elige una pieza en el coche o aquí.</p><ul class="lista">`;
    for (const id of tag.piezas) {
      const p = PIEZAS[id]; const n = p.refs ? p.refs.length : 0;
      h += `<li><button class="fila" data-act="part" data-id="${id}"><span>${esc(p.nombre)}</span><small class="${n ? '' : 'sin'}">${n ? n + (n === 1 ? ' referencia' : ' referencias') : 'sin info'}</small></button></li>`;
    }
    h += '</ul>';
  } else {
    const id = currentId(), n = registros.cargar().filter((r) => r.pieza === id).length;
    h += `<h2>${esc(cur.nombre)}</h2>`;
    if (cur.desc) h += `<p class="lead">${esc(cur.desc)}</p>`;
    if (cur.datos && cur.datos.length) h += `<dl class="datos">${cur.datos.map((d) => `<div><dt>${esc(d.k)}</dt><dd>${esc(d.v)}</dd></div>`).join('')}</dl>`;
    if (cur.refs && cur.refs.length) {
      h += `<h3>En el manual</h3><ul class="refs">${cur.refs.map(refHtml).join('')}</ul>`;
      if (cur.nota) h += `<p class="nota">${esc(cur.nota)}</p>`;
    } else {
      h += `<div class="sininfo"><strong>Sin información registrada</strong><p>Esta pieza todavía no tiene páginas del manual asociadas.</p></div>`;
    }
    if (cur.hijos && cur.hijos.length) {
      h += `<h3>Piezas</h3><ul class="lista">${cur.hijos.map((c) => `<li><button class="fila" data-act="part" data-id="${c}"><span>${esc(PIEZAS[c].nombre)}</span><small class="${PIEZAS[c].refs && PIEZAS[c].refs.length ? '' : 'sin'}">${PIEZAS[c].refs && PIEZAS[c].refs.length ? '' : 'sin info'}</small></button></li>`).join('')}</ul>`;
    }
    h += `<div class="pie"><a class="enlace" href="mantenimiento.html?pieza=${encodeURIComponent(id)}">${n ? `Ver ${n} ${n === 1 ? 'registro' : 'registros'}` : 'Añadir un registro'} de esta pieza</a></div>`;
  }
  panel.innerHTML = h; panel.scrollTop = 0;
  updateViewOffset(); requestAnimationFrame(updateViewOffset);
}
panel.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-copy]'); if (!t) return;
  if (t.dataset.copy) return copiar(t.dataset.copy + ' del PDF');
  const act = t.dataset.act;
  if (act === 'back') back();
  else if (act === 'home') go(null, []);
  else if (act === 'tag') go(t.dataset.id, []);
  else if (act === 'path') go(state.tag, state.path.slice(0, +t.dataset.i + 1));
  else if (act === 'part') selectPart(t.dataset.id);
});

// ───────────── barra de etiquetas ─────────────
function renderRail() {
  rail.innerHTML = ETIQUETAS.map((e) => `<button class="tag${e.id === state.tag ? ' on' : ''}" data-id="${e.id}" aria-pressed="${e.id === state.tag}">${esc(e.nombre)}</button>`).join('');
}
rail.addEventListener('click', (e) => { const b = e.target.closest('.tag'); if (b) selectTag(b.dataset.id); });
$('.brand').addEventListener('click', (e) => { e.preventDefault(); go(null, []); });

// ───────────── bucle y tamaño ─────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', () => { resize(); updateViewOffset(); });
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  stepFlight(now);
  controls.update();
  car.update(dt);
  viewOff.x += (viewOff.tx - viewOff.x) * 0.12; viewOff.y += (viewOff.ty - viewOff.y) * 0.12;
  const w = innerWidth, h = innerHeight;
  if (Math.abs(viewOff.x) > 0.5 || Math.abs(viewOff.y) > 0.5) camera.setViewOffset(w, h, viewOff.x, viewOff.y, w, h); else camera.clearViewOffset();
  if (!window.__pause) renderer.render(scene, camera);
  updatePins();
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

// ───────────── arranque ─────────────
resize();
{
  const v = vistaAjustada(HOME); const o = offsetOf(v);
  controls.target.set(...v.t); camera.position.set(v.t[0] + o.x, v.t[1] + o.y, v.t[2] + o.z);
}
renderRail();
montarAjustes((a) => car.setBodyColor(a.color));
car.setBodyColor(ajustes.cargar().color);
const [tg, ...rest] = location.hash.replace('#', '').split('/').filter(Boolean);
if (tg && tagById[tg] && rest.every((id) => PIEZAS[id])) go(tg, rest, { push: false }); else go(null, [], { fly: false, push: false });
window.__app = { go, state, car, camera, controls };
// Carga del modelo 3D real; si falla, se queda el modelo propio.
const estado = document.createElement('p'); estado.className = 'carga'; estado.textContent = 'Cargando el modelo 3D…'; document.body.appendChild(estado);
new GLTFLoader().loadAsync('assets/peugeot208.glb').then((gl) => {
  car.useModel(gl.scene, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  car.setBodyColor(ajustes.cargar().color); applyScene(); estado.remove(); window.__modelReady = true;
}).catch((e) => { console.warn('No se pudo cargar el modelo real:', e); estado.textContent = 'No se pudo cargar el modelo 3D; se muestra una versión simple.'; setTimeout(() => estado.remove(), 4000); window.__modelReady = false; });
requestAnimationFrame(frame);
document.title = 'Peugeot 208 · taller';
