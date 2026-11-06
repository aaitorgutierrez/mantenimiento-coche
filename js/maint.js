import { PIEZAS } from './data.js';
import { registros, ficha, piezasPorEtiqueta, rutaPieza, toast, montarAjustes } from './common.js';

const $ = (s) => document.querySelector(s);
const TIPOS = ['Aceite y filtro', 'Filtros (aire, habitáculo, combustible)', 'Frenos', 'Neumáticos y ruedas', 'Distribución y correas',
  'Batería y eléctrico', 'Bujías y encendido', 'Refrigeración', 'Revisión o ITV', 'Reparación', 'Otro'];
const ACEITE = TIPOS[0];
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('es-ES');
const hoy = () => new Date().toISOString().slice(0, 10);
const fmtFecha = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

let datos = registros.cargar();
let editando = null;

// ───────────── desplegables ─────────────
function opcionesPieza(vacio) {
  let h = `<option value="">${vacio}</option>`;
  for (const g of piezasPorEtiqueta()) {
    h += `<optgroup label="${esc(g.etiqueta)}">` + g.ids.map((id) => `<option value="${id}">${esc(PIEZAS[id].nombre)}</option>`).join('') + '</optgroup>';
  }
  return h;
}
$('#f-tipo').innerHTML = TIPOS.map((t) => `<option>${esc(t)}</option>`).join('');
$('#f-pieza').innerHTML = opcionesPieza('General o sin pieza concreta');
$('#fl-tipo').innerHTML = '<option value="">Todos los tipos</option>' + TIPOS.map((t) => `<option>${esc(t)}</option>`).join('');
$('#fl-pieza').innerHTML = opcionesPieza('Todas las piezas');

// ───────────── formulario ─────────────
const F = { fecha: $('#f-fecha'), km: $('#f-km'), tipo: $('#f-tipo'), pieza: $('#f-pieza'), titulo: $('#f-titulo'), coste: $('#f-coste'),
  taller: $('#f-taller'), notas: $('#f-notas'), pkm: $('#f-pkm'), pfecha: $('#f-pfecha') };
function limpiar() {
  editando = null; $('#form').reset(); F.fecha.value = hoy();
  $('#form-titulo').textContent = 'Nuevo registro'; $('#f-guardar').textContent = 'Guardar registro'; $('#f-cancelar').hidden = true;
}
function cargarEnForm(r) {
  editando = r.id;
  F.fecha.value = r.fecha || ''; F.km.value = r.km ?? ''; F.tipo.value = r.tipo; F.pieza.value = r.pieza || '';
  F.titulo.value = r.titulo || ''; F.coste.value = r.coste ?? ''; F.taller.value = r.taller || ''; F.notas.value = r.notas || '';
  F.pkm.value = r.proximoKm ?? ''; F.pfecha.value = r.proximaFecha || '';
  $('#form-titulo').textContent = 'Editar registro'; $('#f-guardar').textContent = 'Guardar cambios'; $('#f-cancelar').hidden = false;
  $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' }); F.titulo.focus();
}
const numOrNull = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = {
    id: editando || nuevoId(), fecha: F.fecha.value, km: numOrNull(F.km.value), tipo: F.tipo.value, pieza: F.pieza.value,
    titulo: F.titulo.value.trim(), coste: numOrNull(F.coste.value), taller: F.taller.value.trim(), notas: F.notas.value.trim(),
    proximoKm: numOrNull(F.pkm.value), proximaFecha: F.pfecha.value || null, creado: Date.now(),
  };
  if (!r.fecha || !r.titulo) return;
  if (editando) { const i = datos.findIndex((x) => x.id === editando); if (i >= 0) { r.creado = datos[i].creado || r.creado; datos[i] = r; } }
  else datos.push(r);
  if (!registros.guardar(datos)) toast('No se pudo guardar: el navegador bloquea el almacenamiento');
  else toast(editando ? 'Cambios guardados' : 'Registro guardado');
  limpiar(); pintar();
});
$('#f-cancelar').addEventListener('click', limpiar);

// ───────────── lista, resumen y avisos ─────────────
const orden = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0);
function filtrados() {
  const q = $('#q').value.trim().toLowerCase(), t = $('#fl-tipo').value, p = $('#fl-pieza').value;
  return datos.filter((r) => (!t || r.tipo === t) && (!p || r.pieza === p)
    && (!q || [r.titulo, r.notas, r.taller, r.tipo, r.pieza ? PIEZAS[r.pieza]?.nombre : ''].join(' ').toLowerCase().includes(q))).sort(orden);
}
function ultimoKm() { return datos.reduce((m, r) => (r.km != null && r.km > m ? r.km : m), 0); }
function pintarResumen() {
  const total = datos.reduce((s, r) => s + (r.coste || 0), 0), km = ultimoKm();
  const aceite = datos.filter((r) => r.tipo === ACEITE).sort(orden)[0];
  const cel = (b, s) => `<div class="dato"><b>${b}</b><span>${s}</span></div>`;
  $('#resumen').innerHTML = cel(datos.length, datos.length === 1 ? 'registro' : 'registros') + cel(eur.format(total), 'gastado en total')
    + cel(km ? num.format(km) + ' km' : '—', 'último kilometraje')
    + cel(aceite ? fmtFecha(aceite.fecha) : '—', aceite ? 'último aceite' + (aceite.km != null ? ' · ' + num.format(aceite.km) + ' km' : '') : 'último aceite sin registrar');
}
function pintarAvisos() {
  const km = ultimoKm(), hoyIso = hoy();
  const vigentes = datos.filter((r) => (r.proximoKm != null || r.proximaFecha)
    && !datos.some((o) => o.id !== r.id && o.tipo === r.tipo && (o.pieza || '') === (r.pieza || '') && orden(o, r) < 0));
  const filas = vigentes.map((r) => {
    const partes = []; let venc = false;
    if (r.proximaFecha) {
      const d = Math.round((new Date(r.proximaFecha + 'T12:00:00') - new Date(hoyIso + 'T12:00:00')) / 864e5);
      if (d < 0) { venc = true; partes.push(`vencido hace ${-d} ${-d === 1 ? 'día' : 'días'}`); } else partes.push(d === 0 ? 'es hoy' : `en ${d} ${d === 1 ? 'día' : 'días'}`);
      partes[partes.length - 1] += ` (${fmtFecha(r.proximaFecha)})`;
    }
    if (r.proximoKm != null) {
      if (km && km >= r.proximoKm) { venc = true; partes.push(`pasado de ${num.format(r.proximoKm)} km`); }
      else partes.push(km ? `faltan ${num.format(r.proximoKm - km)} km (${num.format(r.proximoKm)} km)` : `a los ${num.format(r.proximoKm)} km`);
    }
    return { venc, html: `<li><span class="${venc ? 'venc' : ''}">${esc(r.titulo)}</span><span>${esc(partes.join(' · '))}</span></li>` };
  }).sort((a, b) => b.venc - a.venc);
  $('#avisos').innerHTML = filas.map((f) => f.html).join('');
  $('#avisos-wrap').hidden = !filas.length;
}
function pintarLista() {
  const lista = filtrados(), ul = $('#lista');
  if (!datos.length) {
    ul.innerHTML = `<li class="vacio-lista"><strong>Aún no hay registros</strong>Empieza por lo último que le hiciste al coche: el cambio de aceite, las pastillas o la ITV. Rellena el formulario y guarda.</li>`;
    return;
  }
  if (!lista.length) { ul.innerHTML = '<li class="vacio-lista"><strong>Nada con esos filtros</strong>Prueba a quitar alguno.</li>'; return; }
  ul.innerHTML = lista.map((r) => {
    const ruta = r.pieza ? rutaPieza(r.pieza) : null;
    return `<li class="reg" data-id="${r.id}">
      <div class="fecha">${esc(fmtFecha(r.fecha))}<small>${r.km != null ? num.format(r.km) + ' km' : 'sin km'}</small></div>
      <div><h3>${esc(r.titulo)}</h3>
        <div class="chips"><span class="chip g">${esc(r.tipo)}</span>${r.pieza && PIEZAS[r.pieza] ? `<a class="chip" href="index.html${ruta ? '#' + ruta : ''}">${esc(PIEZAS[r.pieza].nombre)}</a>` : ''}${r.taller ? `<span class="chip g">${esc(r.taller)}</span>` : ''}</div>
        ${r.notas ? `<p>${esc(r.notas)}</p>` : ''}</div>
      <div class="coste">${r.coste != null ? esc(eur.format(r.coste)) : ''}</div>
      <div class="acc"><button class="mini" data-a="ed">Editar</button><button class="mini" data-a="del">Borrar</button></div>
    </li>`;
  }).join('');
}
function pintar() { pintarResumen(); pintarAvisos(); pintarLista(); }
$('#lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = b.closest('.reg').dataset.id, r = datos.find((x) => x.id === id); if (!r) return;
  if (b.dataset.a === 'ed') cargarEnForm(r);
  else if (confirm(`¿Borrar «${r.titulo}»? No se puede deshacer.`)) { datos = datos.filter((x) => x.id !== id); registros.guardar(datos); if (editando === id) limpiar(); pintar(); toast('Registro borrado'); }
});
['#q', '#fl-tipo', '#fl-pieza'].forEach((s) => $(s).addEventListener('input', pintarLista));

// ───────────── ficha del coche ─────────────
const campos = { modelo: '#fi-modelo', anio: '#fi-anio', motor: '#fi-motor', filtroAceite: '#fi-filtro', aceite: '#fi-aceite', notas: '#fi-notas' };
{
  const f = ficha.cargar();
  for (const [k, sel] of Object.entries(campos)) {
    const el = $(sel); el.value = f[k] || '';
    el.addEventListener('input', () => { const n = ficha.cargar(); n[k] = el.value; ficha.guardar(n); });
  }
}

// ───────────── copia de seguridad ─────────────
function descargar(nombre, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo })), a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#b-json').addEventListener('click', () => descargar(`registros-208-${hoy()}.json`, JSON.stringify({ version: 1, registros: datos, ficha: ficha.cargar() }, null, 2), 'application/json'));
$('#b-csv').addEventListener('click', () => {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const filas = [['Fecha', 'Km', 'Tipo', 'Pieza', 'Qué se hizo', 'Coste', 'Taller', 'Notas', 'Próximo km', 'Próxima fecha']]
    .concat([...datos].sort(orden).map((r) => [r.fecha, r.km ?? '', r.tipo, r.pieza ? PIEZAS[r.pieza]?.nombre : '', r.titulo, r.coste != null ? String(r.coste).replace('.', ',') : '', r.taller, r.notas, r.proximoKm ?? '', r.proximaFecha || '']));
  descargar(`registros-208-${hoy()}.csv`, '\ufeff' + filas.map((f) => f.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
});
$('#b-importar').addEventListener('click', () => $('#b-file').click());
$('#b-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const j = JSON.parse(await file.text()); const entrantes = Array.isArray(j) ? j : j.registros;
    if (!Array.isArray(entrantes)) throw new Error('formato');
    const ids = new Set(datos.map((r) => r.id)); let nuevos = 0;
    for (const r of entrantes) { if (r && r.titulo && r.fecha && !ids.has(r.id)) { datos.push({ ...r, id: r.id || nuevoId() }); nuevos++; } }
    registros.guardar(datos);
    if (j.ficha) { ficha.guardar({ ...ficha.cargar(), ...j.ficha }); for (const [k, sel] of Object.entries(campos)) $(sel).value = ficha.cargar()[k] || ''; }
    pintar(); toast(nuevos ? `Importados ${nuevos} registros` : 'No había registros nuevos');
  } catch { toast('El archivo no es una copia válida'); }
});

// ───────────── arranque ─────────────
montarAjustes();
limpiar();
const pre = new URLSearchParams(location.search).get('pieza');
if (pre && PIEZAS[pre]) { F.pieza.value = pre; $('#fl-pieza').value = pre; $('#sub').textContent = `Registros de «${PIEZAS[pre].nombre}». Lo que añadas aquí quedará asociado a esa pieza.`; }
pintar();
window.__ready = true;
