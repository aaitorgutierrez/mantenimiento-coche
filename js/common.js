// Utilidades compartidas por la home 3D y la página de registros.
import { COCHE, PIEZAS, ETIQUETAS } from './data.js';

const K_AJUSTES = 'p208:ajustes';
const K_REGISTROS = 'p208:registros';
const K_FICHA = 'p208:ficha';

export const store = {
  get(key, def) {
    try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
  },
};

export const ajustes = {
  cargar() { return { manualUrl: '', color: '#9aa5b1', ...store.get(K_AJUSTES, {}) }; },
  guardar(a) { store.set(K_AJUSTES, a); },
};
export const registros = {
  cargar() { const r = store.get(K_REGISTROS, []); return Array.isArray(r) ? r : []; },
  guardar(r) { return store.set(K_REGISTROS, r); },
};
export const ficha = {
  porDefecto() {
    return {
      modelo: COCHE.nombre, anio: '2016', motor: '1.2 PureTech 82 CV (HMZ / EB2F)',
      filtroAceite: 'VALEO 586002 (de rosca, no cartucho)', aceite: '5W-30 PSA B71 2290', notas: '',
    };
  },
  cargar() { return { ...ficha.porDefecto(), ...store.get(K_FICHA, {}) }; },
  guardar(f) { store.set(K_FICHA, f); },
};

/** Enlace al PDF en una página concreta, si hay una dirección configurada. */
export function enlaceManual(pagina) {
  const base = ajustes.cargar().manualUrl.trim();
  if (!base) return null;
  return base.split('#')[0] + '#page=' + pagina;
}

/** Todas las piezas, agrupadas por etiqueta, para los desplegables. */
export function piezasPorEtiqueta() {
  const vistos = new Set(); const grupos = [];
  const visitar = (id, lista) => {
    if (vistos.has(id)) return; vistos.add(id); lista.push(id);
    (PIEZAS[id].hijos || []).forEach((h) => visitar(h, lista));
  };
  for (const e of ETIQUETAS) { const lista = []; e.piezas.forEach((p) => visitar(p, lista)); grupos.push({ etiqueta: e.nombre, ids: lista }); }
  return grupos;
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800);
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado: ' + texto); }
  catch { toast(texto); }
}

/** Diálogo de ajustes (color del coche y dirección del PDF del manual). */
export function montarAjustes(onChange) {
  const btn = document.getElementById('btn-ajustes'), dlg = document.getElementById('dlg-ajustes');
  if (!btn || !dlg) return;
  const url = dlg.querySelector('#aj-url'), color = dlg.querySelector('#aj-color');
  const abrir = () => { const a = ajustes.cargar(); url.value = a.manualUrl; color.value = a.color; dlg.showModal(); };
  btn.addEventListener('click', abrir);
  dlg.querySelector('#aj-guardar').addEventListener('click', (e) => {
    e.preventDefault();
    const a = { manualUrl: url.value.trim(), color: color.value };
    ajustes.guardar(a); dlg.close(); toast('Ajustes guardados'); onChange && onChange(a);
  });
  dlg.querySelector('#aj-cerrar').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); });
}

/** Ruta del hash de la home (p. ej. "frenos/freno-del/pinza-del") para llegar a una pieza. */
export function rutaPieza(id) {
  for (const e of ETIQUETAS) {
    const buscar = (pid, path) => {
      const p = [...path, pid];
      if (pid === id) return p;
      for (const h of PIEZAS[pid].hijos || []) { const r = buscar(h, p); if (r) return r; }
      return null;
    };
    for (const top of e.piezas) { const r = buscar(top, []); if (r) return [e.id, ...r].join('/'); }
  }
  return null;
}
