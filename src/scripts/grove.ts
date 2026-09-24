// Night grove hero scene: the IM30 cover's mushrooms under a violet sky.
// A cluster of giant hot-pink trumpets glows over a forest of psychedelic caps; a mycelium network
// under the moss carries the light between them, spreading out from the giant when the scene loads,
// pulsing on the kick and following the pointer. Ringed planet, crescent moon, a saucer with a tractor beam.
// Loaded lazily after first paint by MushroomScene.astro.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, lerp, smooth, noise3, fbm2 } from './grove-util';
import { BPM, NOISE_GLSL, fungiTime, fungiKick, makeTrumpet, makeForestShroom, type CapKind, type Trumpet, type ForestShroom } from './fungi';
import { makePsilocybeCluster, type Psilocybe, type Species } from './psilocybe';

const CYAN = new THREE.Color(0.05, 0.7, 1.0);
const MAGENTA = new THREE.Color(1.0, 0.08, 0.6);
const AMBER = new THREE.Color(1.0, 0.45, 0.08);

function groundH(x: number, z: number) {
  const base = 0.5 * fbm2(x * 0.3, z * 0.3) - 0.22;
  // keep the clearing under the giant fairly level
  const clearing = smooth(1.5, 5, Math.hypot(x, z - 0.6));
  return lerp(-0.05, base, 0.35 + 0.65 * clearing);
}

/* ------------------------------------------------------------ sky shader */

const SKY_GLSL = /* glsl */ `
uniform float uT;
uniform vec3 uPL;
varying vec3 vWorld;
const vec3 MAGENTA = vec3(1., .22, .78);
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

  // angles measured from straight ahead (-z), so the wrap-around seam sits behind the camera
  vec2 nq = vec2(atan(rd.x, -rd.z) * 2.2, y * 4.5);
  float w = n2(nq * 1.3 + vec2(T * .025, -T * .012));
  float neb = fbm(nq * 1.6 + w * 1.8 - vec2(T * .018, 0.));
  vec3 nebC = mix(vec3(.35, .08, .6), vec3(.05, .35, .75), smoothstep(.35, .7, w));
  c += nebC * nebC * pow(neb, 2.8) * .5 * smoothstep(.04, .3, y);

  vec2 st = vec2(atan(rd.x, -rd.z), rd.y) * 110.;
  vec2 id = floor(st), f = fract(st) - .5;
  float h = h21(id);
  c += vec3(.8, .85, 1.) * 2. * step(.986, h) * smoothstep(.1, 0., length(f)) * (.55 + .45 * sin(T * 1.5 + h * 60.)) * smoothstep(.04, .25, y);


  vec3 PL = uPL;
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

// the ringed planet's direction in landscape; on portrait screens it follows the view like the moon
const PLANET = new THREE.Vector3(-0.47, 0.27, -0.84).normalize();

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPL: { value: PLANET.clone() } },
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
  wart?: THREE.ColorRepresentation;
  // true: a lifelike Amanita muscaria (scarlet cap, white cottony warts in rings, cream gills, white stem,
  // a bulb ringed with veil scales); otherwise the grove's violet, glowing take on it
  real?: boolean;
}

// Adds a per-vertex emissive term (translucent rim / underside) to a lit material.
// A slow swell travelling around the cap's margin; the cap and its gill plates both apply it so they stay joined.
const MARGIN_WAVE = (r: number, seed: number) => `
  {
    float rhoW = length(transformed.xz);
    float angW = atan(transformed.z, transformed.x);
    transformed.y += smoothstep(${(0.55 * r).toFixed(3)}, ${r.toFixed(3)}, rhoW) * ${(0.03 * r).toFixed(4)} * sin(angW * 3. - uT * .55 + ${seed.toFixed(1)});
  }`;

// With `sweep`, a band of brighter glow travels slowly around the mushroom (and `wave` moves its margin).
// `under` adds a second glow colour carried by an aUnderG attribute (the cap's underside, between the gills).
function withGlow<T extends THREE.MeshStandardMaterial>(mat: T, color: THREE.Color, strength: { value: number }, sweep = false, wave = '', under?: THREE.Color) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowC = { value: color };
    sh.uniforms.uGlowK = strength;
    sh.uniforms.uT = fungiTime;
    sh.uniforms.uUnderC = { value: under ?? new THREE.Color(0, 0, 0) };
    // the sweep is evaluated per vertex: an angle interpolated across the lathe's seam would draw a line
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aGlow;\nuniform float uT;\nvarying float vGlow;${under ? '\nattribute float aUnderG;\nvarying float vUnderG;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${under ? '\nvUnderG = aUnderG;' : ''}
        vGlow = aGlow${sweep ? ' * (1. + 1.6 * pow(.5 + .5 * sin(atan(position.z, position.x) * 2. - uT * .9), 6.))' : ''};${wave}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uGlowC, uUnderC;\nuniform float uGlowK;\nvarying float vGlow;${under ? '\nvarying float vUnderG;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowC * vGlow * uGlowK${under ? ' + uUnderC * vUnderG * uGlowK' : ''};`);
  };
  mat.customProgramCacheKey = () => (sweep ? 'glow-sweep' : 'glow') + (under ? '-under' : '') + wave;
  return mat;
}

function lathe(points: THREE.Vector2[], segs: number) {
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(points, segs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  return g;
}

const REAL_CROWN = new THREE.Color(0.32, 0.004, 0.004), REAL_BODY = new THREE.Color(0.72, 0.018, 0.008), REAL_MARGIN = new THREE.Color(0.9, 0.2, 0.025);
const REAL_GILL = new THREE.Color(0.97, 0.93, 0.84);

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
    const y = lerp(-0.3, h + 0.12, t);
    const yy = THREE.MathUtils.clamp(y / h, 0, 1);
    let rad = lerp(0.19, 0.1, yy) * r;
    // bulbous foot; at the top the stem flares out into the cap, closing the hub the gills hang from
    const flare = smooth(h - 0.12 * r, h + 0.12, y);
    rad *= 1 + (o.real ? 0.95 : 0.6) * smooth(o.real ? 0.2 : 0.22, 0, yy) + 0.5 * smooth(0.86, 1.02, yy) + 1.4 * flare * flare;
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
      // the flare into the cap sits among the gills and glows with them
      glow[i] = Math.pow(yy, 4) * 0.15 + 1.6 * smooth(h - 0.25 * r, h - 0.05 * r, y);
      const streak = noise3(Math.cos(a) * 4, y * 0.6, Math.sin(a) * 4);
      const k = lerp(0.35, 1, smooth(-0.3, 0.6, yy)) * (0.8 + 0.3 * streak);
      if (o.real) { const w = lerp(0.72, 1, smooth(-0.3, 0.5, yy)) * (0.9 + 0.12 * streak); scol.set([w, w * 0.97, w * 0.9], i * 3); }
      else scol.set([0.95 * k, 0.78 * k, 0.9 * k], i * 3); // the gills above light the top of the stem
    }
    stemGeo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    stemGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    stemGeo.computeVertexNormals();
  }
  const stemMat = withGlow(
    new THREE.MeshStandardMaterial({ color: o.real ? 0xf4f0e8 : 0xcfc6ee, vertexColors: true, roughness: 0.8, metalness: 0, emissive: o.real ? 0x1a1612 : 0x0a0718 }),
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
    const lowA = new Float32Array(p.count);
    const bx = bend * 0.64 * h;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const low = smooth(ry, ry - 0.22 * r, y);
      y += low * r * (0.03 * (noise3(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 2) - 0.5) * 2 + 0.012 * Math.sin(a * 9 + seed));
      x += bx;
      p.setXYZ(i, x, y, z);
      lowA[i] = low;
    }
    if (o.real) {
      const kc = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const l = smooth(0.6, 1, lowA[i]); kc.set([1, lerp(1, 0.9, l), lerp(0.97, 0.55, l)], i * 3); }
      sk.setAttribute('color', new THREE.BufferAttribute(kc, 3));
    }
    sk.setAttribute('aLow', new THREE.BufferAttribute(lowA, 1));
    sk.computeVertexNormals();
    const skMat = new THREE.MeshStandardMaterial({ color: o.real ? 0xfaf6ee : 0xd9d0f5, vertexColors: !!o.real, roughness: 0.85, side: THREE.DoubleSide, emissive: o.real ? 0x1c1812 : 0x1a1238 });
    // the hanging edge drifts like light fabric in a slow draught
    skMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uT: fungiTime, uKick: fungiKick, uSeed: { value: seed }, uR: { value: r }, uBx: { value: bx } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLow;\nuniform float uT, uKick, uSeed, uR, uBx;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec2 c = transformed.xz - vec2(uBx, 0.);
            float ang = atan(c.y, c.x);
            float lo = aLow * aLow;
            transformed.y += lo * uR * (.018 * sin(ang * 4. + uT * .6 + uSeed) + .009 * sin(ang * 7. - uT * .9 + uSeed * 2.));
            transformed.xz = c * (1. + lo * .014 * sin(ang * 3. - uT * .45 + uSeed)) + vec2(uBx, 0.);
          }`);
    };
    skMat.customProgramCacheKey = () => 'skirt' + (o.real ? '-real' : '');
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
  const thEnd = THREE.MathUtils.degToRad(92);
  for (let i = 0; i <= topRows; i++) {
    const th = (i / topRows) * thEnd;
    const rho = Math.max(0.001, r * Math.sin(th));
    capPts.push(new THREE.Vector2(rho, k * Math.cos(th) - droop(rho) + 0.05 * r));
  }
  // a thick, rounded margin that curls under, like a real cap edge
  const edge = capPts[capPts.length - 1];
  const bead = 0.045 * r;
  const bc = new THREE.Vector2(edge.x - bead * 0.9, edge.y - bead * 0.35);
  for (let deg = 10; deg >= -190; deg -= 25) {
    const ph = THREE.MathUtils.degToRad(deg);
    capPts.push(new THREE.Vector2(bc.x + bead * Math.cos(ph), bc.y + bead * Math.sin(ph)));
  }
  const rimY = bc.y - bead;
  const under = [
    [(bc.x - bead * 1.2) / r, rimY + 0.05 * r], [0.8, rimY + 0.085 * r], [0.6, rimY + 0.13 * r],
    [0.4, rimY + 0.16 * r], [0.2, rimY + 0.175 * r], [stemTopR / r, rimY + 0.185 * r],
  ];
  for (const [rr, y] of under) capPts.push(new THREE.Vector2(rr * r, y));
  const underY = (rho: number) => {
    // piecewise-linear underside, used to hang the gills
    const u = rho / r;
    for (let i = 0; i < under.length - 1; i++) {
      const [r0, y0] = under[i], [r1, y1] = under[i + 1];
      if (u <= r0 && u >= r1) return lerp(y0, y1, (r0 - u) / (r0 - r1));
    }
    return under[u > under[0][0] ? 0 : under.length - 1][1];
  };
  // irregular, seamless undulation of the margin (periodic noise around the cap, not a sine)
  const pn = (a: number, f: number, sd: number) => noise3(Math.cos(a) * f + sd * 7.3, Math.sin(a) * f, sd * 3.1) * 2 - 1;
  const wave = (a: number, rho: number) =>
    r * smooth(0.45 * r, r, rho) * (0.05 * pn(a, 1.3, seed) + 0.016 * pn(a, 3.6, seed + 5)) +
    r * smooth(0.8 * r, r, rho) * 0.005 * pn(a, 11, seed + 9);

  // lathe wants the profile bottom-to-top for outward normals
  const capGeo = lathe([...capPts].reverse(), segs);
  {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const glow = new Float32Array(p.count);
    const underG = new Float32Array(p.count);
    const col = new Float32Array(p.count * 3);
    const deep = new THREE.Color(o.cap).multiplyScalar(0.8), light = new THREE.Color(o.cap).offsetHSL(0.02, 0.05, 0.12), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rho = Math.hypot(x, z), a = Math.atan2(z, x);
      // darker crown, lighter margin, mottling and radial fibrils
      const fibril = 0.5 + 0.5 * Math.sin(a * 90 + noise3(x * 3, y * 3, z * 3) * 6);
      const mottle = noise3(x / r * 7 + seed, y / r * 7, z / r * 7);
      if (o.real) {
        // deep scarlet crown, orange-red body, paler orange at the margin, which is finely grooved
        const u = rho / r;
        c.copy(REAL_CROWN).lerp(REAL_BODY, smooth(0.05, 0.55, u + 0.15 * (mottle - 0.5))).lerp(REAL_MARGIN, smooth(0.78, 1, u) * 0.5);
        c.multiplyScalar((0.9 + 0.15 * mottle) * (1 - 0.18 * smooth(0.82, 0.97, u) * Math.pow(0.5 + 0.5 * Math.sin(a * 140), 3)));
      } else {
        c.copy(deep).lerp(light, smooth(0.15 * r, 0.95 * r, rho) * 0.8 + 0.25 * mottle - 0.1);
        c.multiplyScalar(0.85 + 0.25 * fibril * smooth(0.3 * r, r, rho));
      }
      col.set([c.r, c.g, c.b], i * 3);
      const lump = (noise3(x / r * 2.4 + seed, y / r * 2.4, z / r * 2.4) - 0.5) * 0.09 * r * o.detail;
      const s = 1 + lump / r * 0.6;
      x *= s; z *= s;
      y += wave(a, rho) + lump * smooth(0, 0.4 * r, y + 0.1 * r);
      y -= 0.06 * x;
      p.setXYZ(i, x, y, z);
      const isUnder = y < rimY + 0.2 * r && rho < 0.94 * r ? 1 : 0;
      glow[i] = smooth(0.9 * r, r, rho) * 0.6 + isUnder * 0.12;
      underG[i] = (y < rimY + 0.28 * r && rho < 0.94 * r ? 1 : 0) * lerp(1, 0.4, smooth(0.1 * r, 0.9 * r, rho));
    }
    capGeo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    capGeo.setAttribute('aUnderG', new THREE.BufferAttribute(underG, 1));
    capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    capGeo.computeVertexNormals();
  }
  const capMat = withGlow(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: o.real ? 0.3 : 0.42, metalness: 0,
      clearcoat: o.real ? 1 : 0.8, clearcoatRoughness: o.real ? 0.15 : 0.3,
      side: THREE.DoubleSide,
      // the real one keeps its scarlet under the grove's violet light
      emissive: o.real ? 0x6a0300 : 0x000000,
    }),
    o.real ? new THREE.Color(0.9, 0.06, 0.02).multiplyScalar(0.28) : MAGENTA.clone().multiplyScalar(0.25), pulse, true, o.detail > 0.5 ? MARGIN_WAVE(r, seed) : '',
    // between the gill plates the underside glows with them instead of showing dark
    o.real ? REAL_GILL.clone().multiplyScalar(0.3) : CYAN.clone().lerp(new THREE.Color(0.4, 0.15, 1), 0.3).multiplyScalar(0.55),
  );
  capGroup.add(new THREE.Mesh(capGeo, capMat));

  /* warts: raised, faintly glowing scales scattered over the top */
  if (o.detail > 0.2) {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const n = capGeo.attributes.normal as THREE.BufferAttribute;
    const candidates: number[] = [];
    for (let i = 0; i < p.count; i++) if (p.getY(i) > rimY + 0.25 * r && n.getY(i) > 0.15) candidates.push(i);
    const count = Math.round(lerp(14, o.real ? 150 : 70, o.detail));
    const wartGeo = new THREE.IcosahedronGeometry(1, o.real ? 1 : 2);
    const wartMat = o.real
      ? new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 1, emissive: 0xfff2dc, emissiveIntensity: 0.28, flatShading: true })
      : new THREE.MeshStandardMaterial({ color: o.wart ?? 0xf4e2f2, roughness: 0.9, emissive: o.wart ?? 0xff8fe0, emissiveIntensity: o.wart ? 0.5 : 0.35 });
    wartMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor * vColor;\n#endif');
    };
    wartMat.customProgramCacheKey = () => 'wart';
    const warts = new THREE.InstancedMesh(wartGeo, wartMat, count);
    for (let j = 0; j < count; j++) warts.setColorAt(j, new THREE.Color(1, 1, 1));
    group.userData.warts = warts;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3(), nor = new THREE.Vector3(), scl = new THREE.Vector3();
    // real: laid out in loose concentric rings, big and crowded on the crown, small and sparse toward the margin
    const nearest = (rho: number, ang: number) => {
      let best = candidates[0], bd = Infinity;
      const tx = Math.cos(ang) * rho, tz = Math.sin(ang) * rho;
      for (const i of candidates) { const d = (p.getX(i) - tx) ** 2 + (p.getZ(i) - tz) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    };
    for (let j = 0; j < count; j++) {
      let i: number, s: number;
      if (o.real) {
        const f = Math.pow((j + 0.5) / count, 0.75);             // ring position, crown to margin
        const rho = r * (0.04 + 0.8 * f) + (rand() - 0.5) * 0.05 * r;
        i = nearest(rho, j * 2.39996 + rand() * 0.4);            // golden-angle spacing around the rings
        s = r * lerp(0.1, 0.035, f) * lerp(0.75, 1.2, rand());
      } else {
        i = candidates[Math.floor(rand() * candidates.length)];
        s = r * lerp(0.025, 0.075, Math.pow(rand(), 1.6));
      }
      pos.fromBufferAttribute(p, i);
      nor.fromBufferAttribute(n, i).normalize();
      q.setFromUnitVectors(up, nor);
      if (o.real) scl.set(s, s * lerp(0.25, 0.45, rand()), s * lerp(0.8, 1.15, rand()));
      else scl.set(s, s * 0.45, s * lerp(0.8, 1.2, rand()));
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
    const inner = stemTopR * 2.6, outer = under[0][0] * r - 0.01 * r;
    const tArr: number[] = [], edgeArr: number[] = [], plateArr: number[] = [], angArr: number[] = [];
    for (let g = 0; g < plates; g++) {
      const pr = rand();
      const a = (g / plates) * Math.PI * 2 + (rand() - 0.5) * 0.01;
      const start = g % 2 ? lerp(inner, outer, 0.45) : g % 4 === 2 ? lerp(inner, outer, 0.2) : inner;
      const ca = Math.cos(a), sa = Math.sin(a);
      const base = posArr.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const rho = lerp(start, outer, t);
        const depth = 0.12 * r * Math.pow(Math.sin(Math.PI * lerp(0.08, 1, t)), 0.7) * smooth(0, 0.12, t) * smooth(1, 0.85, t);
        const yTop = underY(rho) + 0.01 * r + wave(a, rho);
        const x = ca * rho, z = sa * rho;
        const tilt = -0.06 * x;
        posArr.push(x, yTop + tilt, z, x, yTop - depth + tilt, z);
        // bright cyan near the stem fading to violet at the margin; the free edge glows most
        const c = o.real ? REAL_GILL.clone() : CYAN.clone().lerp(new THREE.Color(0.4, 0.15, 1), smooth(0.3, 1, rho / r));
        const k0 = o.real ? lerp(0.35, 0.2, t) : lerp(0.3, 0.08, smooth(0, 0.35, t)), k1 = o.real ? lerp(0.62, 0.45, rho / r) : lerp(0.95, 0.45, rho / r);
        colArr.push(c.r * k0, c.g * k0, c.b * k0, c.r * k1, c.g * k1, c.b * k1);
        const tt = (rho - inner) / (outer - inner);
        tArr.push(tt, tt); edgeArr.push(0, 1); plateArr.push(pr, pr); angArr.push(a, a);
        if (s < steps) { const v = base + s * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    gg.setAttribute('aT', new THREE.Float32BufferAttribute(tArr, 1));
    gg.setAttribute('aEdge', new THREE.Float32BufferAttribute(edgeArr, 1));
    gg.setAttribute('aPlate', new THREE.Float32BufferAttribute(plateArr, 1));
    gg.setAttribute('aAng', new THREE.Float32BufferAttribute(angArr, 1));
    gg.setIndex(idx);
    const gm = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    gm.onBeforeCompile = (sh) => {
      sh.uniforms.uT = fungiTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aT, aEdge, aPlate, aAng;\nuniform float uT;\nvarying float vT, vEdge, vPlate, vAng;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvT = aT; vEdge = aEdge; vPlate = aPlate; vAng = aAng;${o.detail > 0.5 ? MARGIN_WAVE(r, seed) : ''}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uT;\nvarying float vT, vEdge, vPlate, vAng;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // comets of light running out along the plates, stem to margin, each plate on its own clock
            float x = fract(vT * 1.1 - uT * (.22 + .3 * vPlate) + vPlate * 9.);
            float comet = pow(x, 12.) * (1. - smoothstep(.97, 1., x)) * step(.6, fract(vPlate * 7.3));
            // and a slow beam of light turning around the underside
            float sweep = pow(.5 + .5 * cos(vAng - uT * .45), 10.);
            float gate = min(diffuse.r, 1.2);
            diffuseColor.rgb += (${o.real ? 'vec3(1., .95, .8) * comet * (.35 + .65 * vEdge) * .8 + diffuseColor.rgb * sweep * .35' : 'vec3(.45, 1.15, 1.6) * comet * (.35 + .65 * vEdge) * 1.3 + diffuseColor.rgb * sweep * .7'}) * gate;
          }`);
    };
    gm.customProgramCacheKey = () => 'gill-plates' + (o.real ? '-real' : '') + (o.detail > 0.5 ? MARGIN_WAVE(r, seed) : '');
    const gills = new THREE.Mesh(gg, gm);
    gills.userData.pulseMat = gm;
    capGroup.add(gills);
    group.userData.gills = gm;

    // the hub between the stem and where the gills begin: a glowing collar, so there's no dark hole
    const hubPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const rho = lerp(0.001, inner + 0.04 * r, i / 8);
      hubPts.push(new THREE.Vector2(rho, underY(rho) + 0.004 * r - 0.03 * r * smooth(inner * 0.7, inner, rho)));
    }
    const hubGeo = new THREE.LatheGeometry(hubPts, Math.round(segs * 0.5));
    {
      const hp = hubGeo.attributes.position as THREE.BufferAttribute;
      const hc = new Float32Array(hp.count * 3);
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i), z = hp.getZ(i), rho = Math.hypot(x, z);
        const k = lerp(0.55, 0.3, smooth(stemTopR, inner, rho));
        const hcol = o.real ? REAL_GILL : CYAN;
        hc.set([hcol.r * k, hcol.g * k, hcol.b * k], i * 3);
        hp.setY(i, hp.getY(i) + wave(Math.atan2(z, x), rho) - 0.06 * x);
      }
      hubGeo.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    }
    const hub = new THREE.Mesh(hubGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    capGroup.add(hub);
    group.userData.hub = hub.material;
  }

  /* real: the bulb at the foot, ringed with scaly remnants of the universal veil */
  if (o.real && o.detail > 0.3) {
    const rings = 3, per = 26;
    const scales = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xefe8da, roughness: 1, flatShading: true, emissive: 0x1a1610 }), rings * per);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < rings; k++) for (let j = 0; j < per; j++) {
      const yy = lerp(0.05, 0.16, k / (rings - 1)) * h;
      const t = yy / h;
      const rad = lerp(0.19, 0.1, t) * r * (1 + 0.95 * smooth(0.2, 0, t)) * 1.02;
      const a = (j / per) * Math.PI * 2 + k * 0.4 + rand() * 0.15;
      e.set(0, -a, -0.9 + rand() * 0.3);
      qq.setFromEuler(e);
      const sc = r * lerp(0.035, 0.025, k / rings);
      mm.compose(new THREE.Vector3(Math.cos(a) * rad + bend * t * t * h, yy, Math.sin(a) * rad), qq, new THREE.Vector3(sc * 0.5, sc * 1.1, sc));
      scales.setMatrixAt(k * per + j, mm);
    }
    group.add(scales);
  }

  /* a slow fall of glowing spores from the gills */
  if (o.detail > 0.9) {
    const N = 150;
    const sd = new Float32Array(N);
    for (let i = 0; i < N; i++) sd[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { uT: fungiTime, uSize: { value: 30 }, uH: { value: h }, uR: { value: r }, uBx: { value: bend * h } },
      vertexShader: `
        attribute float aSeed; uniform float uT, uSize, uH, uR, uBx; varying float vA; varying float vHue;
        void main() {
          float k = fract(aSeed * 7.1 + uT * (.025 + .025 * fract(aSeed * 3.3)));
          float a = aSeed * 6.2832 * 11. + k * 2.5;
          float rad = uR * mix(.3, .95, fract(aSeed * 13.7)) * (1. + .25 * k);
          vec3 p = vec3(uBx * (1. - k * .5) + cos(a) * rad, uH - .12 * uR - k * (uH + .1), sin(a) * rad);
          p.x += sin(uT * .6 + aSeed * 30.) * .12;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (.4 + .8 * fract(aSeed * 17.)) / -mv.z;
          vA = smoothstep(0., .08, k) * smoothstep(1., .75, k) * (.5 + .5 * sin(uT * 3. + aSeed * 60.));
          vHue = fract(aSeed * 5.);
        }`,
      fragmentShader: `varying float vA; varying float vHue;
        void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d);
          gl_FragColor = vec4(mix(vec3(.3, 1.1, 1.5), vec3(.9, .4, 1.4), vHue) * a * a * vA * 1.4, 1.); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, sm);
    pts.frustumCulled = false;
    group.add(pts);
    group.userData.spores = sm;
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
  function update(t: number, kick: number, spread: number, origin: THREE.Vector2) {
    for (let i = 0; i < count; i++) {
      const d = where[i].distanceTo(origin);
      const rip = Math.pow(0.5 + 0.5 * Math.sin(d * 1.1 - t * 1.4), 3);
      // dark until the infection reaches them, then a bright flash as it passes
      const lit = smooth(d, d + 1.5, spread), flash = Math.exp(-Math.pow((spread - d) * 0.9, 2));
      const k = (0.35 + 1.1 * rip + 0.25 * kick) * lit + 2.5 * flash;
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

function panelTexture() {
  // brushed metal with radial panel seams and concentric rings, mapped around the lathe
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8b4d0';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '40,36,70'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, Math.random() * 60, 1);
  }
  g.strokeStyle = 'rgba(20,16,40,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 32; i++) { const x = (i / 32) * c.width; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (const y of [40, 78, 120, 150, 196, 230]) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.fillStyle = 'rgba(20,16,40,0.6)';
  for (let i = 0; i < 64; i++) for (const y of [60, 170]) { g.beginPath(); g.arc((i / 64) * c.width + 8, y, 2, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeUfo() {
  const group = new THREE.Group();
  const craft = new THREE.Group(); // wobbles; the beam stays vertical
  group.add(craft);

  const hullPts = [
    [0.001, -0.2], [0.2, -0.2], [0.26, -0.17], [0.34, -0.19], [0.55, -0.15], [0.78, -0.09], [0.96, -0.035],
    [1.03, -0.01], [1.03, 0.025], [0.97, 0.05], [0.8, 0.09], [0.6, 0.13], [0.45, 0.16], [0.36, 0.17], [0.001, 0.17],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tex = panelTexture();
  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0xc4c0e8, map: tex, metalness: 0.7, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08,
    envMapIntensity: 2.2,
  });
  craft.add(new THREE.Mesh(new THREE.LatheGeometry(hullPts, 96), hullMat));

  // glowing seam around the rim
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.012, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.75, 1.05) }));
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.008;
  craft.add(seam);

  // portholes on the rim band, chasing colours
  const W = 28;
  const wins = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial(), W);
  const m = new THREE.Matrix4();
  for (let i = 0; i < W; i++) {
    const a = (i / W) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * 1.02, 0.0, Math.sin(a) * 1.02);
    wins.setMatrixAt(i, m);
    wins.setColorAt(i, CYAN);
  }
  craft.add(wins);

  // glass canopy with a warm glowing cockpit and a tiny pilot
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x9ff4ff, metalness: 0, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.14, envMapIntensity: 2.5 }),
  );
  canopy.position.y = 0.16;
  craft.add(canopy);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.16, 0.22) }));
  cockpit.position.y = 0.16;
  craft.add(cockpit);
  const pilotMat = new THREE.MeshBasicMaterial({ color: 0x05030a });
  const pilot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 8), pilotMat);
  body.position.y = 0.26;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), pilotMat);
  head.scale.set(1, 1.25, 1);
  head.position.y = 0.4;
  pilot.add(body, head);
  craft.add(pilot);

  // antenna beacon
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.2, 6), hullMat);
  mast.position.y = 0.62;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.6) }));
  beacon.position.y = 0.73;
  craft.add(mast, beacon);

  // engine ring and swirling core on the belly
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.55, 0.75) }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.185;
  craft.add(ring);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uT; varying vec2 vUv;
      void main() {
        vec2 p = vUv - .5; float r = length(p) * 2.; float a = atan(p.y, p.x);
        float swirl = .5 + .5 * sin(a * 5. + r * 10. - uT * 6.);
        vec3 c = mix(vec3(.06, .5, .7), vec3(.7, .1, .55), swirl) * (1.2 - r) * (.5 + .5 * swirl);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), coreMat);
  core.rotation.x = Math.PI / 2;
  core.position.y = -0.19;
  craft.add(core);

  /* tractor beam: two nested cones, rising motes, and a ripple where it lands */
  const beamMat = (inner: boolean) => new THREE.ShaderMaterial({
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
      float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
      void main() {
        float y = vUv.y;
        float bands = .6 + .4 * sin(y * 55. - uT * 9.) * sin(vUv.x * 6.2832 * 3. + uT * 1.5);
        float streak = .7 + .3 * sin(vUv.x * 6.2832 * 11. + y * 8. + uT * 2.);
        float a = pow(vF, ${inner ? '1.5' : '3.'}) * smoothstep(0., .12, y) * smoothstep(1., .9, y) * (.3 + .7 * y) * bands * streak * uOn;
        vec3 c = ${inner ? 'vec3(.5, 1.6, 2.)' : 'vec3(.1, .8, 1.2)'};
        gl_FragColor = vec4(c * a * ${inner ? '.55' : '.45'}, 1.);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Group();
  const outerMat = beamMat(false), innerMat = beamMat(true);
  const cone = (rTop: number, rBot: number, mat: THREE.Material) => {
    const g = new THREE.CylinderGeometry(rTop, rBot, 1, 48, 1, true);
    g.translate(0, -0.5, 0);
    return new THREE.Mesh(g, mat);
  };
  beam.add(cone(0.3, 1.5, outerMat), cone(0.18, 0.8, innerMat));
  beam.position.y = -0.2;
  group.add(beam);

  const M = 160;
  const motePos = new Float32Array(M * 3), moteSeed = new Float32Array(M);
  for (let i = 0; i < M; i++) { moteSeed[i] = Math.random(); }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOn: { value: 0 }, uLen: { value: 6 }, uSize: { value: 40 } },
    vertexShader: `
      attribute float aSeed; uniform float uT, uLen, uSize, uOn; varying float vA;
      void main() {
        float k = fract(aSeed * 7.3 + uT * (.08 + .06 * fract(aSeed * 13.)));
        float y = -uLen + k * uLen;
        float rad = mix(.15, 1.3, 1. - k) * fract(aSeed * 31.);
        float a = aSeed * 50. + uT * (1. + fract(aSeed * 3.)) + k * 6.;
        vec3 p = vec3(cos(a) * rad, y, sin(a) * rad);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.5 + fract(aSeed * 17.)) / -mv.z;
        vA = uOn * smoothstep(0., .1, k) * smoothstep(1., .85, k);
      }`,
    fragmentShader: `
      varying float vA;
      void main() { float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vec3(.5, 1.5, 2.) * a * a * vA, 1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  beam.add(motes);

  const rippleMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uOn: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uT, uOn; varying vec2 vUv;
      void main() {
        float r = length(vUv - .5) * 2.;
        float rings = pow(.5 + .5 * sin(r * 22. - uT * 5.), 6.);
        float a = (rings * .8 + .5 * smoothstep(.5, 0., r)) * smoothstep(1., .6, r) * uOn;
        gl_FragColor = vec4(vec3(.2, 1.1, 1.6) * a * .6, 1.);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), rippleMat);
  ripple.rotation.x = -Math.PI / 2;
  group.add(ripple);

  const spot = new THREE.SpotLight(CYAN, 0, 16, 0.24, 0.8, 1.5);
  spot.position.set(0, -0.2, 0);
  spot.target.position.set(0, -10, 0);
  group.add(spot, spot.target);
  const underGlow = new THREE.PointLight(CYAN, 2, 3, 2);
  underGlow.position.y = -0.5;
  craft.add(underGlow);

  const SCALE = 1.45;
  group.scale.setScalar(SCALE);
  const tmp = new THREE.Color();
  function update(t: number) {
    const x = -0.8 + 3.8 * Math.sin(t * 0.07), z = -7.5 + 2.2 * Math.cos(t * 0.07);
    const y = 5.4 + 0.22 * Math.sin(t * 0.8);
    group.position.set(x, y, z);
    craft.rotation.set(0.07 * Math.sin(t * 0.5), t * 0.5, 0.08 * Math.cos(t * 0.37 + 1) - 0.06 * Math.cos(t * 0.07));
    const on = smooth(0.15, 0.55, Math.sin(t * 0.2 + 1));
    const ground = groundH(x, z);
    const len = (y - ground) / SCALE - 0.2;
    beam.scale.set(1, len, 1);
    beam.visible = on > 0.01;
    for (const mt of [outerMat, innerMat, rippleMat]) { mt.uniforms.uT.value = t; mt.uniforms.uOn.value = on; }
    moteMat.uniforms.uT.value = t; moteMat.uniforms.uOn.value = on;
    moteMat.uniforms.uLen.value = 1; // motes live in beam space (already scaled by len)
    ripple.position.y = (ground + 0.04 - y) / SCALE;
    ripple.visible = on > 0.01;
    spot.intensity = on * 90;
    coreMat.uniforms.uT.value = t;
    underGlow.intensity = 0.8 + 1.2 * on;
    (beacon.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.1, 0.25).multiplyScalar(Math.sin(t * 6) > 0.6 ? 2.2 : 0.15);
    pilot.rotation.y = Math.sin(t * 0.9) * 0.8;
    for (let i = 0; i < W; i++) {
      const lit = 0.5 + 0.5 * Math.sin((i / W) * Math.PI * 2 * 4 - t * 6);
      tmp.copy(i % 3 === 0 ? MAGENTA : CYAN).multiplyScalar(0.25 + 1.4 * Math.pow(lit, 3));
      wins.setColorAt(i, tmp);
    }
    wins.instanceColor!.needsUpdate = true;
  }
  return { group, update, moteMat };
}

/* ----------------------------------------------------------------- moon */

function makeMoon(sunDir: THREE.Vector3) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uT: { value: 0 } },
    vertexShader: `
      varying vec3 vObj; varying vec3 vN; varying vec3 vView;
      void main() {
        vObj = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uT;
      varying vec3 vObj; varying vec3 vN; varying vec3 vView;
      float h3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.07; a *= .5; } return s; }
      // craters: bowl darkening + bright raised rim
      vec2 craters(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        float bowl = 0., rim = 0.;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
          vec3 b = vec3(x, y, z);
          vec3 o = vec3(h3(i + b), h3(i + b + 7.1), h3(i + b + 13.3));
          float d = length(b + o - f);
          float s = .18 + .3 * h3(i + b + 3.3);
          if (h3(i + b + 5.7) < .55) continue;
          bowl = max(bowl, smoothstep(s, s * .55, d));
          rim = max(rim, smoothstep(s * 1.25, s, d) * smoothstep(s * .75, s, d));
        }
        return vec2(bowl, rim);
      }
      void main() {
        vec3 p = normalize(vObj);
        float maria = smoothstep(.42, .6, fbm(p * 1.7 + 3.));
        float alb = .72 - .4 * maria + .18 * (fbm(p * 10.) - .5);
        vec2 c1 = craters(p * 3.5), c2 = craters(p * 9. + 5.);
        alb *= 1. - .35 * c1.x - .2 * c2.x;
        alb += .28 * c1.y + .14 * c2.y;
        // relief: shift lighting by crater slope toward the sun
        vec3 n = normalize(vN);
        float lit = dot(n, uSun);
        float terminator = smoothstep(-.06, .25, lit);
        vec3 col = vec3(.8, .82, 1.) * alb * terminator * .95;
        col += vec3(.16, .12, .38) * alb * .42 * (1. - terminator);   // earthshine keeps the dark side readable
        float fres = pow(1. - max(dot(n, vView), 0.), 3.);
        col += vec3(.45, .55, 1.) * fres * .35 * smoothstep(-.3, .3, lit); // lit limb glow
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), mat);

  // soft atmospheric halo behind it
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grd.addColorStop(0, 'rgba(170,150,255,0.35)');
  grd.addColorStop(0.35, 'rgba(120,90,255,0.18)');
  grd.addColorStop(1, 'rgba(60,20,160,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  halo.renderOrder = -0.5;
  const group = new THREE.Group();
  group.add(halo, moon);
  moon.userData.halo = halo;
  return { group, moon, halo, mat };
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


/* ------------------------------------------------- ground + the mycelium */

// Mushroom feet the mycelium pools around: x, z, reach, strength.
const MAX_SRC = 12;

interface Infection {
  t: { value: number };
  kick: { value: number };
  origin: { value: THREE.Vector2 }; // where the infection starts: the trumpets' foot, back and to the left
  spread: { value: number };       // how far from the origin the infection has reached
  ptr: { value: THREE.Vector3 };   // the pointer on the ground: x, z, strength
  src: { value: THREE.Vector4[] };
}

function makeGround(inf: Infection) {
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
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: inf.t, uKick: inf.kick, uSpread: inf.spread, uPtr: inf.ptr, uSrc: inf.src, uOrigin: inf.origin });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uKick, uSpread; uniform vec2 uOrigin; uniform vec3 uPtr; uniform vec4 uSrc[${MAX_SRC}];
        varying vec3 vWp;
        ${NOISE_GLSL}
        vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .103, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
        // distance to the nearest cell wall (F2 - F1): a web of filaments
        float web(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          float d1 = 8., d2 = 8.;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 b = vec2(x, y), r = b + h22(i + b) - f;
            float d = dot(r, r);
            d2 = min(d2, max(d1, d)); d1 = min(d1, d);
          }
          return sqrt(d2) - sqrt(d1);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 q = vWp.xz;
          vec2 qw = q + (vec2(n2(q * .3), n2(q * .3 + 7.3)) - .5) * 3.2 + (vec2(n2(q * .9 + 3.), n2(q * .9 + 9.)) - .5) * 1.1;
          // thick strands and, up close, a finer net of hyphae; each fades out before it would shimmer
          float e1 = web(qw * .9);
          float a1 = fwidth(e1);
          float strand = (1. - smoothstep(0., .045 + a1 * .8, e1)) * mix(1., .35, smoothstep(.15, .9, a1));
          float hypha = 0.;
          if (a1 < .2) {
            float e2 = web(qw * 2.6 + 4.1), a2 = fwidth(e2);
            hypha = (1. - smoothstep(0., .03 + a2, e2)) * smoothstep(.4, .1, a2) * .5;
          }
          float net = max(strand, hypha) * (.3 + .7 * smoothstep(.3, .7, n2(q * .5 + 3.)));
          // energy pools around the mushrooms' feet
          float feed = 0.;
          for (int k = 0; k < ${MAX_SRC}; k++) { vec2 dv = q - uSrc[k].xy; feed += uSrc[k].w * exp(-dot(dv, dv) / (uSrc[k].z * uSrc[k].z)); }
          float d0 = length(q - uOrigin);
          // a slow pulse leaves the trumpets every four beats and washes diagonally across the grove,
          // its front bent and frayed by the moss
          float dw = d0 + (n2(q * .22 + 5.) - .5) * 4.;
          float wph = fract(uT * ${(BPM / 240).toFixed(4)} - dw * .09);
          float ring = smoothstep(.55, .95, wph) * smoothstep(1., .96, wph) * exp(-d0 * .04);
          // the infection spreading out when the scene loads: dark ahead of it, a bright front
          float lit = smoothstep(uSpread + .5, uSpread - 1.5, dw);
          float front = exp(-pow((dw - uSpread) * .7, 2.));
          vec2 pv = q - uPtr.xy;
          float touch = uPtr.z * exp(-dot(pv, pv) * .28);
          vec3 tint = mix(vec3(.05, .75, 1.), vec3(1., .12, .62), smoothstep(.4, .65, n2(q * .12 + 11.)));
          float energy = (.1 + feed * (1. + .3 * uKick) + 1.8 * ring) * lit + 3. * front + 4. * touch;
          totalEmissiveRadiance += tint * (net * energy + feed * lit * .04 + touch * .1 + front * .08);
        }`);
  };
  return new THREE.Mesh(g, mat);
}

/* ------------------------------------------------------------ atmosphere */

// Low-lying haze on top of the exponential fog: thickest at the ground, building with distance,
// so the forest's feet sink into violet mist and the layers of the grove separate.
function installHaze() {
  const C = THREE.ShaderChunk;
  if (C.fog_fragment.includes('vFogWorld')) return;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogWorld = (inverse(viewMatrix) * mvPosition).xyz;\n#endif';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogWorld;');
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float haze = exp( - max( vFogWorld.y + .15, 0. ) * 1.2 ) * ( 1. - exp( - vFogDepth * .06 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( .05, .026, .13 ), haze * .6 );
#endif`;
}

// Big, soft, out-of-focus motes drifting right in front of the lens.
function makeBokeh(count: number) {
  const rand = rng(515);
  const pos = new Float32Array(count * 3), sd = new Float32Array(count), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = -lerp(1.6, 4.5, rand());
    pos.set([(rand() - 0.5) * 2.4 * -z, (rand() - 0.5) * 1.3 * -z, z], i * 3);
    sd[i] = rand();
    const c = rand() > 0.55 ? MAGENTA : CYAN;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 100 }, uLit: { value: 0 } },
    vertexShader: `
      attribute float aSeed; attribute vec3 color; uniform float uT, uSize, uLit; varying float vA; varying vec3 vC;
      void main() {
        vec3 p = position;
        p.x += sin(uT * .11 + aSeed * 30.) * .25;
        p.y += sin(uT * .09 + aSeed * 17.) * .18 + mod(uT * .03 * (.5 + aSeed), 1.2) - .6;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.6 + fract(aSeed * 7.)) / -mv.z;
        vA = uLit * (.35 + .65 * (.5 + .5 * sin(uT * .6 + aSeed * 40.))) * (.4 + .6 * fract(aSeed * 13.));
        vC = color;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        float disc = smoothstep(1., .86, d);
        float a = disc * (.55 + .45 * smoothstep(.55, .92, d));   // brighter rim, like a lens's bokeh
        gl_FragColor = vec4(vC * a * vA * .05, 1.);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  return pts;
}

// Final grade, after tone mapping: lens fringing toward the corners, vignette, fine film grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 d = vUv - .5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * .014;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c *= mix(1., .6, smoothstep(.1, .55, r2 * 1.5));
      c += (h(vUv * uRes + fract(uT * 7.) * 91.) - .5) * .03;
      gl_FragColor = vec4(c, 1.);
    }`,
};

function figure(height: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x050409, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(height * 0.12, height * 0.55, 4, 10), mat);
  body.position.y = height * 0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(height * 0.1, 12, 10), mat);
  head.position.y = height * 0.86;
  head.rotation.x = -0.4;
  g.add(body, head);
  return g;
}

/* ---------------------------------------------------------------- start */

export interface GroveHandle { stop(): void }

type Placed<T> = { m: T; x: number; z: number; d: number };

export function start(canvas: HTMLCanvasElement, opts: { still: boolean; onFirstFrame?: () => void }): GroveHandle {
  const debug = (window as any).__groveDebug || {}; // screenshot/benchmark hook
  installHaze();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a0b36, 0.026);

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 400);
  scene.add(camera);

  // sky + environment reflections baked from it
  const sky = makeSky();
  scene.add(sky);
  {
    const envScene = new THREE.Scene();
    const envSky = makeSky();
    (envSky.material as THREE.ShaderMaterial).uniforms.uT.value = 10;
    envScene.add(envSky);
    // a hot-pink and a cyan panel so the glossy caps pick up the grove's colours
    const pink = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.15, 0.6), side: THREE.DoubleSide }));
    pink.position.set(-30, 14, -20); pink.lookAt(0, 0, 0);
    const cyan = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.9, 1.4), side: THREE.DoubleSide }));
    cyan.position.set(0, -12, 20); cyan.lookAt(0, 0, 0);
    envScene.add(pink, cyan);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0, 0.1, 400).texture;
    scene.environmentIntensity = 0.3;
    pmrem.dispose();
  }

  scene.add(new THREE.HemisphereLight(0x4a2a8a, 0x05030c, 0.5));
  const moonLight = new THREE.DirectionalLight(0xb4a8ff, 1.1);
  moonLight.position.set(0.5, 3, -10);
  scene.add(moonLight);
  const key = new THREE.DirectionalLight(0x9a6cff, 0.8);
  key.position.set(-6, 5, 7);
  scene.add(key);
  const rimLight = new THREE.DirectionalLight(0xff4fb0, 0.7);
  rimLight.position.set(6, 6, -8);
  scene.add(rimLight);

  const inf: Infection = {
    t: { value: 0 }, kick: { value: 0 }, spread: { value: 0 }, origin: { value: new THREE.Vector2() },
    ptr: { value: new THREE.Vector3(0, 0, 0) },
    src: { value: Array.from({ length: MAX_SRC }, () => new THREE.Vector4(0, 0, 1, 0)) },
  };
  const ground = makeGround(inf);
  scene.add(ground);
  if (debug.expose) (window as any).__groveScene = scene;
  const shadowMat = contactShadow();
  const shadow = (x: number, z: number, r: number) => {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(x, groundH(x, z) + 0.03, z);
    sh.scale.setScalar(r);
    scene.add(sh);
  };

  const pulse = { value: 1 };
  // the trumpet cluster's foot; the infection starts here, so its waves cross the view at an angle
  const TX = -4.1, TZ = -4.2;
  inf.origin.value.set(TX, TZ);
  const fromOrigin = (x: number, z: number) => Math.hypot(x - TX, z - TZ);

  /* the giant amanita: sculpted cap, raised warts, a hanging skirt, glowing gill plates */
  const amanitaDefs: (ShroomOpts & { x: number; y: number; z: number; s: number })[] = [
    { x: 0, y: -0.1, z: 0, s: 1, h: 3, r: 2, bend: 0.12, seed: 1, cap: 0x5c0a55, glow: CYAN.clone().multiplyScalar(0.5), detail: 1 },
    { x: 2.9, y: -0.1, z: -1.9, s: 0.8, h: 3.1, r: 1.4, bend: 0.3, seed: 3, cap: 0x6c1a8f, glow: MAGENTA.clone().multiplyScalar(0.4), detail: 0.7 },
    { x: -3.6, y: -0.05, z: 1.2, s: 0.5, h: 2.4, r: 1.6, bend: -0.28, seed: 2, cap: 0x4a1f9e, glow: CYAN.clone().multiplyScalar(0.4), detail: 0.6 },
    { x: 2.1, y: -0.05, z: 2.3, s: 0.3, h: 2, r: 1.7, bend: 0.1, seed: 4, cap: 0x9a2170, glow: CYAN.clone().multiplyScalar(0.4), detail: 0.45 },
    { x: -9, y: -0.3, z: -14, s: 1.1, h: 3, r: 1.8, bend: 0.22, seed: 6, cap: 0x3a1a6e, glow: CYAN.clone().multiplyScalar(0.3), detail: 0.15 },
    { x: 14, y: -0.4, z: -20, s: 1.4, h: 2.6, r: 2.1, bend: -0.3, seed: 7, cap: 0x4d1a70, glow: MAGENTA.clone().multiplyScalar(0.3), detail: 0.12 },
  ];
  const calm = { value: 1 }; // the amanitas' glow breathes slowly instead of following the kick
  // ?amanita=real swaps the grove's violet amanitas for lifelike scarlet fly agarics, for comparison
  const realAmanita = debug.real ?? new URLSearchParams(location.search).get('amanita') === 'real';
  const amanitas: Placed<THREE.Group>[] = amanitaDefs.map((d) => {
    const m = makeMushroom({ ...d, real: realAmanita }, calm);
    m.position.set(d.x, groundH(d.x, d.z) + d.y, d.z);
    m.scale.setScalar(d.s);
    m.rotation.y = d.seed * 1.7;
    scene.add(m);
    shadow(d.x, d.z, d.r * d.s * 1.3);
    return { m, x: d.x, z: d.z, d: fromOrigin(d.x, d.z) };
  });

  /* the IM30 trumpets: a towering cluster sprouting from one foot behind the giant, leaning apart */
  const trumpetDefs = [
    { x: TX, z: TZ, L: 3.1, s: 1.15, bend: 0.35, tilt: 0.05, dir: 0.4, seed: 11, detail: 1 },
    { x: TX + 1.1, z: TZ - 0.6, L: 2.1, s: 0.92, bend: 0.5, tilt: 0.14, dir: -0.3, seed: 12, detail: 0.85 },
    { x: TX - 0.9, z: TZ + 0.6, L: 1.2, s: 0.66, bend: 0.45, tilt: 0.2, dir: 2.9, seed: 13, detail: 0.7 },
    { x: TX + 0.7, z: TZ + 0.9, L: 0.4, s: 0.34, bend: 0.2, tilt: 0.1, dir: -0.9, seed: 14, detail: 0.45 },
  ];
  const trumpets: Placed<Trumpet>[] = trumpetDefs.map((d) => {
    const m = makeTrumpet({ seed: d.seed, stem: d.L, bend: d.bend, detail: d.detail });
    m.scale.setScalar(d.s);
    m.rotation.z = -d.tilt;
    const holder = new THREE.Group(); // turns the trumpet's lean (+x) toward `dir`
    holder.rotation.y = -d.dir;
    holder.position.set(d.x, groundH(d.x, d.z) - 0.02, d.z);
    m.position.y = d.L * d.s;           // the stem's foot sits on the ground
    holder.add(m);
    scene.add(holder);
    shadow(d.x, d.z, 1.1 * d.s);
    return { m, x: d.x, z: d.z, d: fromOrigin(d.x, d.z) };
  });

  /* the forest: the IM30 grove's caps, receding into the haze */
  const G = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
  const forestDefs: { x: number; z: number; s: number; kind: CapKind; cap: number; gill: THREE.Color; young?: number; detail?: number }[] = [
    { x: -6.2, z: -2.5, s: 0.85, kind: 'liberty', cap: 0x6a3aa0, gill: G(0.2, 0.9, 1), young: 2, detail: 0.7 },
    { x: 5.4, z: -3.5, s: 0.8, kind: 'parasol', cap: 0x8a2a6a, gill: G(0.2, 0.8, 1.1), young: 1, detail: 0.7 },
    { x: -2.9, z: 3.1, s: 0.3, kind: 'wavy', cap: 0x8a1a8a, gill: G(0.1, 0.8, 1.1), detail: 0.6 },
    { x: 3.4, z: 1.2, s: 0.32, kind: 'funnel', cap: 0x1a4aa0, gill: G(0.2, 1, 0.9), detail: 0.6 },
    { x: -9.5, z: -7, s: 1.2, kind: 'wavy', cap: 0x8a1a8a, gill: G(0.1, 0.8, 1.1), young: 2 },
    { x: 1.5, z: -9, s: 1.0, kind: 'funnel', cap: 0xb0206a, gill: G(0.2, 1, 1), young: 1 },
    { x: 7.5, z: -8, s: 1.3, kind: 'wavy', cap: 0x3a1a9a, gill: G(1, 0.35, 0.85), young: 1 },
    { x: -4.5, z: -11, s: 1.5, kind: 'liberty', cap: 0x7a2a9a, gill: G(1, 0.4, 0.9), young: 1 },
    { x: 11, z: -12, s: 1.7, kind: 'parasol', cap: 0x5a1a8a, gill: G(0.2, 0.9, 1) },
    { x: -15, z: -12, s: 1.8, kind: 'parasol', cap: 0x8a2a6a, gill: G(0.2, 0.8, 1.1), detail: 0.35 },
    { x: 4, z: -17, s: 1.9, kind: 'liberty', cap: 0x6a3aa0, gill: G(0.2, 0.9, 1), detail: 0.35 },
    { x: -20, z: -24, s: 2.6, kind: 'wavy', cap: 0x3a1a6e, gill: G(0.2, 0.8, 1.1), detail: 0.25 },
    { x: 22, z: -26, s: 2.8, kind: 'liberty', cap: 0x4d1a70, gill: G(1, 0.35, 0.85), detail: 0.25 },
  ];
  const rand = rng(909);
  const forest: Placed<ForestShroom>[] = [];
  forestDefs.forEach((d, i) => {
    const add = (m: ForestShroom, x: number, z: number, s: number) => {
      m.position.set(x, groundH(x, z) - 0.05, z);
      m.scale.setScalar(s);
      m.rotation.y = rand() * 6;
      scene.add(m);
      forest.push({ m, x, z, d: fromOrigin(x, z) });
    };
    const detail = d.detail ?? 0.5;
    add(makeForestShroom(d.kind, 300 + i, d.cap, d.gill, detail), d.x, d.z, d.s);
    // young ones clustered at its foot
    const kinds: CapKind[] = ['liberty', 'wavy', 'funnel', 'parasol'];
    for (let k = 0; k < (d.young ?? 0); k++) {
      const a = rand() * Math.PI * 2, dist = d.s * lerp(0.8, 1.4, rand());
      add(makeForestShroom(kinds[Math.floor(rand() * kinds.length)], 400 + i * 5 + k, d.cap, d.gill, detail * 0.6),
        d.x + Math.cos(a) * dist, d.z + Math.sin(a) * dist, d.s * lerp(0.28, 0.45, rand()));
    }
  });

  /* little purple mushrooms with red warts, huddled at the trumpets' foot and the giant's */
  const minis: Placed<THREE.Group>[] = [];
  [
    { x: TX - 1.4, z: TZ + 1.4, s: 0.3 }, { x: TX - 1.0, z: TZ + 1.8, s: 0.22 }, { x: TX - 1.8, z: TZ + 1.7, s: 0.17 },
    { x: TX + 1.6, z: TZ + 1.0, s: 0.24 }, { x: -1.9, z: 1.6, s: 0.2 }, { x: -1.5, z: 2.0, s: 0.15 },
    { x: 1.6, z: 1.7, s: 0.18 },
  ].forEach((d, i) => {
    const m = makeMushroom({
      h: 1.1, r: 1.25, bend: i % 2 ? 0.1 : -0.1, seed: 80 + i, cap: 0x7a3cc0,
      glow: CYAN.clone().multiplyScalar(0.9), detail: 0.5, wart: 0xff2a3c,
    }, pulse);
    m.scale.setScalar(d.s);
    m.position.set(d.x, groundH(d.x, d.z) - 0.02, d.z);
    m.rotation.y = i * 1.9;
    scene.add(m);
    minis.push({ m, x: d.x, z: d.z, d: fromOrigin(d.x, d.z) });
  });

  // the mycelium pools under the giant, the trumpets and the bigger mushrooms nearby
  const feet = [
    { x: 0, z: 0.1, r: 2.2, w: 0.9 },
    { x: TX, z: TZ, r: 2, w: 0.8 },
    ...amanitas.slice(1, 4).map((f) => ({ x: f.x, z: f.z, r: 1.2 * f.m.scale.x + 0.3, w: 0.5 })),
    ...forest.filter((f) => f.d < 14 && f.m.scale.x > 0.7).map((f) => ({ x: f.x, z: f.z, r: 0.9 * f.m.scale.x, w: 0.4 })),
  ].slice(0, MAX_SRC);
  feet.forEach((f, i) => inf.src.value[i].set(f.x, f.z, f.r, f.w));

  // the giant's gills and the trumpets' funnels light the grove
  const gillLight = new THREE.PointLight(CYAN, 4, 12, 2);
  gillLight.position.set(0.9, 1.4, 1.2);
  scene.add(gillLight);
  const magentaLight = new THREE.PointLight(MAGENTA, 2.5, 8, 2);
  magentaLight.position.set(2.9, 1.7, -1.9);
  scene.add(magentaLight);
  const trumpetLight = new THREE.PointLight(new THREE.Color(0.1, 0.55, 1), 4, 11, 2);
  trumpetLight.position.set(TX + 0.3, 3.2, TZ + 1.2);
  scene.add(trumpetLight);

  /* Psilocybe under the giant: a cubensis clump left of its stem, cyanescens to the right, a troop of liberty caps.
     On portrait screens that ground is behind the title, so they move up close to the lens instead. */
  const psiloDefs: { sp: Species; seed: number; n: number; s: number; ps: number; land: [number, number]; port: [number, number]; ry: number }[] = [
    { sp: 'cubensis', seed: 21, n: 6, s: 0.42, ps: 0.48, land: [-0.55, 3.5], port: [-0.75, 10.3], ry: 0.6 },
    { sp: 'cyanescens', seed: 5, n: 8, s: 0.3, ps: 0.36, land: [0.75, 2.9], port: [0.8, 9.4], ry: -0.4 },
    // liberty caps don't clump: a loose troop scattered through the moss
    { sp: 'semilanceata', seed: 33, n: 9, s: 0.26, ps: 0.14, land: [1.5, 1.3], port: [0.15, 11.6], ry: 0.3 },
  ];
  const psilos = psiloDefs.map((d) => {
    const c = makePsilocybeCluster(d.sp, d.seed, d.n, 0.9);
    c.group.rotation.y = d.ry;
    scene.add(c.group);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
    sh.rotation.x = -Math.PI / 2;
    scene.add(sh);
    const place = (portrait: boolean) => {
      const [x, z] = portrait ? d.port : d.land;
      const k = portrait ? d.ps : d.s;
      c.group.scale.setScalar(k);
      sh.scale.setScalar(k * 3);
      c.group.position.set(x, groundH(x, z) - 0.02, z);
      sh.position.set(x, groundH(x, z) + 0.03, z);
      // they're what a visitor sees first on a phone, so the infection reaches them early wherever they stand
      c.members.forEach((m) => (m.userData.d = Math.min(fromOrigin(x, z), 6)));
    };
    place(false);
    return { ...c, place };
  });

  const mycena = makeMycena(240, [
    ...amanitaDefs.slice(0, 4).map((d) => ({ x: d.x, z: d.z, r: 0.25 * d.r * d.s + 0.35 })),
    ...trumpetDefs.map((d) => ({ x: d.x, z: d.z, r: 0.5 * d.s + 0.3 })),
    ...psiloDefs.flatMap((d) => [d.land, d.port].map(([x, z]) => ({ x, z, r: 0.35 }))),
    ...forest.filter((f) => f.d < 8).map((f) => ({ x: f.x, z: f.z, r: 0.3 * f.m.scale.x + 0.3 })),
  ]);
  scene.add(mycena.group);

  const f1 = figure(0.62), f2 = figure(0.5);
  f1.position.set(-1.35, groundH(-1.35, 2.3), 2.3);
  f2.position.set(-0.95, groundH(-0.95, 2.55), 2.55);
  f1.rotation.y = 0.3; f2.rotation.y = -0.2;
  scene.add(f1, f2);

  const spores = makeSpores(260, new THREE.Vector3(18, 7, 12), new THREE.Vector3(-1, -0.2, 0), 7, 0.25);
  const moss = makeSpores(350, new THREE.Vector3(12, 0.25, 7), new THREE.Vector3(-0.5, -0.15, 1.2), 11, 0.0);
  scene.add(spores, moss);
  const bokeh = makeBokeh(14);
  camera.add(bokeh);

  const ufo = makeUfo();
  scene.add(ufo.group);

  // a big crescent moon, lit from behind and to the right
  const MOON_DIR = new THREE.Vector3();
  const moonRel = new THREE.Vector3(); // relative to where the camera is heading
  const sun = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const moon = makeMoon(sun);
  const MOON_DIST = 200, MOON_R = MOON_DIST * Math.tan(THREE.MathUtils.degToRad(4));
  function placeMoon(portrait: boolean) {
    // landscape: the clear sky between the planet and the giant; portrait: above the giant
    moonRel.set(portrait ? 0.105 : 0.15, portrait ? 0.36 : 0.3, -1).normalize();
  }
  let shift = -3, dist = 13, portrait = false;
  const planetRel = new THREE.Vector3(-0.13, 0.32, -1).normalize();
  function aimMoon(yaw: number) {
    MOON_DIR.copy(moonRel).applyAxisAngle(Y, -yaw);
    const pl = (sky.material as THREE.ShaderMaterial).uniforms.uPL.value as THREE.Vector3;
    if (portrait) pl.copy(planetRel).applyAxisAngle(Y, -yaw); else pl.copy(PLANET);
    // light from the viewer's right and slightly behind the moon: the same fat crescent in either layout
    const right = new THREE.Vector3(-MOON_DIR.z, 0, MOON_DIR.x).normalize();
    sun.copy(right).multiplyScalar(0.85).add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(MOON_DIR, 0.35).normalize();
  }
  placeMoon(false);
  aimMoon(0);
  moon.moon.scale.setScalar(MOON_R);
  moon.halo.scale.setScalar(MOON_R * 5);
  moon.moon.rotation.set(0.4, 0.8, 0.2);
  scene.add(moon.group);

  if (debug.specimen) {
    const c = makePsilocybeCluster(debug.specimen as Species, 5, debug.n ?? 6, 1);
    c.group.position.set(0, groundH(0, 7), 7);
    c.group.scale.setScalar(debug.ss ?? 0.3);
    scene.add(c.group);
  }

  // profiling hook: hide whole layers
  const skip: string[] = debug.skip || [];
  if (skip.includes('forest')) forest.forEach((f) => (f.m.visible = false));
  if (skip.includes('trumpets')) trumpets.forEach((f) => (f.m.visible = false));
  if (skip.includes('ground')) ground.visible = false;
  if (skip.includes('mycena')) mycena.group.visible = false;
  if (skip.includes('minis')) minis.forEach((f) => (f.m.visible = false));
  if (skip.includes('psilos')) psilos.forEach((c) => (c.group.visible = false));

  // post: bloom for the bioluminescence, then the grade
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.4, 0.78);
  if (!debug.noBloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  if (!debug.noGrade) composer.addPass(grade);

  /* sizing + adaptive quality */
  let pr = debug.pr ?? Math.min(window.devicePixelRatio || 1, 1.25) * 0.75;
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5), MIN_PR = 0.45;
  const sizedPoints: [THREE.ShaderMaterial, number][] = [
    [spores.material as THREE.ShaderMaterial, 55], [moss.material as THREE.ShaderMaterial, 30],
    [ufo.moteMat, 45], [bokeh.material as THREE.ShaderMaterial, 650],
    ...trumpets.flatMap((t) => t.m.userData.points.map((m) => [m, 34] as [THREE.ShaderMaterial, number])),
    ...amanitas.filter((a) => a.m.userData.spores).map((a) => [a.m.userData.spores, 36] as [THREE.ShaderMaterial, number]),
  ];
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    portrait = h > w;
    camera.aspect = w / h;
    camera.fov = portrait ? 46 : 31;
    camera.updateProjectionMatrix();
    shift = portrait ? -1.0 : -Math.min(2.9, 1.6 * (w / h));
    dist = portrait ? 16 : 11;
    placeMoon(portrait);
    psilos.forEach((c) => c.place(portrait));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    grade.uniforms.uRes.value.set(w * pr, h * pr);
    for (const [m, k] of sizedPoints) m.uniforms.uSize.value = k * pr * (h / 800);
  }

  // the pointer: parallax, and where it touches the ground the mycelium lights up
  let mx = 0, my = 0, tx = 0, ty = 0, over = 0;
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), floor = new THREE.Plane(Y, 0), hit = new THREE.Vector3();
  const touch = new THREE.Vector3(0, 0, 0), touchGoal = new THREE.Vector3(0, 0, 0);
  const onMove = (e: PointerEvent) => {
    tx = e.clientX / innerWidth - 0.5; ty = 0.5 - e.clientY / innerHeight;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    over = Math.abs(ndc.y) <= 1 ? 1 : 0;
  };
  addEventListener('pointermove', onMove, { passive: true });

  // warts light up one after another, a brief sparkle each
  const tw = new THREE.Color();
  function twinkle(m: THREE.Object3D, t: number) {
    const warts = m.userData.warts as THREE.InstancedMesh | undefined;
    if (!warts) return;
    for (let j = 0; j < warts.count; j++) {
      const k = 0.8 + 2.2 * Math.pow(Math.max(0, Math.sin(t * 0.7 + j * 2.39 + m.userData.seed)), 16);
      warts.setColorAt(j, tw.setScalar(k));
    }
    warts.instanceColor!.needsUpdate = true;
  }

  const t0 = performance.now();
  const target = new THREE.Vector3();
  let first = true, litAt = 0;
  function frame(now: number) {
    const t = debug.t ?? (opts.still ? 18 : (now - t0) / 1000 + 6);
    const kick = opts.still ? 0.3 : Math.exp(-(((t * BPM) / 60) % 1) * 5);
    mx += (tx - mx) * 0.03; my += (ty - my) * 0.03;

    // the infection spreads out from the giant once the scene has faded in
    if (first) litAt = now;
    const spread = debug.spread ?? (opts.still || debug.lit ? 999 : Math.max(0, (now - litAt) / 1000 - 0.7) * 7);
    const litOf = (d: number) => smooth(d - 0.5, d + 1.5, spread) + 0.9 * Math.exp(-Math.pow((spread - d) * 0.7, 2));

    // a slow orbit; on portrait screens it's small, so the clumps close to the lens stay in frame
    const ang = (portrait ? 0.05 : 0.2) * Math.sin(t * 0.06) + mx * (portrait ? 0.05 : 0.2);
    camera.position.set(Math.sin(ang) * dist, (portrait ? 1.4 : 1.9) + my * 0.4 + 0.15 * Math.sin(t * 0.08), Math.cos(ang) * dist);
    target.set(shift, (portrait ? 2.0 : 2.6) + my * 0.2 + 0.1 * Math.sin(t * 0.11), 0);
    if (debug.cam) { camera.position.fromArray(debug.cam[0]); target.fromArray(debug.cam[1]); }
    camera.lookAt(target);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    aimMoon(Math.atan2(target.x - camera.position.x, camera.position.z - target.z));
    moon.group.position.copy(camera.position).addScaledVector(MOON_DIR, MOON_DIST);
    moon.moon.rotation.y = 0.8 + t * 0.004;
    (sky.material as THREE.ShaderMaterial).uniforms.uT.value = t;

    fungiTime.value = t;
    fungiKick.value = kick;
    pulse.value = 0.75 + 0.45 * kick;
    calm.value = 0.95 + 0.25 * Math.sin(t * 0.8);
    trumpets.forEach(({ m, d }, i) => {
      const s = m.userData.seed;
      m.userData.lit.value = litOf(d);
      m.rotation.x = 0.012 * Math.sin(t * 0.43 + s * 1.1);
      m.rotation.y = 0.05 * Math.sin(t * 0.2 + i);
    });
    forest.forEach(({ m, d }) => {
      const s = m.userData.seed;
      m.userData.lit.value = litOf(d);
      m.rotation.z = 0.02 * Math.sin(t * 0.45 + s);
      m.rotation.x = 0.015 * Math.sin(t * 0.37 + s * 1.3);
      const br = 1 + 0.025 * Math.sin(t * 0.8 + s);
      m.userData.cap.scale.set(br, 1 / Math.sqrt(br), br);
    });
    amanitas.forEach(({ m, d }, i) => {
      const s = m.userData.seed as number;
      m.rotation.z = 0.03 * Math.sin(t * 0.55 + s * 2.3) + 0.01 * Math.sin(t * 1.3 + s);
      m.rotation.x = 0.02 * Math.sin(t * 0.43 + s * 1.1);
      const cap = m.userData.cap as THREE.Group;
      // the cap trails the stem's sway and breathes slowly; its margin rolls in the shader
      cap.rotation.x = 0.03 * Math.sin(t * 0.55 + s * 2.3 - 0.9);
      cap.rotation.y = 0.04 * Math.sin(t * 0.21 + s);
      const br = 1 + 0.02 * Math.sin(t * 0.5 + s * 2.3);
      cap.scale.set(br, 1 / Math.sqrt(br), br);
      twinkle(m, t);
      const gk = (i === 0 ? pulse.value * 1.15 : 0.6 + 0.3 * kick) * litOf(d);
      (m.userData.gills as THREE.MeshBasicMaterial).color.setScalar(gk);
      (m.userData.hub as THREE.MeshBasicMaterial).color.setScalar(gk);
    });
    psilos.forEach(({ members }) => members.forEach((m: Psilocybe, i) => {
      const s = m.userData.seed;
      const d = m.userData.d ?? 0;
      m.userData.lit.value = litOf(d);
      m.rotation.z = 0.025 * Math.sin(t * 0.5 + s * 1.3);
      m.rotation.x = 0.02 * Math.sin(t * 0.41 + s);
      const hop = i % 2 ? kick : Math.exp(-((((t * BPM) / 60 + 0.5) % 1) * 5));
      m.userData.cap.scale.set(1 + 0.03 * hop, 1 - 0.04 * hop, 1 + 0.03 * hop);
      m.userData.gills?.color.setScalar((0.8 + 0.5 * hop) * Math.min(1, litOf(d)));
    }));
    minis.forEach(({ m, d }) => {
      const s = m.userData.seed as number;
      // they bounce on the kick, alternating
      const hop = s % 2 ? kick : Math.exp(-((((t * BPM) / 60 + 0.5) % 1) * 5));
      (m.userData.cap as THREE.Object3D).scale.set(1 + 0.05 * hop, 1 - 0.07 * hop, 1 + 0.05 * hop);
      const gk = (0.85 + 0.5 * hop) * Math.min(1, litOf(d));
      (m.userData.gills as THREE.MeshBasicMaterial).color.setScalar(gk);
      (m.userData.hub as THREE.MeshBasicMaterial).color.setScalar(gk);
      twinkle(m, t);
    });
    gillLight.intensity = (3.5 + 2.5 * kick) * Math.min(litOf(amanitas[0].d), 1.5);
    magentaLight.intensity = 2.5 * Math.min(litOf(amanitas[1].d), 1.5);
    trumpetLight.intensity = (3.5 + 2 * kick) * Math.min(litOf(0), 1.5);
    mycena.update(t, kick, spread, inf.origin.value);
    ufo.update(t);
    for (const p of [spores, moss]) (p.material as THREE.ShaderMaterial).uniforms.uT.value = t;
    const bm = bokeh.material as THREE.ShaderMaterial;
    bm.uniforms.uT.value = t;
    bm.uniforms.uLit.value = Math.min(1, spread / 10);

    // pointer on the ground: follow it smoothly, fade in only while it's over the scene and hits nearby ground
    ray.setFromCamera(ndc, camera);
    const onGround = over && ray.ray.intersectPlane(floor, hit) && hit.distanceTo(camera.position) < 26;
    if (onGround) touchGoal.set(hit.x, hit.z, 1); else touchGoal.z = 0;
    touch.x += (touchGoal.x - touch.x) * 0.12; touch.y += (touchGoal.y - touch.y) * 0.12;
    touch.z += (touchGoal.z - touch.z) * 0.05;
    inf.ptr.value.copy(touch);
    inf.t.value = t; inf.kick.value = kick; inf.spread.value = spread;
    grade.uniforms.uT.value = t;

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
        (window as any).__groveFrame = avg;
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
