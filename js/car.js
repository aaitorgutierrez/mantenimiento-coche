// Modelo 3D estilizado de un Peugeot 208 de 5 puertas (2012-2019), construido por código.
// Ejes: +x = delante del coche, +y = arriba, +z = lado derecho (el conductor va en -z).
// Medidas reales: 3,96 m de largo, 1,74 m de ancho, 1,46 m de alto, 2,54 m entre ejes.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const L = 3.96, X_FRONT = L / 2, X_REAR = -L / 2;
const AXLE_F = 1.16, AXLE_R = -1.38;      // posición de los ejes
const WHEEL_R = 0.31, TRACK = 0.76;       // radio de rueda y z del centro de rueda
const ARCH_R = 0.40;                      // radio del paso de rueda

// ───────────── utilidades ─────────────
const sgnpow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Spline de Hermite sobre puntos [x, valor] ordenados por x. */
function spline(pts) {
  const n = pts.length;
  const m = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = (x - x0) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * Superficie por secciones: para cada estación x se genera un anillo.
 * ring(st, u) devuelve [z, y] con u en [0,1].
 * Devuelve { pos, nStations, nRing, closed, quadFilter } para construir geometrías.
 */
function loft(stations, nRing, ring, closed) {
  const per = closed ? nRing : nRing + 1;
  const pos = new Float32Array(stations.length * per * 3);
  stations.forEach((st, i) => {
    for (let j = 0; j < per; j++) {
      const u = closed ? j / nRing : j / nRing;
      const [z, y] = ring(st, u);
      const k = (i * per + j) * 3;
      pos[k] = st.x; pos[k + 1] = y; pos[k + 2] = z;
    }
  });
  return { pos, ns: stations.length, nRing, per, closed, stations };
}

/** Construye una geometría con los cuadriláteros que cumplan `keep(i, j, u)`. */
function loftGeometry(lf, keep, checkTop) {
  const idx = [];
  const segs = lf.closed ? lf.nRing : lf.nRing;
  for (let i = 0; i < lf.ns - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const u = (j + 0.5) / lf.nRing;
      if (keep && !keep(i, j, u, lf.stations[i])) continue;
      const j2 = lf.closed ? (j + 1) % lf.per : j + 1;
      const a = i * lf.per + j, b = i * lf.per + j2, c = (i + 1) * lf.per + j2, d = (i + 1) * lf.per + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(lf.pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Comprobar orientación: la normal de un punto de la parte alta debe mirar hacia arriba.
  if (checkTop) {
    const i = Math.floor(lf.ns / 2), j = Math.round(lf.nRing * 0.25);
    const n = g.getAttribute('normal');
    if (n.getY(i * lf.per + j) < 0) {
      for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
      g.setIndex(idx); g.computeVertexNormals();
    }
  }
  return g;
}

function cosSpaced(a, b, n) {
  const out = [];
  for (let k = 0; k <= n; k++) out.push(a + (b - a) * (1 - Math.cos(Math.PI * k / n)) / 2);
  return out;
}

// ───────────── materiales ─────────────
function makeMaterials(bodyColor) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    body: new THREE.MeshPhysicalMaterial({ color: bodyColor, metalness: 0.5, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x16202a, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
    trim: std({ color: 0x14171b, roughness: 0.65, metalness: 0.1 }),
    chrome: std({ color: 0xe4e8ee, roughness: 0.18, metalness: 1 }),
    tyre: std({ color: 0x121315, roughness: 0.92, metalness: 0 }),
    rim: std({ color: 0xcfd4db, roughness: 0.28, metalness: 0.95 }),
    rimDark: std({ color: 0x2b3036, roughness: 0.5, metalness: 0.6 }),
    disc: std({ color: 0x8b9098, roughness: 0.5, metalness: 0.85 }),
    caliper: std({ color: 0xb8322a, roughness: 0.45, metalness: 0.3 }),
    pad: std({ color: 0x4a3c30, roughness: 0.9, metalness: 0 }),
    rubber: std({ color: 0x0c0d0e, roughness: 0.85 }),
    lamp: new THREE.MeshPhysicalMaterial({ color: 0xe8eef5, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9, emissive: 0x000000 }),
    lampRed: new THREE.MeshPhysicalMaterial({ color: 0xa3141b, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92 }),
    liner: std({ color: 0x0d0f12, roughness: 1, side: THREE.DoubleSide }),
    metalDark: std({ color: 0x4d5560, roughness: 0.55, metalness: 0.7 }),
    metalMid: std({ color: 0x7b8591, roughness: 0.5, metalness: 0.7 }),
    plastic: std({ color: 0x23272d, roughness: 0.7 }),
    battery: std({ color: 0x1f3b73, roughness: 0.6 }),
    seat: std({ color: 0x3a3f47, roughness: 0.95 }),
    dash: std({ color: 0x1b1e23, roughness: 0.8 }),
    screen: std({ color: 0x0a0c10, roughness: 0.1, metalness: 0.4, emissive: 0x0b2a4d }),
    tank: std({ color: 0x3b4048, roughness: 0.7, metalness: 0.4 }),
    spring: std({ color: 0xb8322a, roughness: 0.5, metalness: 0.4 }),
    exhaust: std({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.9 }),
    ring: new THREE.MeshBasicMaterial({ color: 0x1d2a38, transparent: true, opacity: 0.1 }),
  };
}

// ───────────── coche ─────────────
export function buildCar(opts = {}) {
  const root = new THREE.Group();
  const mats = makeMaterials(opts.bodyColor ?? 0x9aa5b1);
  const partMeshes = {};          // id -> [Mesh]
  const shell = [];               // mallas de la carcasa exterior (se vuelven transparentes)
  const extras = [];              // piezas auxiliares del modelo propio (suelo, pasos de rueda)
  const wheelInfo = [];           // ruedas del modelo propio, para recolocarlas sobre el modelo real
  let realBody = null, regionBody = null;
  const HL = new THREE.Color(0x3d78ff);

  const prep = (mesh) => {
    mesh.material = mesh.material.clone();
    const m = mesh.material;
    mesh.userData.base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, emissive: m.emissive ? m.emissive.clone() : null, ei: m.emissiveIntensity ?? 1 };
    mesh.userData.hl = 0; mesh.userData.hlT = 0; mesh.userData.dim = 0; mesh.userData.dimT = 0;
  };
  const addShell = (obj) => { obj.traverse((o) => { if (o.isMesh) { const paint = o.material === mats.body; prep(o); o.userData.shell = true; o.userData.paint = paint; shell.push(o); } }); return obj; };
  const addPart = (id, obj) => {
    obj.traverse((o) => { if (o.isMesh) { prep(o); o.userData.partId = id; (partMeshes[id] ||= []).push(o); } });
    return obj;
  };
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  const box = (w, h, d, mat, x, y, z) => { const m = mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, axis = 'y', seg = 24) => {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z);
    if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2; return m;
  };

  // ── Carrocería inferior (capó, aletas, laterales, portón, paragolpes) ──
  const yt = spline([[-1.98, 0.8], [-1.9, 0.9], [-1.75, 0.95], [-1.5, 0.97], [-0.8, 0.97], [0, 0.97], [0.5, 0.98], [0.9, 0.93], [1.25, 0.85], [1.6, 0.79], [1.85, 0.71], [1.98, 0.62]]);
  const yb0 = spline([[-1.98, 0.34], [-1.86, 0.25], [-1.6, 0.18], [-1.4, 0.17], [1.5, 0.17], [1.8, 0.23], [1.98, 0.32]]);
  const hwf = spline([[-1.98, 0.74], [-1.82, 0.83], [-1.4, 0.86], [0, 0.87], [1.2, 0.87], [1.7, 0.84], [1.98, 0.74]]);
  const yb = (x) => {
    let v = yb0(x);
    for (const xc of [AXLE_F, AXLE_R]) {
      const dx = Math.abs(x - xc);
      if (dx < ARCH_R) v = Math.max(v, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - dx * dx));
    }
    return v;
  };
  const capF = 0.24, capR = 0.2, BODY_N = 8;
  const endScale = (x) => {
    const cap = (u) => Math.max(0.03, Math.pow(Math.max(0, 1 - Math.pow(u, 3)), 1 / 3));
    if (x > X_FRONT - capF) return cap((x - (X_FRONT - capF)) / capF);
    if (x < X_REAR + capR) return cap(((X_REAR + capR) - x) / capR);
    return 1;
  };
  /** z de la superficie lateral del coche a la altura y (para pegar molduras). */
  const surfZ = (x, y) => {
    const sc = endScale(x), b = yb(x), t = Math.max(yt(x), b + 0.08), yc = (b + t) / 2, hh = ((t - b) / 2) * sc;
    const v = Math.max(-0.999, Math.min(0.999, (y - yc) / hh));
    return hwf(x) * sc * Math.pow(Math.sqrt(1 - v * v), 2 / BODY_N);
  };
  /** x del frontal/trasero a la altura y y a la distancia lateral z (para pegar faros y pilotos). */
  const noseX = (y, z) => { for (let x = X_FRONT; x > 0; x -= 0.004) if (surfZ(x, y) >= z) return x; return X_FRONT - 0.2; };
  const tailX = (y, z) => { for (let x = X_REAR; x < 0; x += 0.004) if (surfZ(x, y) >= z) return x; return X_REAR + 0.2; };
  const lowerStations = cosSpaced(X_REAR, X_FRONT, 300).map((x) => {
    const s = endScale(x), b = yb(x), t = Math.max(yt(x), b + 0.08);
    const yc = (b + t) / 2, hh = (t - b) / 2;
    return { x, hw: hwf(x) * s, yc, hh: hh * s };
  });
  const lowerLoft = loft(lowerStations, 72, (st, u) => {
    const th = u * TAU, n = BODY_N;
    return [st.hw * sgnpow(Math.cos(th), 2 / n), st.yc + st.hh * sgnpow(Math.sin(th), 2 / n)];
  }, true);
  const body = mesh(loftGeometry(lowerLoft, null, true), mats.body);
  body.material.side = THREE.DoubleSide;
  addShell(body);
  root.add(body);

  // ── Habitáculo: techo y cristales ──
  const cYt = spline([[-1.8, 0.985], [-1.74, 1.1], [-1.52, 1.3], [-1.2, 1.42], [-0.8, 1.462], [-0.3, 1.46], [0.05, 1.4], [0.22, 1.28], [0.38, 1.1], [0.55, 0.985]]);
  const cHw = spline([[-1.8, 0.62], [-1.4, 0.68], [-0.8, 0.72], [0, 0.73], [0.55, 0.73]]);
  const cabinStations = cosSpaced(-1.8, 0.55, 130).map((x) => ({ x, hw: cHw(x), yc: 0.965, hh: Math.max(0.012, cYt(x) - 0.965) }));
  const cabinLoft = loft(cabinStations, 40, (st, u) => {
    const th = u * Math.PI, n = 2.7;
    return [st.hw * sgnpow(Math.cos(th), 2 / n), st.yc + st.hh * sgnpow(Math.sin(th), 2 / n)];
  }, false);
  const roofKeep = (i, j, u, st) => u > 0.29 && u < 0.71 && st.x > -1.45 && st.x < 0.0;
  const roofGeo = loftGeometry(cabinLoft, roofKeep, true);
  const glassGeo = loftGeometry(cabinLoft, (i, j, u, st) => !roofKeep(i, j, u, st), true);
  const roof = mesh(roofGeo, mats.body); roof.material.side = THREE.DoubleSide;
  const glass = mesh(glassGeo, mats.glass);
  addShell(roof); addShell(glass); root.add(roof, glass);

  // Pilares y carriles de techo (tubos pegados a la superficie del habitáculo)
  const cabinPoint = (x, u, grow = 0.012) => {
    const st = { hw: cHw(x) + grow, yc: 0.965, hh: Math.max(0.012, cYt(x) - 0.965) + grow };
    const th = u * Math.PI, n = 2.7;
    return new THREE.Vector3(x, st.yc + st.hh * sgnpow(Math.sin(th), 2 / n), st.hw * sgnpow(Math.cos(th), 2 / n));
  };
  for (const s of [-1, 1]) {
    const at = (x, u) => { const v = cabinPoint(x, u); v.z *= s; return v; };
    // carril de techo (arranca en el pilar A y acaba en el C)
    const rail = []; for (let k = 0; k <= 30; k++) rail.push(at(0.5 - (0.5 + 1.75) * k / 30, 0.29));
    root.add(addShell(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 60, 0.022, 8), mats.body)));
    // pilar B y pilar entre puertas traseras
    for (const xp of [-0.33, -1.2]) {
      const pts = []; for (let k = 0; k <= 12; k++) pts.push(at(xp, 0.29 * k / 12));
      const tube = addShell(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.02, 8), mats.body)); root.add(tube);
    }
    // línea de cintura (moldura cromada)
    const belt = []; for (let k = 0; k <= 40; k++) { const x = 0.5 - 2.25 * k / 40; const v = cabinPoint(x, 0, 0.02); v.z *= s; v.y = 0.975; belt.push(v); }
    root.add(addShell(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(belt), 80, 0.008, 6), mats.chrome)));
    // líneas de puerta, manetas y faldones pegados a la superficie
    for (const xd of [0.46, -0.34, -1.2]) {
      const y0 = Math.max(0.3, yb(xd) + 0.03), y1 = 0.93, pts = [];
      for (let k = 0; k <= 8; k++) { const y = y0 + (y1 - y0) * k / 8; pts.push(new THREE.Vector3(xd, y, s * (surfZ(xd, y) + 0.003))); }
      root.add(addShell(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.003, 4), mats.trim)));
    }
    for (const xh of [0.0, -0.78]) root.add(addShell(box(0.1, 0.02, 0.014, mats.trim, xh, 0.84, s * (surfZ(xh, 0.84) + 0.004))));
    root.add(addShell(box(2.0, 0.07, 0.02, mats.trim, -0.05, 0.22, s * (surfZ(-0.05, 0.22) + 0.004))));
    // retrovisor
    const mir = box(0.1, 0.07, 0.13, mats.body, 0.4, 1.0, s * 0.93); mir.rotation.y = s * 0.15;
    root.add(addShell(mir));
    root.add(addShell(box(0.05, 0.03, 0.08, mats.trim, 0.43, 0.97, s * 0.84)));
  }

  // Parrilla y entrada de aire (parte del frontal)
  const grille = box(0.05, 0.11, 0.66, mats.trim, noseX(0.47, 0.33) - 0.012, 0.47, 0); root.add(addShell(grille));
  const lower = box(0.05, 0.07, 0.9, mats.trim, noseX(0.33, 0.45) - 0.012, 0.33, 0); root.add(addShell(lower));
  const plate = box(0.012, 0.11, 0.34, mats.chrome, noseX(0.58, 0.17) - 0.004, 0.58, 0); // zona de la matrícula (sin texto)
  root.add(addShell(plate));

  // ── Pasos de rueda: guardabarros interior y suelo ──
  const underFloor = box(3.3, 0.04, 1.0, mats.liner, -0.1, 0.24, 0); root.add(underFloor); extras.push(underFloor);
  for (const xc of [AXLE_F, AXLE_R]) for (const s of [-1, 1]) {
    const arch = mesh(new THREE.CylinderGeometry(ARCH_R - 0.01, ARCH_R - 0.01, 0.4, 36, 1, true, Math.PI / 2 - 0.25, Math.PI + 0.5), mats.liner);
    arch.rotation.x = Math.PI / 2; arch.position.set(xc, WHEEL_R, s * 0.66);
    root.add(arch); extras.push(arch);
    const wall = mesh(new THREE.CircleGeometry(ARCH_R - 0.01, 36), mats.liner); wall.position.set(xc, WHEEL_R, s * 0.46); root.add(wall); extras.push(wall);
  }

  // ── Ruedas ──
  const tyreGeo = (() => {
    const p = [[0.19, -0.085], [0.2, -0.097], [0.255, -0.1], [0.295, -0.082], [0.311, -0.04], [0.313, 0.04], [0.295, 0.082], [0.255, 0.1], [0.2, 0.097], [0.19, 0.085]];
    return new THREE.LatheGeometry(p.map(([r, a]) => new THREE.Vector2(r, a)), 48);
  })();
  const sectorShape = (r0, r1, a0, a1) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true); sh.closePath(); return sh;
  };
  const wheelGroups = [];
  function makeWheel(front, side) {
    const sfx = front ? 'del' : 'tras';
    const g = new THREE.Group();
    const inner = new THREE.Group(); g.add(inner);     // eje local: +z hacia fuera
    const tyre = mesh(tyreGeo, mats.tyre); tyre.rotation.x = Math.PI / 2; inner.add(addPart('neumatico-' + sfx, tyre));
    // llanta: barril, radios y tapacubos
    const rimGroup = new THREE.Group();
    const barrel = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.17, 40, 1, true), mats.rimDark); barrel.rotation.x = Math.PI / 2; barrel.material.side = THREE.DoubleSide;
    const lip = mesh(new THREE.TorusGeometry(0.2, 0.011, 8, 48), mats.rim); lip.position.z = 0.082;
    rimGroup.add(barrel, lip);
    const N = 5;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU + Math.PI / 10;
      for (const d of [-0.05, 0.05]) {
        const sp = box(0.145, 0.03, 0.022, mats.rim, 0, 0, 0);
        sp.geometry.translate(0.115, 0, 0);
        sp.rotation.z = a + d; sp.position.z = 0.058; rimGroup.add(sp);
      }
    }
    const cap = cyl(0.04, 0.04, 0.02, mats.rim, 0, 0, 0.065, 'z'); rimGroup.add(cap);
    inner.add(addPart('llanta-' + sfx, rimGroup));
    // tornillos de rueda
    const bolts = new THREE.Group();
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; bolts.add(cyl(0.011, 0.011, 0.03, mats.chrome, Math.cos(a) * 0.056, Math.sin(a) * 0.056, 0.078, 'z', 10)); }
    inner.add(addPart('tornillos-' + sfx, bolts));
    // buje
    inner.add(cyl(0.05, 0.05, 0.05, mats.metalDark, 0, 0, -0.02, 'z'));
    if (front) {
      const disc = new THREE.Group();
      disc.add(cyl(0.133, 0.133, 0.022, mats.disc, 0, 0, -0.035, 'z', 48));
      disc.add(cyl(0.075, 0.075, 0.05, mats.disc, 0, 0, -0.02, 'z', 32));
      inner.add(addPart('disco-del', disc));
      const aC = Math.PI * 0.8, half = 0.5;
      const calGeo = new THREE.ExtrudeGeometry(sectorShape(0.088, 0.166, aC - half, aC + half), { depth: 0.085, bevelEnabled: false });
      const cal = mesh(calGeo, mats.caliper); cal.position.z = -0.035 - 0.0425;
      inner.add(addPart('pinza-del', cal));
      const pads = new THREE.Group();
      for (const dz of [-0.025, 0.025]) {
        const pg = new THREE.ExtrudeGeometry(sectorShape(0.095, 0.155, aC - half - 0.1, aC + half + 0.1), { depth: 0.012, bevelEnabled: false });
        const pm = mesh(pg, mats.pad); pm.position.z = -0.035 + dz - 0.006; pads.add(pm);
      }
      inner.add(addPart('pastillas-del', pads));
      const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 0.1, -0.06), new THREE.Vector3(-0.11, 0.28, -0.1), new THREE.Vector3(-0.07, 0.42, -0.15), new THREE.Vector3(-0.02, 0.5, -0.2)]);
      inner.add(addPart('flexible', mesh(new THREE.TubeGeometry(hose, 14, 0.008, 6), mats.rubber)));
      const valve = cyl(0.008, 0.008, 0.034, mats.chrome, -0.03, 0.2, 0.07, 'z', 8);
      inner.add(addPart('valvula-del', valve));
    } else {
      const drum = new THREE.Group();
      drum.add(cyl(0.103, 0.103, 0.06, mats.disc, 0, 0, -0.04, 'z', 40));
      drum.add(cyl(0.108, 0.108, 0.012, mats.metalDark, 0, 0, -0.075, 'z', 40));
      inner.add(addPart('freno-tras', drum));
    }
    const sgn = side;                       // -1 izquierda (conductor), +1 derecha
    g.scale.z = sgn;                        // espejo para que +z local apunte hacia fuera
    g.position.set(front ? AXLE_F : AXLE_R, WHEEL_R, sgn * TRACK);
    root.add(g); wheelGroups.push(g); wheelInfo.push({ g, front, side });
    return g;
  }
  for (const s of [-1, 1]) { makeWheel(true, s); makeWheel(false, s); }

  // ── Suspensión (muelle y amortiguador) ──
  function strut(id, x, y0, y1, z) {
    const g = new THREE.Group();
    g.add(cyl(0.022, 0.022, y1 - y0, mats.metalMid, x, (y0 + y1) / 2, z));
    const pts = []; const turns = 6, h = (y1 - y0) * 0.8;
    for (let k = 0; k <= turns * 16; k++) { const a = (k / 16) * TAU; pts.push(new THREE.Vector3(x + Math.cos(a) * 0.055, y0 + 0.05 + h * k / (turns * 16), z + Math.sin(a) * 0.055)); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.008, 6), mats.spring));
    return addPart(id, g);
  }
  for (const s of [-1, 1]) { root.add(strut('amortiguador-del', AXLE_F, 0.3, 0.78, s * 0.56)); root.add(strut('amortiguador-tras', AXLE_R, 0.3, 0.74, s * 0.56)); }

  // ── Motor y compartimento motor ──
  const eng = new THREE.Group();
  eng.add(box(0.36, 0.3, 0.58, mats.metalMid, 1.2, 0.4, 0));            // bloque
  eng.add(box(0.34, 0.15, 0.56, mats.metalDark, 1.2, 0.58, 0));          // culata
  eng.add(box(0.3, 0.06, 0.5, mats.plastic, 1.2, 0.69, 0));              // tapa de balancines
  eng.add(cyl(0.045, 0.045, 0.5, mats.plastic, 1.44, 0.64, 0, 'z'));     // colector de admisión
  eng.add(box(0.1, 0.34, 0.05, mats.metalDark, 1.2, 0.46, 0.31));        // tapa de distribución
  eng.add(cyl(0.04, 0.04, 0.1, mats.metalDark, 1.42, 0.3, 0.12));      // filtro de aceite
  eng.add(cyl(0.07, 0.07, 0.05, mats.metalDark, 1.2, 0.46, 0.345, 'z')); // polea
  root.add(addPart('motor', eng));
  const gear = new THREE.Group();
  gear.add(box(0.34, 0.33, 0.36, mats.metalMid, 1.2, 0.4, 0.5));
  gear.add(cyl(0.16, 0.16, 0.12, mats.metalDark, 1.2, 0.4, 0.68, 'z'));
  root.add(addPart('caja', gear));
  const rad = new THREE.Group();
  rad.add(box(0.07, 0.4, 0.72, mats.metalDark, 1.82, 0.44, 0));
  rad.add(cyl(0.18, 0.18, 0.04, mats.plastic, 1.75, 0.44, 0, 'x'));
  root.add(addPart('refrigeracion', rad));
  const bat = new THREE.Group();
  bat.add(box(0.2, 0.19, 0.28, mats.battery, 1.5, 0.64, -0.52));
  bat.add(box(0.14, 0.08, 0.2, mats.plastic, 1.5, 0.74, -0.24));
  root.add(addPart('bateria', bat));
  const rackG = new THREE.Group();
  rackG.add(cyl(0.025, 0.025, 0.78, mats.metalMid, 1.36, 0.3, 0, 'z'));
  rackG.add(cyl(0.032, 0.032, 0.14, mats.rubber, 1.36, 0.3, -0.3, 'z'));
  rackG.add(cyl(0.032, 0.032, 0.14, mats.rubber, 1.36, 0.3, 0.3, 'z'));
  root.add(addPart('cremallera', rackG));
  const beltRing = mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 28), mats.rubber); beltRing.position.set(1.2, 0.46, 0.375);
  root.add(addPart('correa', beltRing));
  const servo = new THREE.Group();
  servo.add(cyl(0.1, 0.1, 0.09, mats.plastic, 0.84, 0.8, -0.36, 'x'));
  servo.add(cyl(0.035, 0.035, 0.14, mats.metalMid, 0.75, 0.8, -0.36, 'x'));
  servo.add(box(0.12, 0.07, 0.07, mats.metalDark, 0.92, 0.82, -0.36));
  root.add(addPart('servo', servo));
  // Escape y depósito
  const exPath = new THREE.CatmullRomCurve3([new THREE.Vector3(1.05, 0.46, 0.22), new THREE.Vector3(0.6, 0.28, 0.3), new THREE.Vector3(-0.6, 0.26, 0.32), new THREE.Vector3(-1.5, 0.28, 0.32), new THREE.Vector3(-1.9, 0.3, 0.32)]);
  const ex = new THREE.Group();
  ex.add(mesh(new THREE.TubeGeometry(exPath, 60, 0.03, 10), mats.exhaust));
  ex.add(cyl(0.09, 0.09, 0.55, mats.exhaust, -1.45, 0.27, 0.32, 'x'));
  root.add(addPart('escape', ex));
  root.add(addPart('combustible', box(0.85, 0.2, 0.72, mats.tank, -0.55, 0.31, 0)));
  const handbrake = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.2, 0.22, 0), new THREE.Vector3(-0.8, 0.22, -0.2), new THREE.Vector3(-1.38, 0.3, -0.5)]);
  root.add(addPart('freno-mano', mesh(new THREE.TubeGeometry(handbrake, 20, 0.008, 6), mats.metalMid)));

  // ── Interior ──
  const dash = new THREE.Group();
  dash.add(box(0.3, 0.1, 1.38, mats.dash, 0.36, 0.98, 0));
  root.add(addPart('salpicadero', dash));
  root.add(addPart('instrumentos', box(0.04, 0.08, 0.24, mats.screen, 0.3, 1.03, -0.38)));
  root.add(addPart('confort', box(0.04, 0.1, 0.2, mats.screen, 0.38, 1.03, 0.02)));
  const sw = mesh(new THREE.TorusGeometry(0.17, 0.015, 10, 36), mats.dash);
  sw.position.set(0.12, 1.06, -0.38); sw.rotation.set(0, Math.PI / 2, 0); sw.rotateZ(0.0); sw.rotation.z = -0.38;
  const col = cyl(0.025, 0.025, 0.3, mats.dash, 0.24, 1.0, -0.38, 'x');
  const swG = new THREE.Group(); swG.add(sw, col);
  root.add(addPart('volante', swG));
  const seatsF = new THREE.Group();
  for (const s of [-1, 1]) {
    seatsF.add(box(0.5, 0.1, 0.46, mats.seat, -0.08, 0.55, s * 0.36));
    const back = box(0.1, 0.56, 0.46, mats.seat, -0.36, 0.86, s * 0.36); back.rotation.z = 0.22; seatsF.add(back);
    seatsF.add(box(0.07, 0.18, 0.24, mats.seat, -0.43, 1.2, s * 0.36));
  }
  root.add(addPart('asiento-del', seatsF));
  const seatR = new THREE.Group();
  seatR.add(box(0.46, 0.1, 1.2, mats.seat, -0.95, 0.52, 0));
  const rb = box(0.1, 0.5, 1.2, mats.seat, -1.2, 0.82, 0); rb.rotation.z = 0.2; seatR.add(rb);
  root.add(addPart('asiento-tras', seatR));
  root.add(addPart('reensamblaje', box(0.05, 0.05, 0.05, mats.trim, -0.6, 1.0, 0.55)));
  root.add(addPart('arneses', (() => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(1.45, 0.88, 0.2), new THREE.Vector3(0.9, 0.9, 0.42), new THREE.Vector3(0.45, 0.93, 0.46), new THREE.Vector3(-0.4, 0.4, 0.5), new THREE.Vector3(-1.5, 0.45, 0.5)]);
    return mesh(new THREE.TubeGeometry(c, 40, 0.012, 6), mats.rubber);
  })()));
  root.add(addPart('puntos', box(0.06, 0.04, 0.06, mats.chrome, 0.0, 0.25, -0.5)));
  root.add(addPart('elec-motor', (() => { const g = new THREE.Group(); g.add(cyl(0.06, 0.06, 0.12, mats.metalDark, 1.0, 0.45, -0.22, 'z')); g.add(cyl(0.05, 0.05, 0.1, mats.metalMid, 1.34, 0.45, -0.3, 'z')); return g; })()));
  root.add(addPart('lavado', box(0.14, 0.12, 0.18, mats.plastic, 1.55, 0.68, 0.5)));
  root.add(addPart('protecciones', box(0.07, 0.04, 0.01, mats.chrome, 0.12, 0.8, -0.874)));

  // ── Luces ──
  for (const s of [-1, 1]) {
    // Faros: placa fina pegada al frontal, orientada según la curvatura del morro
    const yH = 0.64, zH = 0.5;
    const xH = noseX(yH, zH), ang = Math.atan2(noseX(yH, zH + 0.06) - noseX(yH, zH - 0.06), 0.12);
    const hl = box(0.05, 0.085, 0.3, mats.lamp, xH - 0.012, yH, s * zH); hl.rotation.y = s * ang;
    root.add(addPart('faros', hl));
    const yT = 0.83, zT = 0.58;
    const xT = tailX(yT, zT), angT = Math.atan2(tailX(yT, zT + 0.06) - tailX(yT, zT - 0.06), 0.12);
    const tl = box(0.05, 0.14, 0.24, mats.lampRed, xT + 0.012, yT, s * zT); tl.rotation.y = s * angT;
    root.add(addPart('pilotos', tl));
  }

  // ── Sombra suave y plataforma ──
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, 'rgba(10,20,34,0.5)'); gr.addColorStop(0.55, 'rgba(10,20,34,0.22)'); gr.addColorStop(1, 'rgba(10,20,34,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 256, 256);
  const shTex = new THREE.CanvasTexture(cv);
  const sh = mesh(new THREE.PlaneGeometry(5.6, 3.0), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.003; root.add(sh);
  const ringMesh = mesh(new THREE.RingGeometry(3.35, 3.38, 120), mats.ring); ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.002; root.add(ringMesh);

  // ── Región resaltada (para piezas sin volumen propio) ──
  const regionMat = new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.34, depthWrite: false });
  const regionMesh = mesh(new THREE.BoxGeometry(1, 1, 1), regionMat); regionMesh.visible = false; regionMesh.renderOrder = 5; root.add(regionMesh);
  const regionEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x2f6bff }));
  regionMesh.add(regionEdges);

  // Piezas del interior del coche: solo se ven al volver transparente la carrocería.
  ['motor', 'caja', 'refrigeracion', 'bateria', 'cremallera', 'correa', 'servo', 'elec-motor', 'lavado', 'escape', 'combustible', 'freno-mano', 'arneses', 'puntos', 'protecciones']
    .forEach((id) => (partMeshes[id] || []).forEach((m) => { m.userData.internal = true; }));

  // ───────────── API ─────────────
  let xray = 0, xrayT = 0;
  const hlSet = new Set(); let dimOthers = false;

  const api = {
    group: root, partMeshes, mats,
    partIds: () => Object.keys(partMeshes),
    shellMeshes: () => shell,
    setBodyColor(c) { for (const m of shell) if (m.userData.paint) m.material.color.set(c); },
    hasRealModel: () => !!realBody,
    setXray(a) { xrayT = a; },
    setHighlight(ids, dim) {
      hlSet.clear(); ids.forEach((i) => hlSet.add(i)); dimOthers = !!dim && ids.length > 0;
      for (const [id, arr] of Object.entries(partMeshes)) for (const m of arr) {
        m.userData.hlT = hlSet.has(id) ? 1 : 0; m.userData.dimT = dimOthers && !hlSet.has(id) ? 1 : 0;
      }
    },
    setRegion(r) {
      if (!r) { regionMesh.visible = false; if (regionBody) regionBody.visible = false; return; }
      if (regionBody) {                                   // modelo real: se tiñe solo la parte de la carrocería que cae dentro de la caja
        const [cx, cy, cz] = r.c, [sx, sy, sz] = r.s, P = (nx, ny, nz, d) => new THREE.Plane(new THREE.Vector3(nx, ny, nz), d);
        regionBody.material.clippingPlanes = [P(1, 0, 0, -(cx - sx / 2)), P(-1, 0, 0, cx + sx / 2), P(0, 1, 0, -(cy - sy / 2)), P(0, -1, 0, cy + sy / 2), P(0, 0, 1, -(cz - sz / 2)), P(0, 0, -1, cz + sz / 2)];
        regionBody.visible = true; regionMesh.visible = false; return;
      }
      regionMesh.position.set(...r.c); regionMesh.scale.set(...r.s); regionMesh.visible = true;
    },
    pickables() { return Object.values(partMeshes).flat(); },
    /** Pieza a la que corresponde un impacto del rayo (las mallas compartidas se reparten por posición). */
    partIdAt(hit) {
      const u = hit.object.userData; if (!u.partIds) return u.partId;
      const [a, b] = u.partIds; return hit.point.x > (u.splitX ?? 0) ? a : b;
    },
    /**
     * Sustituye la carrocería y el interior del modelo propio por el modelo 3D real (glTF).
     * Ejes del glTF: +Z delante, +Y arriba, +X izquierda. Se escala a 3,96 m de largo y se apoya en el suelo.
     */
    useModel(gltfScene, maxAniso = 4) {
      if (realBody) return;
      const model = gltfScene;
      const box0 = new THREE.Box3().setFromObject(model), c0 = box0.getCenter(new THREE.Vector3());
      const k = L / (box0.max.z - box0.min.z);
      model.position.set(-c0.x, -box0.min.y, -c0.z);
      const wrap = new THREE.Group(); wrap.add(model); wrap.scale.setScalar(k); wrap.rotation.y = Math.PI / 2;
      root.add(wrap); wrap.updateMatrixWorld(true); realBody = wrap;

      // 1) Ocultar la carrocería, el interior y las ruedas del modelo propio
      shell.forEach((m) => { m.visible = false; }); shell.length = 0;
      extras.forEach((o) => { o.visible = false; });
      const OCULTAR = ['neumatico-del', 'neumatico-tras', 'llanta-del', 'llanta-tras', 'tornillos-del', 'tornillos-tras', 'amortiguador-del',
        'amortiguador-tras', 'asiento-del', 'asiento-tras', 'salpicadero', 'instrumentos', 'confort', 'volante', 'faros', 'pilotos', 'reensamblaje'];
      for (const id of OCULTAR) { (partMeshes[id] || []).forEach((m) => { m.visible = false; }); delete partMeshes[id]; }

      // 2) Clasificar las mallas del modelo real
      const SHELL = ['Object_7', 'Object_13', 'Object_14', 'Object_18', 'Object_19', 'Object_20', 'Object_21', 'Object_23', 'Object_25', 'Object_29'];
      const PART = {
        Object_2: ['salpicadero'], Object_3: ['salpicadero'], Object_17: ['salpicadero'], Object_10: ['confort'],
        Object_11: ['volante'], Object_12: ['volante'], Object_4: ['faros'], Object_6: ['faros'], Object_5: ['pilotos'], Object_15: ['pilotos'],
        Object_8: ['reensamblaje'], Object_9: ['reensamblaje'],
        Object_22: ['neumatico-del', 'neumatico-tras'], Object_24: ['llanta-del', 'llanta-tras', 'tornillos-del', 'tornillos-tras'],
        Object_26: ['asiento-del', 'asiento-tras'], Object_27: ['amortiguador-del', 'amortiguador-tras'], Object_28: ['amortiguador-del', 'amortiguador-tras'],
      };
      let tyre = null, baseMesh = null;
      model.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        if (m.transmission) m.transmission = 0;                                  // la transmisión es muy pesada; se sustituye por transparencia
        if (m.transparent || m.alphaMode === 'BLEND') { m.transparent = true; m.depthWrite = false; }
        [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap].forEach((t) => { if (t) t.anisotropy = maxAniso; });
        m.side = THREE.DoubleSide;
        if (SHELL.includes(o.name)) { const paint = o.name === 'Object_25'; prep(o); o.userData.shell = true; o.userData.paint = paint; shell.push(o); }
        else if (PART[o.name]) {
          prep(o); const ids = PART[o.name]; o.userData.partId = ids[0];
          if (ids.length > 1) { o.userData.partIds = [ids[0], ids[1]]; o.userData.splitX = ids[0].startsWith('asiento') ? -0.55 : 0; }
          ids.forEach((id) => (partMeshes[id] ||= []).push(o));
        }
        if (o.name === 'Object_22') tyre = o;
        if (o.name === 'Object_25') baseMesh = o;
      });

      if (baseMesh) {
        regionBody = new THREE.Mesh(baseMesh.geometry, new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        regionBody.position.copy(baseMesh.position); regionBody.quaternion.copy(baseMesh.quaternion); regionBody.scale.copy(baseMesh.scale);
        regionBody.renderOrder = 6; regionBody.visible = false; baseMesh.parent.add(regionBody);
      }

      // 3) Recolocar los frenos del modelo propio sobre las ruedas reales
      if (tyre) {
        const tb = new THREE.Box3().setFromObject(tyre), R = (tb.max.y - tb.min.y) / 2;
        const axleF = tb.max.x - R, axleR = tb.min.x + R, track = tb.max.z - 0.0975;
        const kk = R / WHEEL_R;
        for (const w of wheelInfo) {
          w.g.position.set(w.front ? axleF : axleR, R, w.side * track);
          w.g.scale.set(kk, kk, kk * w.side);
          w.g.traverse((o) => { if (o.isMesh && (o.userData.partId || '').match(/^(neumatico|llanta|tornillos)-/)) o.visible = false; });
        }
        api.wheelFit = { axleF, axleR, track, R };
      }
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 7);
      xray += (xrayT - xray) * k;
      for (const m of shell) {
        const b = m.userData.base, mat = m.material;
        const o = b.opacity * (1 - 0.9 * xray);
        mat.opacity = o; mat.transparent = b.transparent || xray > 0.02; mat.depthWrite = b.depthWrite && xray < 0.5;
      }
      for (const arr of Object.values(partMeshes)) for (const m of arr) {
        const u = m.userData, mat = m.material;
        if (u.internal) m.visible = xray > 0.12;
        u.hl += (u.hlT - u.hl) * k; u.dim += (u.dimT - u.dim) * k;
        if (mat.emissive) { mat.emissive.copy(u.base.emissive).lerp(HL, u.hl); mat.emissiveIntensity = u.hl > 0.01 ? u.base.ei + 0.42 * u.hl : u.base.ei; }
        const op = u.base.opacity * (1 - 0.86 * u.dim);
        mat.opacity = op; mat.transparent = u.base.transparent || u.dim > 0.02; mat.depthWrite = u.dim < 0.3 ? u.base.depthWrite : false;
      }
    },
  };
  return api;
}
