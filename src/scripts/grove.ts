// Night grove hero scene: giant bioluminescent mushrooms under a violet sky.
// Loaded lazily after first paint by MushroomScene.astro.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BPM = 145;
const CYAN = new THREE.Color(0.05, 0.7, 1.0);
const MAGENTA = new THREE.Color(1.0, 0.08, 0.6);
const AMBER = new THREE.Color(1.0, 0.45, 0.08);

/* ------------------------------------------------------------------ noise */

function rng(seed: number) {
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
const lerp = THREE.MathUtils.lerp;
const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const c = (a: number, b: number, d: number) => hash(xi + a, yi + b, zi + d);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
function fbm2(x: number, z: number, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, z, i * 7.1); x = x * 2.03 + 17.1; z = z * 2.03 + 3.3; a *= 0.5; }
  return s;
}
function groundH(x: number, z: number) {
  const base = 0.5 * fbm2(x * 0.3, z * 0.3) - 0.22;
  // keep the clearing under the giant fairly level
  const clearing = smooth(1.5, 5, Math.hypot(x, z - 0.6));
  return lerp(-0.05, base, 0.35 + 0.65 * clearing);
}

/* ------------------------------------------------------------ sky shader */

const SKY_GLSL = /* glsl */ `
uniform float uT;
varying vec3 vWorld;
const vec3 MAGENTA = vec3(1., .22, .78);
const vec3 MOON = vec3(0.0500, 0.2920, -0.9551);
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }

void main() {
  vec3 rd = normalize(vWorld - cameraPosition);
  float T = uT;
  float y = max(rd.y, 0.);
  vec3 c = mix(vec3(.055, .014, .15), vec3(.0015, .001, .012), pow(y, .3));
  c += MAGENTA * .1 * exp(-y * 16.);

  vec2 nq = vec2(atan(rd.x, rd.z) * 2.2, y * 4.5);
  float w = n2(nq * 1.3 + vec2(T * .025, -T * .012));
  float neb = fbm(nq * 1.6 + w * 1.8 - vec2(T * .018, 0.));
  vec3 nebC = mix(vec3(.35, .08, .6), vec3(.05, .35, .75), smoothstep(.35, .7, w));
  c += nebC * nebC * pow(neb, 2.8) * .5 * smoothstep(.04, .3, y);

  vec2 st = vec2(atan(rd.x, rd.z), rd.y) * 110.;
  vec2 id = floor(st), f = fract(st) - .5;
  float h = h21(id);
  c += vec3(.8, .85, 1.) * 2. * step(.986, h) * smoothstep(.1, 0., length(f)) * (.55 + .45 * sin(T * 1.5 + h * 60.)) * smoothstep(.04, .25, y);

  float m = dot(rd, MOON);
  float disc = smoothstep(.99855, .99875, m);
  float bite = smoothstep(.99855, .99875, dot(rd, normalize(MOON + vec3(-.022, .02, .006))));
  if (disc > 0.) {
    vec3 mc = mix(vec3(.8, .85, 1.), vec3(.5, .95, 1.), fbm(rd.xy * 140.));
    c += mc * .75 * disc * (1. - bite);
  }
  c += vec3(.2, .12, .6) * .12 * exp((m - 1.) * 160.);

  vec3 PL = vec3(-.397, .342, -.852);
  float dd = dot(rd, PL);
  if (dd > .95) {
    vec3 pu = normalize(cross(PL, vec3(0, 1, 0)));
    vec3 pv = cross(pu, PL);
    vec2 q = vec2(dot(rd, pu), dot(rd, pv)) / dd / .075;
    float ca = cos(.38), sa = sin(.38);
    vec2 rq = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
    float pd = length(q);
    float planet = smoothstep(1., .97, pd);
    vec3 n3 = vec3(q, sqrt(max(0., 1. - pd * pd)));
    float lit = clamp(dot(n3, normalize(vec3(.8, .35, .5))), 0., 1.);
    float bands = .5 + .5 * sin(rq.y * 7. + 2.5 * fbm(vec2(rq.x * 1.5 + T * .03, rq.y * 5.)));
    vec3 pc = mix(vec3(.02, .1, .4), vec3(.3, .05, .45), bands) * (.02 + 1.1 * pow(lit, 1.3));
    float rr = length(vec2(rq.x, rq.y * 3.4));
    float ring = smoothstep(1.3, 1.36, rr) * smoothstep(2.25, 2.1, rr) * (.55 + .45 * sin(rr * 38.));
    float front = step(rq.y, 0.);
    c += vec3(.08, .12, .6) * .15 * exp(-max(pd - 1., 0.) * 5.) * (1. - planet);
    c = mix(c, pc, planet);
    c += vec3(.5, .4, .9) * ring * .35 * mix(1., front, planet);
  }

  vec2 sp = vec2(atan(rd.x, -rd.z), rd.y);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float tt = T / 5.5 + fk * .47;
    float cyc = floor(tt), ph = fract(tt);
    float r1 = h21(vec2(cyc, fk + 3.)), r2 = h21(vec2(fk + 9., cyc));
    vec2 dir = normalize(vec2(r1 > .5 ? -1. : 1., -.4));
    vec2 head = vec2(mix(-.6, .6, r1), mix(.3, .55, r2)) + dir * ph * 1.6;
    vec2 tail = head - dir * .22;
    vec2 pa = sp - tail, ba = head - tail;
    float hh = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
    float life = smoothstep(0., .03, ph) * smoothstep(.28, .12, ph);
    c += vec3(.85, .95, 1.) * smoothstep(.003, 0., length(pa - ba * hh)) * hh * hh * life * 4.;
  }
  gl_FragColor = vec4(c, 1.);
}`;

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: SKY_GLSL,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
  mesh.renderOrder = -1;
  return mesh;
}

/* ---------------------------------------------------------- the mushroom */

interface ShroomOpts {
  h: number; r: number; bend: number; seed: number;
  cap: THREE.ColorRepresentation; glow: THREE.Color;
  detail: number; // 0..1
}

// Adds a per-vertex emissive term (translucent rim / underside) to a lit material.
function withGlow<T extends THREE.MeshStandardMaterial>(mat: T, color: THREE.Color, strength: { value: number }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowC = { value: color };
    sh.uniforms.uGlowK = strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlowC;\nuniform float uGlowK;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowC * vGlow * uGlowK;');
  };
  return mat;
}

function lathe(points: THREE.Vector2[], segs: number) {
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(points, segs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  return g;
}

function makeMushroom(o: ShroomOpts, pulse: { value: number }) {
  const { h, r, bend, seed } = o;
  const rand = rng(seed * 9973 + 17);
  const group = new THREE.Group();
  const stemTopR = 0.1 * r;
  const segs = Math.round(lerp(40, 120, o.detail));

  /* stem: tapered, bulbous foot, fibrous, bent */
  const stemPts: THREE.Vector2[] = [];
  const rows = Math.round(lerp(14, 40, o.detail));
  stemPts.push(new THREE.Vector2(0.001, -0.35));
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = lerp(-0.3, h + 0.05, t);
    const yy = THREE.MathUtils.clamp(y / h, 0, 1);
    let rad = lerp(0.19, 0.1, yy) * r;
    rad *= 1 + 0.6 * smooth(0.22, 0, yy) + 0.5 * smooth(0.86, 1.02, yy);
    stemPts.push(new THREE.Vector2(rad, y));
  }
  const stemGeo = lathe(stemPts, Math.round(segs * 0.5));
  {
    const p = stemGeo.attributes.position as THREE.BufferAttribute;
    const glow = new Float32Array(p.count);
    const scol = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const yy = THREE.MathUtils.clamp(y / h, 0, 1);
      const fib = 1 + (0.025 * Math.sin(a * 17 + yy * 5) + 0.04 * (noise3(x * 6, y * 1.5, z * 6) - 0.5)) * o.detail;
      x *= fib; z *= fib;
      x += bend * yy * yy * h;
      p.setXYZ(i, x, y, z);
      glow[i] = Math.pow(yy, 4) * 0.15;
      const streak = noise3(Math.cos(a) * 4, y * 0.6, Math.sin(a) * 4);
      const k = lerp(0.35, 1, smooth(-0.3, 0.6, yy)) * (0.8 + 0.3 * streak);
      scol.set([0.95 * k, 0.78 * k, 0.9 * k], i * 3); // the gills above light the top of the stem
    }
    stemGeo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    stemGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    stemGeo.computeVertexNormals();
  }
  const stemMat = withGlow(
    new THREE.MeshStandardMaterial({ color: 0xcfc6ee, vertexColors: true, roughness: 0.8, metalness: 0, emissive: 0x0a0718 }),
    o.glow, pulse,
  );
  const stem = new THREE.Mesh(stemGeo, stemMat);
  group.add(stem);

  /* skirt (annulus) hanging below the cap */
  if (o.detail > 0.3) {
    const ry = h * 0.8, ra = lerp(0.19, 0.1, 0.8) * r;
    const skPts = [
      new THREE.Vector2(ra * 0.95, ry + 0.02 * r),
      new THREE.Vector2(ra + 0.07 * r, ry - 0.05 * r),
      new THREE.Vector2(ra + 0.15 * r, ry - 0.14 * r),
      new THREE.Vector2(ra + 0.2 * r, ry - 0.22 * r),
    ];
    const sk = lathe([...skPts].reverse(), segs);
    const p = sk.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const low = smooth(ry, ry - 0.22 * r, y);
      y += low * (0.035 * r * Math.sin(a * 11 + seed) + 0.03 * r * (noise3(x * 4, 0, z * 4) - 0.5));
      x += bend * 0.64 * h;
      p.setXYZ(i, x, y, z);
    }
    sk.computeVertexNormals();
    const skMat = new THREE.MeshStandardMaterial({ color: 0xd9d0f5, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x1a1238 });
    group.add(new THREE.Mesh(sk, skMat));
  }

  /* cap */
  const capGroup = new THREE.Group();
  capGroup.position.set(bend * h, h, 0);
  capGroup.rotation.z = -Math.atan(2 * bend) * 0.8;
  group.add(capGroup);

  const k = 0.56 * r;
  const droop = (rho: number) => 0.2 * r * smooth(0.3 * r, r, rho);
  const capPts: THREE.Vector2[] = [];
  const topRows = Math.round(lerp(16, 44, o.detail));
  for (let i = 0; i <= topRows; i++) {
    const th = (i / topRows) * THREE.MathUtils.degToRad(102);
    const rho = Math.max(0.001, r * Math.sin(th));
    capPts.push(new THREE.Vector2(rho, k * Math.cos(th) - droop(rho) + 0.05 * r));
  }
  const rimY = capPts[capPts.length - 1].y;
  const under = [
    [0.93, rimY + 0.02 * r], [0.8, rimY + 0.07 * r], [0.6, rimY + 0.12 * r],
    [0.4, rimY + 0.15 * r], [0.2, rimY + 0.17 * r], [stemTopR / r, rimY + 0.18 * r],
  ];
  for (const [rr, y] of under) capPts.push(new THREE.Vector2(rr * r, y));
  const underY = (rho: number) => {
    // piecewise-linear underside, used to hang the gills
    const u = rho / r;
    for (let i = 0; i < under.length - 1; i++) {
      const [r0, y0] = under[i], [r1, y1] = under[i + 1];
      if (u <= r0 && u >= r1) return lerp(y0, y1, (r0 - u) / (r0 - r1));
    }
    return under[under.length - 1][1];
  };
  const wave = (a: number, rho: number) => 0.05 * r * Math.sin(a * 6 + seed * 3) * smooth(0.55 * r, r, rho) + 0.02 * r * Math.sin(a * 13 + seed) * smooth(0.8 * r, r, rho);

  // lathe wants the profile bottom-to-top for outward normals
  const capGeo = lathe([...capPts].reverse(), segs);
  {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const glow = new Float32Array(p.count);
    const col = new Float32Array(p.count * 3);
    const deep = new THREE.Color(o.cap).multiplyScalar(0.8), light = new THREE.Color(o.cap).offsetHSL(0.02, 0.05, 0.12), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rho = Math.hypot(x, z), a = Math.atan2(z, x);
      // darker crown, lighter margin, mottling and radial fibrils
      const fibril = 0.5 + 0.5 * Math.sin(a * 90 + noise3(x * 3, y * 3, z * 3) * 6);
      const mottle = noise3(x / r * 7 + seed, y / r * 7, z / r * 7);
      c.copy(deep).lerp(light, smooth(0.15 * r, 0.95 * r, rho) * 0.8 + 0.25 * mottle - 0.1);
      c.multiplyScalar(0.85 + 0.25 * fibril * smooth(0.3 * r, r, rho));
      col.set([c.r, c.g, c.b], i * 3);
      const lump = (noise3(x / r * 2.4 + seed, y / r * 2.4, z / r * 2.4) - 0.5) * 0.09 * r * o.detail;
      const s = 1 + lump / r * 0.6;
      x *= s; z *= s;
      y += wave(a, rho) + lump * smooth(0, 0.4 * r, y + 0.1 * r);
      y -= 0.06 * x;
      p.setXYZ(i, x, y, z);
      const isUnder = y < rimY + 0.2 * r && rho < 0.94 * r ? 1 : 0;
      glow[i] = smooth(0.9 * r, r, rho) * 0.6 + isUnder * 0.12;
    }
    capGeo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    capGeo.computeVertexNormals();
  }
  const capMat = withGlow(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0,
      clearcoat: 0.8, clearcoatRoughness: 0.3,
      side: THREE.DoubleSide,
    }),
    MAGENTA.clone().multiplyScalar(0.25), pulse,
  );
  capGroup.add(new THREE.Mesh(capGeo, capMat));

  /* warts: raised, faintly glowing scales scattered over the top */
  if (o.detail > 0.2) {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const n = capGeo.attributes.normal as THREE.BufferAttribute;
    const candidates: number[] = [];
    for (let i = 0; i < p.count; i++) if (p.getY(i) > rimY + 0.25 * r && n.getY(i) > 0.15) candidates.push(i);
    const count = Math.round(lerp(14, 70, o.detail));
    const wartGeo = new THREE.IcosahedronGeometry(1, 2);
    const wartMat = new THREE.MeshStandardMaterial({ color: 0xf4e2f2, roughness: 0.9, emissive: 0xff8fe0, emissiveIntensity: 0.35 });
    const warts = new THREE.InstancedMesh(wartGeo, wartMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3(), nor = new THREE.Vector3(), scl = new THREE.Vector3();
    for (let j = 0; j < count; j++) {
      const i = candidates[Math.floor(rand() * candidates.length)];
      pos.fromBufferAttribute(p, i);
      nor.fromBufferAttribute(n, i).normalize();
      const s = r * lerp(0.025, 0.075, Math.pow(rand(), 1.6));
      q.setFromUnitVectors(up, nor);
      scl.set(s, s * 0.45, s * lerp(0.8, 1.2, rand()));
      m.compose(pos.addScaledVector(nor, s * 0.12), q, scl);
      warts.setMatrixAt(j, m);
    }
    capGroup.add(warts);
  }

  /* gills: individual radial plates hanging from the underside */
  {
    const plates = Math.round(lerp(60, 170, o.detail));
    const steps = 10;
    const posArr: number[] = [], colArr: number[] = [], idx: number[] = [];
    const inner = stemTopR * 1.25, outer = 0.92 * r;
    for (let g = 0; g < plates; g++) {
      const a = (g / plates) * Math.PI * 2 + (rand() - 0.5) * 0.01;
      const start = g % 2 ? lerp(inner, outer, 0.45) : g % 4 === 2 ? lerp(inner, outer, 0.2) : inner;
      const ca = Math.cos(a), sa = Math.sin(a);
      const base = posArr.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const rho = lerp(start, outer, t);
        const depth = 0.13 * r * Math.pow(Math.sin(Math.PI * lerp(0.08, 1, t)), 0.6) * smooth(0, 0.12, t);
        const yTop = underY(rho) + 0.01 * r + wave(a, rho);
        const x = ca * rho, z = sa * rho;
        const tilt = -0.06 * x;
        posArr.push(x, yTop + tilt, z, x, yTop - depth + tilt, z);
        // bright cyan near the stem fading to violet at the margin; the free edge glows most
        const c = CYAN.clone().lerp(new THREE.Color(0.4, 0.15, 1), smooth(0.3, 1, rho / r));
        const k0 = 0.08, k1 = lerp(0.95, 0.45, rho / r);
        colArr.push(c.r * k0, c.g * k0, c.b * k0, c.r * k1, c.g * k1, c.b * k1);
        if (s < steps) { const v = base + s * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    gg.setIndex(idx);
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const gills = new THREE.Mesh(gg, gm);
    gills.userData.pulseMat = gm;
    capGroup.add(gills);
    group.userData.gills = gm;
  }

  group.userData.cap = capGroup;
  group.userData.seed = seed;
  return group;
}

/* ------------------------------------------- glowing ground mushrooms */

function makeMycena(count: number, avoid: { x: number; z: number; r: number }[]) {
  const rand = rng(4242);
  // bell-shaped cap, apex up
  const capPts = [
    [0.001, 1], [0.12, 0.985], [0.24, 0.94], [0.34, 0.86], [0.42, 0.74], [0.47, 0.6], [0.5, 0.46],
    [0.52, 0.34], [0.51, 0.28], [0.44, 0.33], [0.3, 0.45], [0.1, 0.55],
  ].map(([x, y]) => new THREE.Vector2(x, y - 0.3));
  const capGeo = new THREE.LatheGeometry(capPts, 20);
  {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.3, rho = Math.hypot(p.getX(i), p.getZ(i));
      const underside = y < 0.5 && rho < 0.49 ? 1 : 0;
      const k = lerp(0.2, 0.9, smooth(1, 0.3, y)) + underside * 0.5; // translucent margin glows brightest
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 1, 7, 8, true);
  stemGeo.translate(0, 0.5, 0);
  {
    const p = stemGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) + 0.08 * y * y);
      const k = lerp(0.02, 0.35, Math.pow(y, 2));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    stemGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const capMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const stemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const caps = new THREE.InstancedMesh(capGeo, capMat, count);
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);

  const base: THREE.Color[] = [];
  const where: THREE.Vector2[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3(), top = new THREE.Vector3();
  let n = 0;
  // clusters, like real mycena growing out of the moss
  while (n < count) {
    const cx = lerp(-5.5, 4.5, rand()), cz = lerp(-1.8, 5.2, rand());
    if (avoid.some((a) => Math.hypot(cx - a.x, cz - a.z) < a.r)) continue;
    const hue = rand();
    const c = hue > 0.82 ? AMBER : hue > 0.45 ? MAGENTA : CYAN;
    const size = lerp(0.5, 1.2, rand());
    const k = 3 + Math.floor(rand() * 7);
    for (let j = 0; j < k && n < count; j++, n++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.35 * size;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const y = groundH(x, z) - 0.02;
      const H = lerp(0.18, 0.55, Math.pow(rand(), 1.4)) * size;
      const s = H * lerp(0.35, 0.5, rand());
      // lean away from the cluster centre
      e.set(Math.sin(a) * d * 0.9 + (rand() - 0.5) * 0.2, rand() * Math.PI * 2, -Math.cos(a) * d * 0.9 + (rand() - 0.5) * 0.2);
      q.setFromEuler(e);
      pos.set(x, y, z);
      scl.set(s * 0.9, H, s * 0.9);
      m.compose(pos, q, scl);
      stems.setMatrixAt(n, m);
      top.set(0.08 * H * 0.9, H, 0).applyQuaternion(q).add(pos);
      const cs = s * lerp(0.55, 0.8, rand());
      scl.set(cs, cs * lerp(0.9, 1.25, rand()), cs);
      m.compose(top, q, scl);
      caps.setMatrixAt(n, m);
      const col = c.clone().offsetHSL((rand() - 0.5) * 0.05, 0, 0);
      base.push(col);
      where.push(new THREE.Vector2(x, z));
      caps.setColorAt(n, col);
      stems.setColorAt(n, col);
    }
  }
  const tmp = new THREE.Color();
  function update(t: number, kick: number) {
    for (let i = 0; i < count; i++) {
      const d = where[i].length();
      const rip = Math.pow(0.5 + 0.5 * Math.sin(d * 1.9 - t * 2.4), 3);
      const k = 0.35 + 1.1 * rip + 0.25 * kick;
      tmp.copy(base[i]).multiplyScalar(k);
      caps.setColorAt(i, tmp);
      stems.setColorAt(i, tmp);
    }
    caps.instanceColor!.needsUpdate = true;
    stems.instanceColor!.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.add(stems, caps);
  return { group, update };
}

/* --------------------------------------------------------------- spores */

function makeSpores(count: number, spread: THREE.Vector3, center: THREE.Vector3, seed: number, rise: number) {
  const rand = rng(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (rand() - 0.5) * spread.x;
    pos[i * 3 + 1] = center.y + rand() * spread.y;
    pos[i * 3 + 2] = center.z + (rand() - 0.5) * spread.z;
    const c = rand() > 0.6 ? MAGENTA : CYAN;
    col.set([c.r, c.g, c.b], i * 3);
    sd[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 40 }, uRise: { value: rise }, uH: { value: spread.y }, uY: { value: center.y } },
    vertexShader: `
      attribute float aSeed; attribute vec3 color;
      uniform float uT, uSize, uRise, uH, uY;
      varying float vA; varying vec3 vC;
      void main() {
        vec3 p = position;
        p.y = uY + mod(p.y - uY + uT * uRise * (.5 + fract(aSeed * 7.1)), uH);
        p.x += sin(uT * .3 + aSeed * 6.) * .35;
        p.z += cos(uT * .25 + aSeed * 4.) * .35;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.4 + fract(aSeed * 13.)) / -mv.z;
        float edge = smoothstep(0., .8, p.y - uY) * smoothstep(uH, uH - 1.5, p.y - uY);
        vA = (.35 + .65 * (.5 + .5 * sin(uT * 2. + aSeed * 40.))) * edge;
        vC = color;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() { float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vC * a * a * vA * 1.6, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  return new THREE.Points(g, mat);
}

/* ------------------------------------------------------------------ UFO */

function makeUfo() {
  const group = new THREE.Group();
  const hull = new THREE.LatheGeometry([
    [0.001, -0.16], [0.35, -0.15], [0.7, -0.09], [0.98, -0.01], [1.02, 0.02], [0.8, 0.08], [0.45, 0.13], [0.001, 0.15],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 64);
  const hullMat = new THREE.MeshPhysicalMaterial({ color: 0x55507a, metalness: 0.95, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
  group.add(new THREE.Mesh(hull, hullMat));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x6fe8ff, emissive: 0x2bbcd8, emissiveIntensity: 1.2, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 }),
  );
  dome.position.y = 0.12;
  group.add(dome);
  const N = 14;
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial(), N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * 0.97, 0.005, Math.sin(a) * 0.97);
    lamps.setMatrixAt(i, m);
    lamps.setColorAt(i, CYAN);
  }
  group.add(lamps);

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOn: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying float vF;
      void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vF = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uT, uOn; varying vec2 vUv; varying float vF;
      void main() {
        float bands = .75 + .25 * sin(vUv.y * 40. + uT * 8.);
        float a = pow(vF, 2.5) * smoothstep(0., .25, vUv.y) * (.35 + .65 * vUv.y) * bands * uOn;
        gl_FragColor = vec4(vec3(.25, .95, 1.) * a * .9, 1.);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamH = 7.5;
  const beamGeo = new THREE.CylinderGeometry(0.28, 1.25, beamH, 40, 1, true);
  beamGeo.translate(0, -beamH / 2 - 0.1, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  group.add(beam);

  const spot = new THREE.SpotLight(CYAN, 0, 14, 0.2, 0.8, 1.5);
  spot.position.set(0, -0.2, 0);
  spot.target.position.set(0, -10, 0);
  group.add(spot, spot.target);

  const tmp = new THREE.Color();
  function update(t: number) {
    group.position.set(3.5 * Math.sin(t * 0.06), 6.6 + 0.25 * Math.sin(t * 0.8), -12 + 2.5 * Math.cos(t * 0.06));
    group.rotation.y = t * 0.6;
    group.rotation.z = 0.06 * Math.sin(t * 0.5);
    const on = smooth(0.2, 0.6, Math.sin(t * 0.21 + 1));
    beamMat.uniforms.uT.value = t;
    beamMat.uniforms.uOn.value = on;
    beam.visible = on > 0.01;
    spot.intensity = on * 60;
    for (let i = 0; i < N; i++) {
      const lit = Math.sin((i / N) * Math.PI * 2 * 3 - t * 5) > 0.3;
      tmp.copy(i % 2 ? MAGENTA : CYAN).multiplyScalar(lit ? 4 : 0.4);
      lamps.setColorAt(i, tmp);
    }
    lamps.instanceColor!.needsUpdate = true;
  }
  return { group, update };
}

/* -------------------------------------------------------------- helpers */

function contactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 1 });
}

function makeGround() {
  const size = 140, seg = 180;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0x0d0820), b = new THREE.Color(0x10233a), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, groundH(x, z));
    c.copy(a).lerp(b, smooth(0.4, 0.75, fbm2(x * 0.6 + 40, z * 0.6, 3)));
    c.multiplyScalar(0.8 + 0.4 * noise3(x * 3, z * 3, 5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
}

function figure(height: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x050409, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(height * 0.12, height * 0.55, 4, 10), mat);
  body.position.y = height * 0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(height * 0.1, 12, 10), mat);
  head.position.y = height * 0.86;
  g.add(body, head);
  return g;
}

/* ---------------------------------------------------------------- start */

export interface GroveHandle { stop(): void }

export function start(canvas: HTMLCanvasElement, opts: { still: boolean; onFirstFrame?: () => void }): GroveHandle {
  const debug = (window as any).__groveDebug || {}; // screenshot/benchmark hook
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a0b36, 0.028);

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 400);

  // sky + environment reflections baked from it
  const sky = makeSky();
  scene.add(sky);
  {
    const envScene = new THREE.Scene();
    const envSky = makeSky();
    (envSky.material as THREE.ShaderMaterial).uniforms.uT.value = 10;
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 400).texture;
    scene.environmentIntensity = 0.3;
    pmrem.dispose();
  }

  scene.add(new THREE.HemisphereLight(0x4a2a8a, 0x05030c, 0.5));
  const moon = new THREE.DirectionalLight(0xb4a8ff, 1.1);
  moon.position.set(0.5, 3, -10);
  scene.add(moon);
  const key = new THREE.DirectionalLight(0x9a6cff, 0.8);
  key.position.set(-6, 5, 7);
  scene.add(key);

  scene.add(makeGround());
  if (debug.expose) (window as any).__groveScene = scene;

  const pulse = { value: 1 };
  const shroomDefs: (ShroomOpts & { x: number; y: number; z: number; s: number })[] = [
    { x: 0, y: -0.1, z: 0, s: 1, h: 3, r: 2, bend: 0.12, seed: 1, cap: 0x5c0a55, glow: CYAN.clone().multiplyScalar(0.5), detail: 1 },
    { x: -3.4, y: -0.05, z: 1.4, s: 0.55, h: 2.4, r: 1.6, bend: -0.28, seed: 2, cap: 0x4a1f9e, glow: CYAN.clone().multiplyScalar(0.4), detail: 0.7 },
    { x: 2.9, y: -0.1, z: -1.9, s: 0.8, h: 3.1, r: 1.4, bend: 0.3, seed: 3, cap: 0x6c1a8f, glow: MAGENTA.clone().multiplyScalar(0.4), detail: 0.7 },
    { x: 2.1, y: -0.05, z: 2.3, s: 0.3, h: 2, r: 1.7, bend: 0.1, seed: 4, cap: 0x9a2170, glow: CYAN.clone().multiplyScalar(0.4), detail: 0.45 },
    { x: -1.5, y: -0.05, z: 3, s: 0.22, h: 2.2, r: 1.3, bend: -0.2, seed: 5, cap: 0x3f2a9c, glow: CYAN.clone().multiplyScalar(0.4), detail: 0.35 },
    { x: -21, y: -0.6, z: -40, s: 1.7, h: 3.2, r: 1.8, bend: 0.22, seed: 6, cap: 0x3a1a6e, glow: CYAN.clone().multiplyScalar(0.3), detail: 0.1 },
    { x: 17, y: -0.6, z: -34, s: 1.5, h: 2.6, r: 2.1, bend: -0.3, seed: 7, cap: 0x4d1a70, glow: MAGENTA.clone().multiplyScalar(0.3), detail: 0.1 },
  ];
  const shadowMat = contactShadow();
  const shrooms = shroomDefs.map((d) => {
    const m = makeMushroom(d, pulse);
    m.position.set(d.x, groundH(d.x, d.z) + d.y, d.z);
    m.scale.setScalar(d.s);
    m.rotation.y = d.seed * 1.7;
    scene.add(m);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(d.x, groundH(d.x, d.z) + 0.03, d.z);
    sh.scale.setScalar(d.r * d.s * 1.3);
    scene.add(sh);
    return m;
  });
  // the giant's gills light the grove
  const gillLight = new THREE.PointLight(CYAN, 4, 12, 2);
  gillLight.position.set(0.9, 1.4, 1.2);
  scene.add(gillLight);
  const magentaLight = new THREE.PointLight(MAGENTA, 2.5, 8, 2);
  magentaLight.position.set(2.9, 1.7, -1.9);
  scene.add(magentaLight);

  const mycena = makeMycena(240, shroomDefs.slice(0, 5).map((d) => ({ x: d.x, z: d.z, r: 0.25 * d.r * d.s + 0.35 })));
  scene.add(mycena.group);

  const f1 = figure(0.62), f2 = figure(0.5);
  f1.position.set(-1.25, groundH(-1.25, 1.9), 1.9);
  f2.position.set(-0.8, groundH(-0.8, 2.15), 2.15);
  scene.add(f1, f2);

  const spores = makeSpores(260, new THREE.Vector3(18, 7, 12), new THREE.Vector3(-1, -0.2, 0), 7, 0.25);
  const moss = makeSpores(350, new THREE.Vector3(12, 0.25, 7), new THREE.Vector3(-0.5, -0.15, 1.2), 11, 0.0);
  scene.add(spores, moss);

  const ufo = makeUfo();
  scene.add(ufo.group);

  // post: bloom for the bioluminescence
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.35, 0.8);
  if (!debug.noBloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* sizing + adaptive quality */
  let pr = debug.pr ?? Math.min(window.devicePixelRatio || 1, 1.25) * 0.75;
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5), MIN_PR = 0.45;
  let shift = -3, dist = 13;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const portrait = h > w;
    camera.aspect = w / h;
    camera.fov = portrait ? 46 : 31;
    camera.updateProjectionMatrix();
    shift = portrait ? 0.3 : -Math.min(2.9, 1.6 * (w / h));
    dist = portrait ? 14 : 11;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    (spores.material as THREE.ShaderMaterial).uniforms.uSize.value = 55 * pr * (h / 800);
    (moss.material as THREE.ShaderMaterial).uniforms.uSize.value = 30 * pr * (h / 800);
  }

  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { tx = e.clientX / innerWidth - 0.5; ty = 0.5 - e.clientY / innerHeight; };
  addEventListener('pointermove', onMove, { passive: true });

  const t0 = performance.now();
  const target = new THREE.Vector3();
  let first = true;
  function frame(now: number) {
    const t = opts.still ? 18 : (now - t0) / 1000 + 6;
    const kick = opts.still ? 0.3 : Math.exp(-(((t * BPM) / 60) % 1) * 5);
    mx += (tx - mx) * 0.03; my += (ty - my) * 0.03;

    const ang = 0.2 * Math.sin(t * 0.06) + mx * 0.2;
    camera.position.set(Math.sin(ang) * dist, 1.25 + my * 0.4 + 0.15 * Math.sin(t * 0.08), Math.cos(ang) * dist);
    target.set(shift, (dist > 14 ? 2.1 : 2.7) + my * 0.2 + 0.1 * Math.sin(t * 0.11), 0);
    if (debug.cam) { camera.position.fromArray(debug.cam[0]); target.fromArray(debug.cam[1]); }
    camera.lookAt(target);
    sky.position.copy(camera.position);
    (sky.material as THREE.ShaderMaterial).uniforms.uT.value = t;

    pulse.value = 0.75 + 0.45 * kick;
    shrooms.forEach((m, i) => {
      const s = m.userData.seed as number;
      m.rotation.z = 0.018 * Math.sin(t * 0.55 + s * 2.3);
      m.rotation.x = 0.012 * Math.sin(t * 0.43 + s * 1.1);
      const cap = m.userData.cap as THREE.Group;
      const br = 1 + 0.02 * Math.sin(t * 0.9 + s * 2.3);
      cap.scale.set(br, 1 / Math.sqrt(br), br);
      (m.userData.gills as THREE.MeshBasicMaterial).color.setScalar(i === 0 ? pulse.value * 1.15 : 0.6 + 0.3 * kick);
    });
    gillLight.intensity = 3.5 + 2.5 * kick;
    mycena.update(t, kick);
    ufo.update(t);
    for (const p of [spores, moss]) (p.material as THREE.ShaderMaterial).uniforms.uT.value = t;

    composer.render();
    if (first) { first = false; opts.onFirstFrame?.(); }
  }

  let running = false, visible = true, raf = 0, samples = 0, acc = 0, last = 0, warm = 90;
  function loop(now: number) {
    // skip warm-up frames (shader compiles, texture uploads) before judging speed
    if (warm > 0) warm--;
    else if (last) {
      acc += now - last;
      if (++samples === 40) {
        const avg = acc / samples;
        if (debug.pr) {}
        else if (avg > 24 && pr > MIN_PR) { pr = Math.max(MIN_PR, pr * 0.85); resize(); }
        else if (avg < 17 && pr < MAX_PR) { pr = Math.min(MAX_PR, pr * 1.1); resize(); }
        samples = 0; acc = 0;
      }
    }
    last = now;
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  function sync() {
    const go = !opts.still && visible && !document.hidden;
    if (go && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    if (!go && running) { running = false; cancelAnimationFrame(raf); }
  }

  const ro = new ResizeObserver(() => { resize(); if (!running) frame(performance.now()); });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  resize();
  frame(performance.now());
  sync();

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', sync);
      renderer.dispose();
    },
  };
}
