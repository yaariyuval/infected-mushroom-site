// Small deterministic helpers shared by the hero scene and its mushrooms.
import * as THREE from 'three';

export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, z = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = (t: number) => t * t * (3 - 2 * t);
export const lerp = THREE.MathUtils.lerp;
export const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// value noise; the scene samples it a few hundred thousand times while building, so it's written out flat
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const x1 = xi + 1, y1 = yi + 1, z1 = zi + 1;
  const a0 = hash(xi, yi, zi), a1 = hash(x1, yi, zi), a2 = hash(xi, y1, zi), a3 = hash(x1, y1, zi);
  const b0 = hash(xi, yi, z1), b1 = hash(x1, yi, z1), b2 = hash(xi, y1, z1), b3 = hash(x1, y1, z1);
  const p = a0 + (a1 - a0) * u, q = a2 + (a3 - a2) * u, r = b0 + (b1 - b0) * u, t = b2 + (b3 - b2) * u;
  const m = p + (q - p) * v, n = r + (t - r) * v;
  return m + (n - m) * w;
}

// Smooth vertex normals straight from the typed arrays (BufferGeometry.computeVertexNormals goes through a
// Vector3 per corner, which adds up over a whole grove). Indexed geometry only; anything else falls back.
export function computeNormals(g: THREE.BufferGeometry) {
  const index = g.index;
  if (!index) { g.computeVertexNormals(); return; }
  const pos = g.attributes.position.array as ArrayLike<number>;
  const idx = index.array;
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[c] - pos[b], uy = pos[c + 1] - pos[b + 1], uz = pos[c + 2] - pos[b + 2];
    const vx = pos[a] - pos[b], vy = pos[a + 1] - pos[b + 1], vz = pos[a + 2] - pos[b + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nor[a] += nx; nor[a + 1] += ny; nor[a + 2] += nz;
    nor[b] += nx; nor[b + 1] += ny; nor[b + 2] += nz;
    nor[c] += nx; nor[c + 1] += ny; nor[c + 2] += nz;
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
}
export function fbm2(x: number, z: number, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, z, i * 7.1); x = x * 2.03 + 17.1; z = z * 2.03 + 3.3; a *= 0.5; }
  return s;
}
