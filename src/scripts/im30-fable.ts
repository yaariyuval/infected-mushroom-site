// IM30 hero (Fable): the album cover as a living diorama.
// A funnel vortex swirling inside a lumpy, circuit-etched fungal arch, crowned by
// pink mushrooms with fluted cyan undersides, extruded IM30 letters floating in the
// light, two giant eyed claws gripping the ring, chains hauled by two white figures
// on a circuit-board floor, and a forest of dripping mushroom trees behind it all.
// Loaded lazily by MushroomScene.astro; start() returns { stop() }.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GroveHandle } from './grove';

const BPM = 145;
const TAU = Math.PI * 2;
const PORTAL = new THREE.Vector3(0, 3.3, 0);
const RING_R = 3.0, TUBE = 0.6;

const PINK = new THREE.Color(0xe0287e);
const AQUA = new THREE.Color(0x62f9fc);

/* ------------------------------------------------------------------ utils */

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
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
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

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float fbm3(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

function radialTexture(stops: [number, string][], size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) grd.addColorStop(k, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* -------------------------------------------------------------------- sky */

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec3 rd = normalize(vW - cameraPosition);
        float y = rd.y;
        // indigo dusk fading to near-black overhead, violet haze on the horizon
        vec3 c = mix(vec3(.02, .008, .07), vec3(.002, .001, .01), smoothstep(-.15, .6, y));
        c += vec3(.14, .03, .26) * exp(-abs(y + .02) * 9.) * .25;
        float az = atan(rd.x, rd.z);
        float neb = fbm(vec2(az * 2.2 + uT * .006, y * 4.5 + 2.));
        c += mix(vec3(.16, .04, .3), vec3(.03, .18, .35), n2(vec2(az * 1.5, y * 3.))) * pow(neb, 2.4) * smoothstep(-.05, .45, y) * .9;
        vec2 st = vec2(az, y) * 140.;
        vec2 id = floor(st), f = fract(st) - .5;
        float h = h21(id);
        c += vec3(.75, .85, 1.) * step(.985, h) * smoothstep(.12, 0., length(f)) * (.45 + .55 * sin(uT * 1.7 + h * 70.)) * smoothstep(.02, .3, y) * 1.5;
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.renderOrder = -2;
  return { mesh: m, mat };
}

/* ------------------------------------------------------------ circuit floor */

function makeFloor() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPortal: { value: PORTAL }, uKick: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT, uKick; uniform vec3 uPortal; varying vec3 vW;
      ${NOISE_GLSL}
      float ln(float d, float w, float aa) { return 1. - smoothstep(w - aa, w + aa, d); }
      void main() {
        vec2 P = vW.xz;
        // painterly board: deep blue with violet mottling and brush streaks
        float m1 = fbm(P * .22 + 3.);
        float streak = n2(vec2(P.x * .5 + P.y * .9, P.y * 3.));
        vec3 base = mix(vec3(.008, .01, .05), vec3(.035, .014, .1), m1);
        base = mix(base, vec3(.05, .09, .28), smoothstep(.55, .8, streak) * .6);
        base *= .8 + .45 * n2(P * 2.5);

        // big rectilinear traces: each 2.2u cell has a line along one axis at a random offset,
        // some end in a small ring node; a few of them carry a travelling pulse
        vec2 g = P / 2.2;
        vec2 id = floor(g), f = fract(g);
        float h = h21(id + 11.);
        vec2 aa2 = fwidth(g); float aa = max(aa2.x, aa2.y) * .9;
        float w = .022;
        float off = .2 + .6 * fract(h * 7.);
        float lines = 0., glow = 0.;
        if (h < .28) {
          float d = abs(f.y - off);
          lines = max(lines, ln(d, w, aa) * step(f.x, .35 + .65 * fract(h * 13.)));
          glow += pow(fract(g.x * .35 + h * 9. - uT * .22), 16.) * ln(d, w * 3., aa);
        } else if (h < .55) {
          float d = abs(f.x - off);
          lines = max(lines, ln(d, w, aa) * step(fract(h * 5.) * .6, f.y));
          glow += pow(fract(g.y * .35 + h * 9. - uT * .19), 16.) * ln(d, w * 3., aa);
        }
        if (fract(h * 31.) < .18) lines = max(lines, ln(abs(length(f - vec2(off, .5)) - .07), w, aa));
        float vis = smoothstep(30., 6., length(P - uPortal.xz)) * .5;
        vec3 col = base + vec3(.15, .75, 1.) * lines * vis * .4 + vec3(.5, 1.2, 1.5) * glow * vis * (.5 + .4 * uKick);

        // light spilling out of the portal, and its long shimmering reflection toward the camera
        vec2 rel = P - uPortal.xz;
        float spill = exp(-dot(rel * vec2(.2, .12), rel * vec2(.2, .12)));
        float refl = exp(-rel.x * rel.x * .12) * smoothstep(11., 1., rel.y) * step(0., rel.y) * (.6 + .4 * n2(vec2(rel.x * 3. + uT * .3, rel.y * 1.5 - uT * .6)));
        col += vec3(.05, .35, .8) * spill * .35 + vec3(.15, .6, 1.) * refl * .22;
        // distance: sink into the indigo haze
        col = mix(col, vec3(.05, .02, .13), 1. - exp(-length(vW - cameraPosition) * .028));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const g = new THREE.PlaneGeometry(160, 160, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  return { mesh, mat };
}

/* ----------------------------------------------------------- the fungal arch */

function makeArch(time: { value: number }, kick: { value: number }) {
  const geo = new THREE.TorusGeometry(RING_R, TUBE, 48, 220);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
  const deep = new THREE.Color(0x1a2a9e), mid = new THREE.Color(0x2f56d8), lit = new THREE.Color(0x4b8cf0), blot = new THREE.Color(0x121a72);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    const ang = Math.atan2(v.y, v.x);
    // bulbous lumps: big slow noise plus fine grain, thicker across the top where the mushrooms sit
    const big = noise3(v.x * 0.75 + 3, v.y * 0.75, v.z * 0.75) - 0.5;
    const fine = noise3(v.x * 3.5, v.y * 3.5, v.z * 3.5) - 0.5;
    const crown = smooth(0.2, 1, Math.sin(ang)) * 0.12;
    v.addScaledVector(nn, big * 0.5 + fine * 0.08 + crown);
    p.setXYZ(i, v.x, v.y, v.z);
    const spots = smooth(0.6, 0.68, noise3(v.x * 2.6 + 9, v.y * 2.6, v.z * 2.6));
    const light = smooth(-0.3, 0.6, nn.y) * 0.5 + 0.35 * noise3(v.x * 5, v.y * 5, v.z * 5);
    c.copy(deep).lerp(mid, light).lerp(lit, smooth(0.55, 0.9, light) * 0.6).lerp(blot, spots * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.05 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = time;
    sh.uniforms.uKick = kick;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRuv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT, uKick; varying vec2 vRuv;\n${NOISE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // etched circuitry: long rails around the ring, rungs between them, ring nodes,
          // all on the front/inner faces, with energy chasing around the arch
          vec2 q = vec2(vRuv.x * 72., vRuv.y * 9.);
          vec2 id = floor(q), f = fract(q);
          vec2 aa2 = fwidth(q); float aa = max(aa2.x, aa2.y) * .9;
          float run = h21(vec2(floor(id.x / 9.), id.y) + 5.);   // rails come in long runs
          float h = h21(id + 3.);
          float band = smoothstep(.0, .08, vRuv.y) * smoothstep(.5, .42, vRuv.y);
          float on = step(.62, run);
          float rail = (1. - smoothstep(.045 - aa, .045 + aa, abs(f.y - .5))) * on;
          // a rail steps to the neighbouring row now and then, and a rung joins two rails
          float rung = (1. - smoothstep(.05 - aa, .05 + aa, abs(f.x - .5))) * step(.86, h) * on;
          float node = (1. - smoothstep(.05 - aa, .05 + aa, abs(length((f - .5) * vec2(1., 1.)) - .2))) * step(.93, fract(h * 17.)) * on;
          float pad = (1. - smoothstep(.1 - aa, .1 + aa, max(abs(f.x - .5), abs(f.y - .5)))) * step(.9, fract(h * 29.)) * (1. - on);
          float lines = max(max(rail, rung), max(node, pad)) * band;
          float chase = pow(.5 + .5 * sin(vRuv.x * 40. - uT * 2.2 + id.y * 1.3), 12.);
          float glow = smoothstep(.12, .0, abs(f.y - .5)) * on * band * .12;
          totalEmissiveRadiance += vec3(.2, .85, 1.1) * (lines * (.5 + 1.5 * chase * (.6 + .5 * uKick)) + glow);
          // the light of the vortex bleeding onto the inner lip
          float inner = smoothstep(.32, .5, vRuv.y) * smoothstep(.72, .5, vRuv.y);
          totalEmissiveRadiance += vec3(.15, .5, .8) * inner * (.22 + .1 * uKick);
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(PORTAL);
  return mesh;
}

/* ------------------------------------------------------------- the vortex */

function makeVortex() {
  // a funnel: the swirl has real depth, so the camera drift gives it parallax
  const prof = [[2.62, 0.12], [2.5, -0.3], [2.2, -1.0], [1.7, -1.9], [1.1, -2.8], [0.55, -3.6], [0.001, -4.1]];
  const pts = prof.map(([r, z]) => new THREE.Vector2(r, z));
  const geo = new THREE.LatheGeometry(pts, 96);
  geo.rotateX(Math.PI / 2); // lathe axis y -> z: the mouth at z=+.12, the core at z=-4.1
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uKick: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uT, uKick; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float a = vUv.x;            // around
        float d = vUv.y;            // 0 at the mouth .. 1 at the core
        // spiral coordinates: the arms twist tighter as they fall in, and the whole thing turns
        float tw = a + d * 2.4 - uT * .05;
        vec2 ring = vec2(cos(tw * 6.2832), sin(tw * 6.2832));
        vec2 q = ring * (1.2 + d * 3.4);
        float n = fbm(q * 1.4 + vec2(uT * .1, -uT * .17));
        // spiral arms: a second, tighter twist, thresholded into bright filaments
        float tw2 = a + d * 3.6 - uT * .08;
        vec2 q2 = vec2(cos(tw2 * 6.2832), sin(tw2 * 6.2832)) * (1.5 + d * 5.);
        float fil = fbm3(q2 * 2.2 + vec2(-uT * .25, uT * .4));
        float n2v = n2(vec2(tw * 14., d * 9. - uT * 1.3));
        vec3 deep = vec3(.0, .05, .36), cyan = vec3(.06, .55, .95), pale = vec3(.55, .92, 1.02);
        vec3 col = mix(deep, cyan, smoothstep(.28, .78, n + .1 * d));
        col = mix(col, pale, smoothstep(.5, .9, fil) * .6 * (.3 + .7 * d));
        col += cyan * pow(n2v, 5.) * .3;
        // core: white-hot, breathing with the beat
        float core = smoothstep(.55, 1., d);
        col += pale * (core * core * .5 + core * .1) * (1. + .3 * uKick);
        // motes rushing inward
        vec2 sq = vec2(tw * 90., d * 40. - uT * 2.8);
        vec2 sid = floor(sq), sf = fract(sq) - .5;
        float sh = h21(sid + 2.);
        col += pale * step(.9, sh) * smoothstep(.2, 0., length(sf * vec2(1., .45))) * (.4 + .4 * d);
        // the lip, in the shadow of the arch
        col *= mix(.35, 1., smoothstep(0., .18, d));
        gl_FragColor = vec4(col, 1.);
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(PORTAL);

  // soft light spilling from the mouth
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(90,200,255,0.4)'], [0.3, 'rgba(40,140,255,0.16)'], [0.7, 'rgba(20,60,200,0.04)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  haze.position.copy(PORTAL).add(new THREE.Vector3(0, 0, 0.25));
  haze.renderOrder = 5;
  return { mesh, mat, haze };
}

/* ----------------------------------------------------------- IM30 letters */

// The Tektur glyphs, rasterised once and rebuilt as a merged set of extruded blocks:
// real 3D letters with depth and parallax, a few hundred triangles, no font parser.
function buildLetterGeometry(font: string) {
  const W = 640, H = 220, CELL = 5;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, W, H);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText('IM30', W / 2, H / 2 + 6);
  const px = g.getImageData(0, 0, W, H).data;
  const cols = W / CELL, rows = H / CELL;
  const filled = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const cx = x * CELL + (CELL >> 1), cy = y * CELL + (CELL >> 1);
    return px[(cy * W + cx) * 4 + 3] > 110;
  };
  // greedy rectangles: horizontal runs, extended downward while the run repeats exactly
  const used = new Uint8Array(cols * rows);
  const boxes: [number, number, number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (used[y * cols + x] || !filled(x, y)) continue;
    let x1 = x;
    while (x1 + 1 < cols && filled(x1 + 1, y) && !used[y * cols + x1 + 1]) x1++;
    let y1 = y;
    outer: while (y1 + 1 < rows) {
      for (let k = x; k <= x1; k++) if (!filled(k, y1 + 1) || used[(y1 + 1) * cols + k]) break outer;
      if (filled(x - 1, y1 + 1) !== filled(x - 1, y) || filled(x1 + 1, y1 + 1) !== filled(x1 + 1, y)) break;
      y1++;
    }
    for (let yy = y; yy <= y1; yy++) for (let k = x; k <= x1; k++) used[yy * cols + k] = 1;
    boxes.push([x, y, x1 - x + 1, y1 - y + 1]);
  }
  const scale = 6.2 / cols, depth = 0.4;
  const parts: THREE.BufferGeometry[] = [];
  const white = [1.2, 1.32, 1.4], side = [0.15, 0.55, 0.85];
  for (const [x, y, w, h] of boxes) {
    const b = new THREE.BoxGeometry(w * scale + 0.004, h * scale + 0.004, depth);
    b.translate((x + w / 2 - cols / 2) * scale, (rows / 2 - y - h / 2) * scale, 0);
    const nrm = b.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(nrm.count * 3);
    for (let i = 0; i < nrm.count; i++) col.set(Math.abs(nrm.getZ(i)) > 0.5 ? white : side, i * 3);
    b.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.deleteAttribute('uv');
    parts.push(b);
  }
  return mergeGeometries(parts, false)!;
}

function makeLetters() {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fallback = '800 150px "Arial Black", "Arial", sans-serif';
  const mesh = new THREE.Mesh(buildLetterGeometry(fallback), mat);
  // a dark, slightly larger echo behind the letters keeps them legible against the bright swirl
  const shadow = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x06123a, transparent: true, opacity: 0.55, depthWrite: false }));
  shadow.scale.set(1.06, 1.1, 1);
  shadow.position.set(0, 0, -0.3);
  const tektur = '800 150px "Tektur Variable"';
  document.fonts?.load(tektur).then((fs) => {
    if (!fs.length) return;
    const g = buildLetterGeometry(tektur);
    mesh.geometry.dispose();
    mesh.geometry = g;
    shadow.geometry = g;
  }).catch(() => {});
  const group = new THREE.Group();
  group.position.copy(PORTAL).add(new THREE.Vector3(0, -0.25, 0.75));
  group.add(mesh, shadow);
  // a soft cyan echo behind the letters, as if they were lit from within the tunnel
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3.4),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(120,220,255,0.3)'], [0.5, 'rgba(40,120,255,0.08)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.z = -0.6;
  group.add(glow);
  return { group, mesh, mat };
}

/* --------------------------------------------------------------- mushrooms */

function lathe(points: THREE.Vector2[], segs: number) {
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(points, segs);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  return g;
}

interface CapShroomOpts { r: number; h: number; seed: number; pink: THREE.Color; flutes: number; detail: number }

// The cover's big mushrooms are chanterelle-like: one continuous skin runs from the stem up
// through a glowing, fluted cyan underside, flares into a wavy pink trumpet rim, and closes
// over the top. Built as a single lathe with per-vertex colour and glow.
function makeCapShroom(o: CapShroomOpts, glow: { value: number }) {
  const { r, h, seed } = o;
  const segs = Math.round(lerp(56, 112, o.detail));
  const pn = (a: number, f: number, sd: number) => noise3(Math.cos(a) * f + sd * 7.3, Math.sin(a) * f, sd * 3.1) * 2 - 1;
  // profile bottom-to-top: stem, underside, rim, top. Third value tags the section (0 stem, 1 underside, 2 rim, 3 top)
  const prof: [number, number, number][] = [
    [0.22, -h, 0], [0.17, -h * 0.65, 0], [0.16, -h * 0.35, 0], [0.19, -h * 0.12, 0], [0.24, -0.06, 0],
    [0.34, -0.15, 1], [0.5, -0.23, 1], [0.68, -0.26, 1], [0.84, -0.22, 1], [0.95, -0.13, 1],
    [1.01, -0.04, 2], [1.03, 0.03, 2], [0.99, 0.08, 2],
    [0.9, 0.11, 3], [0.76, 0.17, 3], [0.6, 0.26, 3], [0.42, 0.36, 3], [0.22, 0.44, 3], [0.001, 0.47, 3],
  ];
  const pts = prof.map(([u, y]) => new THREE.Vector2(u * r, y * r));
  let geo: THREE.BufferGeometry = new THREE.LatheGeometry(pts, segs);
  // which profile row a vertex came from (the lathe lays vertices out row-major per segment)
  const rows = pts.length;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  const rowOf = new Float32Array(uvAttr.count);
  for (let i = 0; i < uvAttr.count; i++) rowOf[i] = uvAttr.getY(i) * (rows - 1);
  geo.setAttribute('aRow', new THREE.BufferAttribute(rowOf, 1));
  geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
  const rowA = geo.attributes.aRow as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), gl = new Float32Array(p.count * 3);
  const c = new THREE.Color(), g = new THREE.Color();
  const deep = o.pink.clone().multiplyScalar(0.45), light = o.pink.clone().offsetHSL(-0.01, 0.05, 0.07);
  const cyan = new THREE.Color(0.04, 0.62, 1.0), violet = new THREE.Color(0.25, 0.12, 1.0);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    const row = rowA.getX(i);
    const sec = prof[Math.round(row)][2];
    const a = Math.atan2(v.z, v.x), u = Math.hypot(v.x, v.z) / r;
    const under = smooth(4.5, 5.5, row) * smooth(10.2, 9.6, row);   // 1 on the underside
    const stem = 1 - smooth(4, 5, row);
    const top = smooth(12, 13, row);
    // decurrent ridges: crisp on the underside, fading down the stem, none on top
    const ridge = 0.5 + 0.5 * Math.sin(a * o.flutes + seed + 0.4 * Math.sin(a * 3 + u * 4));
    const ridgeAmp = (0.04 * under + 0.015 * stem * smooth(-h, -0.2, v.y / r)) * r;
    v.addScaledVector(nn, (ridge - 0.5) * ridgeAmp * 2);
    // an irregular trumpet: the flare's radius and height wander around the rim
    const flare = 1 + 0.09 * pn(a, 1.5, seed) * smooth(0.5, 1, u) + 0.03 * pn(a, 4, seed + 2) * smooth(0.7, 1, u);
    v.x *= flare; v.z *= flare;
    v.y += r * smooth(0.4, 1, u) * (0.09 * pn(a, 1.3, seed + 5) + 0.03 * pn(a, 3.7, seed + 9));
    v.y += (noise3(v.x / r * 2.5 + seed, v.y / r * 2.5, v.z / r * 2.5) - 0.5) * 0.05 * r * top;
    p.setXYZ(i, v.x, v.y, v.z);
    // colour + glow per section
    if (sec === 3 || sec === 2) {
      const mottle = noise3(v.x / r * 5 + seed, v.y / r * 5, v.z / r * 5);
      c.copy(deep).lerp(light, smooth(0.1, 0.95, u) * 0.8 + 0.3 * mottle - 0.1);
      // the thin margin is lit through from the cyan below
      g.setRGB(1, 0.45, 0.8).multiplyScalar(0.28 * smooth(0.72, 1.02, u) + 0.05);
      if (sec === 2) { c.copy(light).multiplyScalar(1.1); g.setRGB(0.9, 0.6, 1).multiplyScalar(0.35); }
    } else {
      const crest = ridge * ridge;
      const fall = lerp(1.0, 0.4, smooth(0.25, 1, u)) * (sec === 0 ? lerp(0.1, 1.2, smooth(-h, -0.1, v.y / r)) : 1);
      c.setRGB(0.02, 0.02, 0.05);
      // troughs deep blue, crests electric cyan, white-hot right by the stem
      g.setRGB(0.0, 0.08, 0.4).lerp(new THREE.Color(0.1, 0.75, 1.0), crest).lerp(new THREE.Color(0.75, 0.98, 1), crest * 0.5 * smooth(0.6, 0.15, u));
      g.lerp(violet, smooth(0.6, 1, u) * 0.4).multiplyScalar(fall);
    }
    col.set([c.r, c.g, c.b], i * 3);
    gl.set([g.r, g.g, g.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlowC', new THREE.BufferAttribute(gl, 3));
  geo.deleteAttribute('aRow');
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.45, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPulse = glow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlowC; varying vec3 vGlowC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowC = aGlowC;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse; varying vec3 vGlowC;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlowC * uPulse;');
  };
  mat.customProgramCacheKey = () => 'im30shroom';
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  group.userData.glow = glow;
  return group;
}

// small purple caps with red spots
function makeSpotShroom(r: number, seed: number) {
  const g = new THREE.Group();
  const rand = rng(seed);
  const capPts = [[0.001, 0.85], [0.3, 0.8], [0.58, 0.66], [0.82, 0.42], [0.96, 0.18], [1, 0.02], [0.92, -0.02], [0.8, 0.06], [0.5, 0.14], [0.22, 0.18]].map(([u, y]) => new THREE.Vector2(u * r, y * r));
  const capGeo = lathe([...capPts].reverse(), 40);
  {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const purple = new THREE.Color(0x8a3fd0), dark = new THREE.Color(0x4a1c8a), red = new THREE.Color(1.6, 0.12, 0.2), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const spot = smooth(0.57, 0.62, noise3(x / r * 3.2 + seed * 3, y / r * 3.2, z / r * 3.2));
      const under = y < 0.15 * r && Math.hypot(x, z) < 0.9 * r;
      c.copy(dark).lerp(purple, smooth(0, 0.6, y / r)).lerp(red, y > 0.1 * r ? spot : 0);
      if (under) c.setRGB(0.3, 0.9, 1.0).multiplyScalar(0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    capGeo.computeVertexNormals();
  }
  g.add(new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x7a30c8, emissiveIntensity: 0.9 })));
  const h = r * lerp(1.1, 1.6, rand());
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * r, 0.24 * r, h, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.42, 0.6) }));
  stem.position.y = -h / 2 + 0.06 * r;
  g.add(stem);
  return g;
}

function crownArch(parent: THREE.Object3D, glow: { value: number }, detail: number) {
  const up = new THREE.Vector3(0, 1, 0);
  const shrooms: THREE.Group[] = [];
  const big = [
    { a: 122, s: 0.78, r: 1.9, h: 0.9, tilt: -0.25, seed: 1 },
    { a: 100, s: 0.55, r: 1.5, h: 0.8, tilt: 0.1, seed: 2 },
    { a: 60, s: 0.9, r: 2.0, h: 1.0, tilt: 0.3, seed: 3 },
    { a: 40, s: 0.55, r: 1.6, h: 0.9, tilt: 0.55, seed: 4 },
    { a: 150, s: 0.5, r: 1.5, h: 0.8, tilt: -0.5, seed: 5 },
  ];
  for (const d of big) {
    const m = makeCapShroom({ r: d.r, h: d.h, seed: d.seed, pink: PINK.clone().offsetHSL((d.seed % 3) * 0.012 - 0.01, 0, 0), flutes: 34 + d.seed * 3, detail }, glow);
    const a = THREE.MathUtils.degToRad(d.a);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    m.position.copy(dir).multiplyScalar(RING_R + TUBE * 0.35).add(new THREE.Vector3(0, d.h * d.s, 0.25));
    m.quaternion.setFromUnitVectors(up, dir.clone().lerp(up, 0.5).normalize());
    m.rotateZ(d.tilt * 0.3);
    m.rotateY(d.seed * 1.3);
    m.scale.setScalar(d.s);
    m.userData.phase = d.seed * 1.7;
    parent.add(m);
    shrooms.push(m);
  }
  const small = [
    { a: 80, s: 0.62, z: 0.55 }, { a: 90, s: 0.45, z: 0.15 }, { a: 72, s: 0.4, z: 0.75 }, { a: 112, s: 0.55, z: 0.6 }, { a: 50, s: 0.48, z: 0.75 }, { a: 136, s: 0.45, z: 0.5 },
  ];
  small.forEach((d, i) => {
    const m = makeSpotShroom(d.s, 30 + i);
    const a = THREE.MathUtils.degToRad(d.a);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    m.position.copy(dir).multiplyScalar(RING_R + TUBE * 0.45).add(new THREE.Vector3(0, d.s * 1.2, d.z));
    m.quaternion.setFromUnitVectors(up, dir.clone().lerp(up, 0.6).normalize());
    m.rotateX(-0.25);
    parent.add(m);
  });
  return shrooms;
}

/* ----------------------------------------------------- roots in the arch */

function makeRoots() {
  const group = new THREE.Group();
  group.position.copy(PORTAL);
  const rand = rng(77);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a0 = THREE.MathUtils.degToRad(lerp(48, 132, i / 7) + (rand() - 0.5) * 8);
    const r0 = RING_R - TUBE * 0.3;
    const A = new THREE.Vector3(Math.cos(a0) * r0, Math.sin(a0) * r0, lerp(-0.1, 0.5, rand()));
    const drop = lerp(1.6, 3.6, rand());
    const sway = (rand() - 0.5) * 1.4, wob = (rand() - 0.5) * 0.8;
    const curve = new THREE.CatmullRomCurve3([
      A,
      A.clone().add(new THREE.Vector3(sway * 0.25 + wob * 0.4, -drop * 0.3, 0.05)),
      A.clone().add(new THREE.Vector3(sway * 0.6 - wob * 0.3, -drop * 0.6, 0.15)),
      A.clone().add(new THREE.Vector3(sway * 0.9 + wob * 0.5, -drop * 0.85, 0.1)),
      A.clone().add(new THREE.Vector3(sway * 1.1, -drop, 0.05)),
    ]);
    const tube = new THREE.TubeGeometry(curve, 40, lerp(0.035, 0.07, rand()), 7, false);
    // hang fraction + phase, for the sway in the vertex shader
    const uv = tube.attributes.uv as THREE.BufferAttribute;
    const hang = new Float32Array(uv.count * 2);
    const ph = rand() * 6;
    for (let k = 0; k < uv.count; k++) { hang[k * 2] = uv.getX(k); hang[k * 2 + 1] = ph; }
    tube.setAttribute('aHang', new THREE.BufferAttribute(hang, 2));
    tube.deleteAttribute('uv');
    geos.push(tube);
    // a bead of light at some tips
    void 0;
  }
  const geo = mergeGeometries(geos, false)!;
  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a1a48, roughness: 0.75, emissive: 0x4a0a30, emissiveIntensity: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aHang; uniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hg = aHang.x * aHang.x;
        transformed.x += hg * .18 * sin(uT * .9 + aHang.y);
        transformed.z += hg * .12 * sin(uT * .7 + aHang.y * 1.3);`);
  };
  group.add(new THREE.Mesh(geo, mat));
  return { group, time };
}

/* -------------------------------------------------------------- the claws */

// Flesh, painted eyes and claws. One material does all of it:
//  - fingers bend at two knuckles in the vertex shader (one mesh per finger, no bones);
//  - almond eyes are painted into the skin by the fragment shader: the iris slides with
//    the gaze, the almond closes for a blink, nothing sticks out of the flesh;
//  - the claw is the same tube, tapering into dark navy and going glossy.
interface SkinU {
  uEyes: { value: THREE.Vector4[] }; uGaze: { value: THREE.Vector2 }; uBlink: { value: number };
  uBend: { value: THREE.Vector2 }; uK: { value: THREE.Vector2 }; uLen: { value: number };
}
interface Eye { u: SkinU; mesh: THREE.Mesh; t: number; a: number; facing: number; phase: number; seed: number }

const FLESH = new THREE.Color(0.55, 0.04, 0.27), NAVY = new THREE.Color(0.04, 0.03, 0.11);
let skinCount = 0;

function makeSkin(len: number, knuckles: THREE.Vector2, eyeDefs: THREE.Vector4[]) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0,
    clearcoat: 0.3, clearcoatRoughness: 0.5,
  });
  const u: SkinU = {
    uEyes: { value: [eyeDefs[0] ?? new THREE.Vector4(), eyeDefs[1] ?? new THREE.Vector4()] },
    uGaze: { value: new THREE.Vector2() }, uBlink: { value: 0 },
    uBend: { value: new THREE.Vector2() }, uK: { value: knuckles }, uLen: { value: len },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uPortal: { value: PORTAL } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aT, aA, aR, aClaw;
        varying float vT, vA, vR, vClaw; varying vec3 vWp;
        uniform vec2 uBend, uK;
        mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
        float bw(float k, float x) { return smoothstep(k - .1, k + .1, x); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = rotY(uBend.y * bw(uK.y, position.x)) * objectNormal;
        objectNormal = rotY(uBend.x * bw(uK.x, position.x)) * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 p2 = vec3(uK.y, 0., 0.); transformed = p2 + rotY(uBend.y * bw(uK.y, position.x)) * (transformed - p2);
        vec3 p1 = vec3(uK.x, 0., 0.); transformed = p1 + rotY(uBend.x * bw(uK.x, position.x)) * (transformed - p1);
        vT = aT; vA = aA; vR = aR; vClaw = aClaw;
        vWp = (modelMatrix * vec4(transformed, 1.)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uEyes[2]; uniform vec2 uGaze; uniform float uBlink, uLen; uniform vec3 uPortal;
        varying float vT, vA, vR, vClaw; varying vec3 vWp;
        ${NOISE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // mottled, veined flesh; the shadow side sinks into violet
          float mot = fbm3(vec2(vT * 7., vA * 5.) + 3.);
          diffuseColor.rgb *= .78 + .45 * mot;
          vec3 toP = normalize(uPortal + vec3(0., 0., 1.5) - vWp);
          float facing = max(dot(normal, toP), 0.);
          float fres = pow(1. - max(dot(normal, normalize(vViewPosition)), 0.), 3.);
          float dist = length(uPortal - vWp);
          totalEmissiveRadiance += vec3(.08, .55, .85) * fres * (.4 + facing) * smoothstep(10., 4., dist) * 1.6 * (1.2 - vClaw);
          totalEmissiveRadiance += vec3(.12, .02, .2) * (1. - facing) * .5 * (1. - vClaw);
          totalEmissiveRadiance += vec3(.6, .05, .3) * fres * .35 * (1. - vClaw);
          totalEmissiveRadiance += vec3(.3, .02, .14) * .2 * (1. - vClaw);
          // blotchy pigment, darker in the creases
          float blot = smoothstep(.55, .75, fbm3(vec2(vT * 3.5, vA * 2.5) + 11.));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, .4, .8), blot * .6 * (1. - vClaw));
          roughnessFactor = mix(roughnessFactor, .2, vClaw);
          // eyes
          // (every term stays finite even for a switched-off slot: some drivers evaluate the
          //  masked-out iteration anyway and a NaN would leak through the mix)
          for (int i = 0; i < 2; i++) {
            vec4 e = uEyes[i];
            float on = step(.5, e.w);
            float da = vA - e.y; da -= floor(da + .5);
            vec2 p = vec2(da * 6.2832 * vR, (vT - e.x) * uLen) / max(e.z, 1e-3);
            float open = 1. - .94 * uBlink;
            float ay = .5 * open * pow(max(1. - p.x * p.x, 0.), .75);
            float inside = step(abs(p.y), ay) * step(abs(p.x), 1.) * on;
            float ay2 = .5 * open * pow(max(1. - p.x * p.x / 1.3, 0.), .75) + .09;
            float outline = step(abs(p.y), ay2) * step(abs(p.x), 1.14) * (1. - inside) * on;
            vec2 ic = p - uGaze * vec2(.4, .18);
            float ir = length(ic * vec2(1., 1.15));
            vec3 sclera = mix(vec3(.88, .98, 1.), vec3(.3, .55, 1.), smoothstep(.35, 1., abs(p.x)) * .9);
            vec3 iris = mix(vec3(.6, .9, 1.), vec3(.08, .3, .95), smoothstep(.12, .42, ir));
            iris *= .85 + .3 * n2(vec2(atan(ic.y, ic.x + 1e-4) * 6., ir * 12.));
            vec3 col = mix(sclera, iris, 1. - smoothstep(.4, .45, ir));
            col = mix(col, vec3(.2, .02, .1), 1. - smoothstep(.18, .22, ir));
            col += vec3(1.) * (1. - smoothstep(.04, .08, length(ic - vec2(-.12, .12)))) * .9;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.1, .015, .09), outline);
            diffuseColor.rgb = mix(diffuseColor.rgb, col * .7, inside);
            totalEmissiveRadiance = mix(totalEmissiveRadiance, col * .55, inside);
            totalEmissiveRadiance *= 1. - outline * .8;
            roughnessFactor = mix(roughnessFactor, .15, inside);
          }
        }`);
  };
  const key = 'im30skin' + skinCount++;
  mat.customProgramCacheKey = () => key;
  return { mat, u };
}

function fingerGeometry(len: number, rad: number, seed: number, K: THREE.Vector2) {
  const N = 60, M = 22;
  const pos: number[] = [], col: number[] = [], at: number[] = [], aa: number[] = [], ar: number[] = [], ac: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  const bump = (t: number, k: number, w: number) => Math.exp(-(((t - k) / w) ** 2));
  const kx = [K.x / len, K.y / len];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // fleshy tube: fat at the root, knuckle bulges with a crease over each, then the claw
    let r = rad * (1.12 - 0.4 * t);
    r *= 1 + 0.15 * bump(t, kx[0], 0.07) + 0.13 * bump(t, kx[1], 0.06) - 0.06 * bump(t, kx[0], 0.016) - 0.05 * bump(t, kx[1], 0.014);
    const claw = smooth(0.77, 0.85, t);
    const tip = Math.pow(Math.max(0, 1 - (t - 0.79) / 0.21), 1.3);
    r = lerp(r, rad * 0.62 * tip + 0.002, claw);
    for (let j = 0; j <= M; j++) {
      const a = j / M, th = a * TAU;
      const lump = (noise3(t * 6 + seed, Math.cos(th) * 1.6, Math.sin(th) * 1.6) - 0.5) * 0.14 * (1 - claw);
      const rr = r * (1 + lump);
      pos.push(t * len, rr * Math.sin(th), rr * Math.cos(th) * 0.86);
      c.copy(FLESH).multiplyScalar(0.9 + 0.25 * noise3(t * 9, a * 4, seed * 3)).lerp(NAVY, claw);
      col.push(c.r, c.g, c.b);
      at.push(t); aa.push(a); ar.push(r); ac.push(claw);
      if (i < N && j < M) { const v = i * (M + 1) + j; idx.push(v, v + 1, v + M + 1, v + 1, v + M + 2, v + M + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(aa, 1));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(ar, 1));
  g.setAttribute('aClaw', new THREE.Float32BufferAttribute(ac, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the normals point out of the tube
  const n = g.attributes.normal as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
  const k = Math.floor(N / 2) * (M + 1) + 2;
  if (n.getY(k) * p.getY(k) + n.getZ(k) * p.getZ(k) < 0) { const ix = g.getIndex()!; for (let q = 0; q < ix.count; q += 3) { const t = ix.getX(q + 1); ix.setX(q + 1, ix.getX(q + 2)); ix.setX(q + 2, t); } g.computeVertexNormals(); }
  return g;
}

// a lumpy, flesh-coloured blob (palm, knuckles, forearm) carrying the skin attributes
function fleshBlob(sx: number, sy: number, sz: number, seed: number, amp: number, freq: number, shade = 1, tendons: number[] = [], dir = 1) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  g.scale(sx, sy, sz);
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
  const col = new Float32Array(p.count * 3), at = new Float32Array(p.count), aa = new Float32Array(p.count), ar = new Float32Array(p.count), ac = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
    ar[i] = Math.hypot(v.x, v.z);
    let d = (noise3(v.x * freq + seed, v.y * freq, v.z * freq) - 0.5) * amp;
    // tendons: shallow ridges on the back of the hand, one running to each finger
    for (const ty of tendons) d += 1.4 * amp * Math.exp(-(((v.y - ty) / (0.14 * sy)) ** 2)) * smooth(0.1, 0.7, nn.z) * smooth(-0.1, 0.6, dir * v.x / sx);
    v.addScaledVector(nn, d);
    p.setXYZ(i, v.x, v.y, v.z);
    at[i] = uv.getY(i); aa[i] = uv.getX(i);
    c.copy(FLESH).multiplyScalar(shade * (0.85 + 0.3 * noise3(v.x * 2 + seed, v.y * 2, v.z * 2)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(at, 1));
  g.setAttribute('aA', new THREE.BufferAttribute(aa, 1));
  g.setAttribute('aR', new THREE.BufferAttribute(ar, 1));
  g.setAttribute('aClaw', new THREE.BufferAttribute(ac, 1));
  g.computeVertexNormals();
  return g;
}

function makeClaw(side: 1 | -1, scale: number, seed: number, eyes: Eye[]) {
  const rand = rng(seed);
  const hand = new THREE.Group();
  const NOK = new THREE.Vector2(0, 0);
  const plain = makeSkin(1, NOK, []);

  // the back of the hand: a broad mass, and the forearm running off-frame
  const palmDef = [new THREE.Vector4(0.42, 0.2, 0.3 * scale, 1)];
  const palmSkin = makeSkin(Math.PI * 1.85 * scale, NOK, palmDef);
  const palm = new THREE.Mesh(fleshBlob(1.35 * scale, 1.8 * scale, 0.42 * scale, seed, 0.2 * scale, 1.3, 1, [1.45, 0.75, 0.05, -0.65].map((y) => y * scale), -side), palmSkin.mat);
  palm.name = 'palm';
  palm.position.set(side * (RING_R + 2.15 * scale), -0.05 * scale, 0.25);
  palm.rotation.y = -side * 0.2; // its painted eyes (at u=.25, the sphere's +z) turn toward the camera
  palm.rotation.z = -side * 0.1;
  hand.add(palm);
  palmDef.forEach((d, i) => eyes.push({ u: palmSkin.u, mesh: palm, t: d.x, a: d.y, facing: 0, phase: seed + i * 2.1, seed: seed + i }));
  const armDir = new THREE.Vector3(side * 1.0, -1.0, -0.35).normalize();
  const arm = new THREE.Mesh(fleshBlob(0.95 * scale, 3.0 * scale, 0.7 * scale, seed + 7, 0.15 * scale, 1.2, 0.85), plain.mat);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDir);
  arm.position.copy(palm.position).addScaledVector(armDir, 3.3 * scale);
  hand.add(arm);

  const fingers: { u: SkinU; base: number; phase: number; speed: number }[] = [];
  const N = 4;
  const camA = side > 0 ? 0.5 : 0; // which side of the tube faces the camera once the root is turned
  for (let i = 0; i < N; i++) {
    const len = scale * lerp(2.7, 3.1, rand()) * (i === 0 ? 0.86 : i === N - 1 ? 0.84 : 1);
    const rad = scale * 0.35 * (i === N - 1 ? 0.82 : i === 0 ? 0.92 : 1);
    const K = new THREE.Vector2(len * 0.42, len * 0.7);
    const eyeDefs = [new THREE.Vector4(lerp(0.52, 0.6, rand()), camA + (rand() - 0.5) * 0.06, rad * lerp(0.8, 0.95, rand()), 1)];
    if (rand() > 0.35) eyeDefs.push(new THREE.Vector4(lerp(0.18, 0.28, rand()), camA + (rand() - 0.5) * 0.08, rad * 0.75, 1));
    const skin = makeSkin(len, K, eyeDefs);
    const root = new THREE.Group();
    root.position.set(side * (RING_R + 1.1 * scale), (1.5 - i) * 0.72 * scale - 0.05 * scale, 0.55 + 0.12 * (i % 2));
    root.rotation.y = side > 0 ? Math.PI : 0;               // point in toward the vortex
    root.rotation.z = -side * ((1.5 - i) * 0.09 + 0.08);     // fan, drooping a little
    root.rotation.x = (rand() - 0.5) * 0.2;
    hand.add(root);
    const finger = new THREE.Mesh(fingerGeometry(len, rad, seed + i, K), skin.mat);
    root.add(finger);
    // rounded root, buried in the back of the hand
    const cap = new THREE.Mesh(fleshBlob(rad * 1.0, rad * 1.14, rad * 0.98, seed + i * 3, rad * 0.15, 4), plain.mat);
    cap.position.x = rad * 0.05;
    root.add(cap);
    eyeDefs.forEach((d, k) => eyes.push({ u: skin.u, mesh: finger, t: d.x, a: d.y, facing: side > 0 ? -1 : 1, phase: seed * 0.7 + i * 1.9 + k, seed: seed + i * 5 + k }));
    fingers.push({ u: skin.u, base: 0.42 + rand() * 0.2, phase: rand() * 6, speed: lerp(0.45, 0.7, rand()) });
  }

  hand.position.copy(PORTAL);
  function update(t: number, kick: number) {
    fingers.forEach((f, i) => {
      // a slow grip that tightens on the beat
      const flex = f.base + 0.1 * Math.sin(t * f.speed + f.phase) + 0.06 * kick * Math.sin(t * 2.1 + f.phase + i);
      f.u.uBend.value.set(-side * flex * 0.45, -side * flex * 0.65);
    });
    hand.position.y = PORTAL.y + 0.05 * Math.sin(t * 0.5 + side);
  }
  return { group: hand, update };
}

/* -------------------------------------------------------- chains + figures */

function makeFigure() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, roughness: 0.7, emissive: 0xb8c4ee, emissiveIntensity: 1.0 });
  const cap = (r: number, l: number) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), suit);
  const body = new THREE.Group();
  g.add(body);
  // crouched, hauling a chain over one shoulder: torso bent low, one knee down
  const torso = cap(0.13, 0.3);
  torso.position.set(0, 0.5, 0.05);
  torso.rotation.x = 1.15;
  body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), suit);
  head.position.set(0, 0.6, 0.35);
  body.add(head);
  const limb = (x: number, y: number, z: number, rx: number, rz: number, l: number, r = 0.055) => { const m = cap(r, l); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); body.add(m); return m; };
  limb(0.12, 0.25, 0.28, 0.3, 0.1, 0.24);      // front shin (planted)
  limb(0.12, 0.42, 0.15, 1.5, 0, 0.26);        // front thigh
  limb(-0.14, 0.2, -0.05, 1.45, 0, 0.3);       // back thigh, knee down
  limb(-0.14, 0.08, -0.35, 1.5, 0, 0.3);       // back shin on the floor
  limb(0.16, 0.55, 0.3, 1.2, 0.2, 0.22);       // arms reaching to the chain
  limb(-0.12, 0.6, 0.25, 1.1, -0.25, 0.22);
  const hands = new THREE.Object3D();
  hands.position.set(0.02, 0.58, 0.5);
  g.add(hands);
  g.userData.hands = hands;
  g.userData.body = body;
  return g;
}

function makeChains(figures: THREE.Group[], anchors: { a: THREE.Vector3; fig: number }[]) {
  const LINK = 0.2;
  const linkGeo = new THREE.TorusGeometry(0.08, 0.024, 6, 14);
  linkGeo.scale(1.5, 1, 1);
  const counts = anchors.map((c) => {
    const end = new THREE.Vector3();
    figures[c.fig].userData.hands.getWorldPosition(end);
    return Math.ceil(c.a.distanceTo(end) / LINK) + 6;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  const mesh = new THREE.InstancedMesh(linkGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), total);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3(), p2 = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), col = new THREE.Color(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
  const P = (A: THREE.Vector3, Bv: THREE.Vector3, sag: number, wig: number, t: number, out: THREE.Vector3) =>
    out.copy(A).lerp(Bv, t).add(tmp.set(wig * Math.sin(t * 9) * t * (1 - t), -sag * 4 * t * (1 - t), 0));
  function update(t: number, kick: number) {
    let idx = 0;
    anchors.forEach((c, ci) => {
      figures[c.fig].userData.hands.getWorldPosition(B);
      const sag = 0.55 + 0.18 * Math.sin(t * 1.3 + ci * 1.7);
      const wig = 0.12 * Math.sin(t * 2.2 + ci * 2.1);
      const n = counts[ci];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        P(c.a, B, sag, wig, u, p);
        P(c.a, B, sag, wig, Math.min(1, u + 0.02), p2).sub(p).normalize();
        q.setFromUnitVectors(X, p2);
        q2.setFromAxisAngle(X, i % 2 ? Math.PI / 2 : 0);
        m.compose(p, q.multiply(q2), s);
        mesh.setMatrixAt(idx, m);
        // the links glow white near the portal, cooling to cyan by the figure, with energy pulsing out
        const wave = Math.pow(0.5 + 0.5 * Math.sin(u * 16 - t * 4.5 + ci), 8);
        col.setRGB(1.0, 1.15, 1.2).lerp(new THREE.Color(0.15, 0.8, 1.0), smooth(0.1, 0.8, u)).multiplyScalar(0.4 + 0.7 * wave + 0.25 * kick * (1 - u));
        mesh.setColorAt(idx, col);
        idx++;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }
  return { mesh, update };
}

/* ---------------------------------------------------- the mushroom forest */

function makeForest() {
  const rand = rng(909);
  const group = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x6a0a3a, emissiveIntensity: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2e1a70, roughness: 0.9, emissive: 0x100830 });
  // one cap geometry: wide, thin, gently wavy, magenta, brighter rim
  const capPts = [[0.001, 0.34], [0.3, 0.32], [0.6, 0.26], [0.85, 0.15], [1, 0.04], [1.03, -0.03], [0.94, -0.05], [0.5, 0.0], [0.15, 0.04]].map(([x, y]) => new THREE.Vector2(x, y));
  const capGeo = lathe([...capPts].reverse(), 44);
  {
    const p = capGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color(), deep = new THREE.Color(0x8a1454), pink = new THREE.Color(0xe0287e);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rho = Math.hypot(x, z), a = Math.atan2(z, x);
      p.setY(i, y + 0.04 * Math.sin(a * 5 + rho * 3) * rho + 0.02 * (noise3(x * 4, 0, z * 4) - 0.5));
      c.copy(deep).lerp(pink, smooth(0.2, 1, rho) * 0.7 + 0.3 * noise3(x * 6, y * 6, z * 6));
      if (y < 0.05) c.multiplyScalar(0.5);
      col.set([c.r, c.g, c.b], i * 3);
    }
    capGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    capGeo.computeVertexNormals();
  }
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.22, 1, 10, 10);
  trunkGeo.translate(0, 0.5, 0);
  const places: [number, number, number][] = [
    [-9.5, -4, 0.8], [-13.5, -12, 1.1], [-7.5, -16, 0.9], [-17, 0, 1.0], [-20, -7, 1.25],
    [10.5, -6, 0.85], [14.5, -13, 1.15], [6.5, -18, 0.95], [18, -2, 1.05], [21, -9, 1.25],
    [-1.5, -21, 1.05], [4, -26, 1.15], [-11, -23, 1.1], [12, -22, 1.05], [-24, -17, 1.3], [24, -18, 1.25],
    [-15, -28, 1.2], [17, -30, 1.2], [-28, -10, 1.3], [28, -12, 1.3],
  ];
  const caps = new THREE.InstancedMesh(capGeo, capMat, places.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, places.length);
  const drops: { x: number; y: number; z: number; r: number; ph: number }[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  places.forEach(([x, z, sz], i) => {
    const h = lerp(3.8, 6.2, rand()) * sz, cr = lerp(1.7, 2.7, rand()) * sz;
    const lean = (rand() - 0.5) * 0.25;
    e.set(lean, rand() * 6, (rand() - 0.5) * 0.25);
    q.setFromEuler(e);
    m.compose(pos.set(x, 0, z), q, scl.set(1, h, 1));
    trunks.setMatrixAt(i, m);
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(pos);
    e.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3);
    q.setFromEuler(e);
    m.compose(top, q, scl.set(cr, cr * 0.9, cr));
    caps.setMatrixAt(i, m);
    // glowing teardrops hanging from threads beneath the cap, in a few loose clusters
    const nc = 2 + Math.floor(rand() * 3);
    for (let c = 0; c < nc; c++) {
      const ca = rand() * TAU, crr = Math.sqrt(rand()) * cr * 0.7;
      const nd = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < nd; k++) {
        const a = rand() * TAU, rr = Math.sqrt(rand()) * cr * 0.3;
        drops.push({ x: top.x + Math.cos(ca) * crr + Math.cos(a) * rr, y: top.y - lerp(0.4, 1.8, rand()) * sz, z: top.z + Math.sin(ca) * crr + Math.sin(a) * rr, r: lerp(0.14, 0.32, rand()) * sz, ph: rand() * 6 });
      }
    }
  });
  const dropGeo = new THREE.SphereGeometry(1, 10, 10);
  {
    const p = dropGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = lerp(1, 0.25, smooth(0, 1, y)); p.setXYZ(i, p.getX(i) * 0.65 * k, y * 1.5, p.getZ(i) * 0.65 * k); }
  }
  const dropMesh = new THREE.InstancedMesh(dropGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.95, 1.2) }), drops.length);
  const threadPos: number[] = [];
  drops.forEach((d, i) => {
    m.makeScale(d.r, d.r, d.r).setPosition(d.x, d.y, d.z);
    dropMesh.setMatrixAt(i, m);
    threadPos.push(d.x, d.y + d.r, d.z, d.x, d.y + 1.7, d.z);
  });
  const threads = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(threadPos, 3)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(0.25, 0.7, 0.9), transparent: true, opacity: 0.4 }),
  );
  group.add(trunks, caps, dropMesh, threads);
  const tmpC = new THREE.Color();
  function update(t: number) {
    // the drops breathe, a few at a time
    for (let i = 0; i < drops.length; i += 1) {
      const k = 0.7 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.4 + drops[i].ph), 3);
      dropMesh.setColorAt(i, tmpC.setRGB(0.2 * k, 0.95 * k, 1.2 * k));
    }
    dropMesh.instanceColor!.needsUpdate = true;
  }
  return { group, update };
}

/* ----------------------------------------------------------- particles */

function makeInflow(count: number) {
  const seeds = new Float32Array(count);
  const rand = rng(31);
  for (let i = 0; i < count; i++) seeds[i] = rand();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 40 } },
    vertexShader: `
      attribute float aSeed; uniform float uT, uSize; varying float vA; varying vec3 vC;
      void main() {
        float s1 = fract(aSeed * 7.31), s2 = fract(aSeed * 13.7), s3 = fract(aSeed * 29.1);
        float k = fract(aSeed * 17.3 + uT * (.04 + .05 * s1));   // 0: far out .. 1: swallowed
        float a = aSeed * 60. + k * k * 7. * (s2 > .5 ? 1. : -1.) + uT * .05;
        float r = mix(${(RING_R * 3.2).toFixed(2)}, .15, pow(k, .8));
        vec3 p = vec3(cos(a) * r, sin(a) * r * .8 - .3, mix(3.5 + 5. * s3, -.5, pow(k, 1.6)));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.35 + s3) / -mv.z;
        vA = smoothstep(0., .2, k) * smoothstep(1., .9, k) * (.5 + .5 * sin(uT * 3. + aSeed * 40.));
        vC = mix(vec3(.5, 1.3, 1.6), vec3(1.4, .5, 1.1), step(.8, s2));
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vC * a * a * vA * 1.3, 1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.position.copy(PORTAL);
  return { pts, mat };
}

function makeSpores(count: number) {
  const rand = rng(5);
  const pos = new Float32Array(count * 3), sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 30; pos[i * 3 + 1] = rand() * 9; pos[i * 3 + 2] = (rand() - 0.5) * 22 - 2;
    sd[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 30 } },
    vertexShader: `
      attribute float aSeed; uniform float uT, uSize; varying float vA; varying vec3 vC;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uT * .12 * (.5 + fract(aSeed * 7.1)), 9.);
        p.x += sin(uT * .25 + aSeed * 6.) * .4; p.z += cos(uT * .2 + aSeed * 4.) * .4;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.4 + fract(aSeed * 13.)) / -mv.z;
        vA = (.3 + .7 * (.5 + .5 * sin(uT * 2. + aSeed * 40.))) * smoothstep(9., 7., p.y);
        vC = aSeed > .7 ? vec3(1.2, .3, .8) : vec3(.4, 1.1, 1.4);
      }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vC * a * a * vA, 1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  return { pts: new THREE.Points(g, mat), mat };
}

/* ------------------------------------------------------------------ start */

export function start(canvas: HTMLCanvasElement, opts: { still: boolean; onFirstFrame?: () => void }): GroveHandle {
  const debug = (window as any).__groveDebug || {}; // screenshot/benchmark hook: { pr, cam:[[x,y,z],[tx,ty,tz]], noBloom, t }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0424, 0.02);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

  const sky = makeSky();
  scene.add(sky.mesh);
  {
    // reflections for the glossy skin and caps: violet dome, a cyan blaze where the portal is
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x140a3a);
    const blaze = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.4, 1.8) }));
    blaze.position.set(0, 2, 14); blaze.lookAt(0, 0, 0);
    const pinkGlow = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.15, 0.6) }));
    pinkGlow.position.set(-8, 9, -6); pinkGlow.lookAt(0, 0, 0);
    env.add(blaze, pinkGlow);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.28;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0x5a3cc8, 0x08041a, 0.35));
  const rim = new THREE.DirectionalLight(0xff3fa0, 1.2);
  rim.position.set(-8, 10, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x7a6cff, 0.25);
  fill.position.set(5, 6, 12);
  scene.add(fill);
  // the vortex lights everything around it
  const portalLight = new THREE.PointLight(0x4fc8ff, 18, 20, 1.7);
  portalLight.position.copy(PORTAL).add(new THREE.Vector3(0, -0.3, 1.6));
  scene.add(portalLight);

  const floor = makeFloor();
  scene.add(floor.mesh);

  const time = { value: 0 }, kickU = { value: 0 }, glow = { value: 1 };
  const arch = makeArch(time, kickU);
  scene.add(arch);
  const isPhone = Math.min(screen.width, screen.height) < 500;
  const crown = crownArch(arch, glow, isPhone ? 0.5 : 1);
  const roots = makeRoots();
  scene.add(roots.group);
  const vortex = makeVortex();
  scene.add(vortex.mesh, vortex.haze);
  const letters = makeLetters();
  scene.add(letters.group);

  const eyes: Eye[] = [];
  const left = makeClaw(-1, 1.0, 3, eyes);
  const right = makeClaw(1, 1.3, 8, eyes);
  left.group.position.y -= 0.2;
  right.group.position.y -= 0.45;
  scene.add(left.group, right.group);

  const figs = [makeFigure(), makeFigure()];
  figs[0].position.set(1.6, 0, 4.4);
  figs[1].position.set(3.9, 0, 6.0);
  figs.forEach((f) => { f.rotation.y = Math.atan2(PORTAL.x - f.position.x, PORTAL.z - f.position.z); f.scale.setScalar(1.35); scene.add(f); f.updateMatrixWorld(true); });
  const chains = makeChains(figs, [
    { a: new THREE.Vector3(-0.9, PORTAL.y - 1.2, 0.6), fig: 0 },
    { a: new THREE.Vector3(0.5, PORTAL.y - 1.6, 0.7), fig: 0 },
    { a: new THREE.Vector3(1.5, PORTAL.y - 1.0, 0.6), fig: 1 },
  ]);
  scene.add(chains.mesh);

  const forest = makeForest();
  scene.add(forest.group);
  const inflow = makeInflow(isPhone ? 160 : 280);
  const spores = makeSpores(isPhone ? 120 : 220);
  scene.add(inflow.pts, spores.pts);
  if (debug.expose) { (window as any).__groveScene = scene; (window as any).__groveRenderer = renderer; (window as any).__groveCamera = camera; }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.9);
  if (!debug.noBloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* sizing + adaptive quality */
  let pr = debug.pr ?? Math.min(window.devicePixelRatio || 1, 1.25) * 0.75;
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5), MIN_PR = 0.45;
  let portrait = false;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    portrait = h > w;
    camera.aspect = w / h;
    camera.fov = portrait ? 58 : 35;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    inflow.mat.uniforms.uSize.value = 110 * pr * (h / 800);
    spores.mat.uniforms.uSize.value = 45 * pr * (h / 800);
  }

  /* pointer: parallax + the eyes */
  let mx = 0, my = 0, tx = 0, ty = 0, lastMove = -10;
  const onMove = (e: PointerEvent) => { tx = e.clientX / innerWidth - 0.5; ty = 0.5 - e.clientY / innerHeight; lastMove = performance.now() / 1000; };
  addEventListener('pointermove', onMove, { passive: true });
  const ray = new THREE.Raycaster(), look = new THREE.Vector3(), lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -5);
  const target = new THREE.Vector3(), tmpV = new THREE.Vector3(), eyeTmp = new THREE.Vector3();

  const t0 = performance.now();
  let first = true;
  function frame(now: number) {
    const t = opts.still ? 21 : debug.t ?? (now - t0) / 1000 + 5;
    const beat = ((t * BPM) / 60) % 1;
    const kick = opts.still ? 0.2 : Math.exp(-beat * 6);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;

    // camera: slow orbital drift plus pointer parallax; the portal sits right of centre on wide screens
    const ang = 0.11 * Math.sin(t * 0.06) + mx * 0.14;
    const dist = portrait ? 19 : 17.5;
    const shiftX = portrait ? 0 : -Math.min(4.2, 2.15 * camera.aspect);
    camera.position.set(Math.sin(ang) * dist + 0.6, (portrait ? 4.2 : 4.0) + my * 0.6 + 0.15 * Math.sin(t * 0.13), Math.cos(ang) * dist);
    target.set(shiftX, (portrait ? 0.9 : 3.35) + my * 0.25, 0);
    if (debug.cam) { camera.position.fromArray(debug.cam[0]); target.fromArray(debug.cam[1]); }
    camera.lookAt(target);
    sky.mesh.position.copy(camera.position);
    sky.mat.uniforms.uT.value = t;

    time.value = t;
    kickU.value = kick;
    glow.value = 0.8 + 0.4 * kick;
    vortex.mat.uniforms.uT.value = t;
    vortex.mat.uniforms.uKick.value = kick;
    (vortex.haze.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.15 * kick + 0.05 * Math.sin(t * 1.7);
    vortex.haze.scale.setScalar(1 + 0.04 * kick);
    letters.mat.color.setScalar(0.95 + 0.2 * kick);
    letters.group.position.y = PORTAL.y - 0.25 + 0.08 * Math.sin(t * 0.8);
    letters.group.rotation.y = 0.07 * Math.sin(t * 0.31);
    letters.group.rotation.x = 0.03 * Math.sin(t * 0.47);
    portalLight.intensity = 16 + 8 * kick;
    crown.forEach((m) => { m.rotation.z += 0.0008 * Math.sin(t * 0.7 + (m.userData.phase as number)); });
    roots.time.value = t;
    left.update(t, kick);
    right.update(t, kick);
    figs.forEach((f, i) => {
      const tug = Math.sin(t * 1.3 + i * 1.7);
      const body = f.userData.body as THREE.Group;
      body.rotation.x = -0.06 + 0.05 * tug;
      body.position.y = 0.02 * tug;
    });
    scene.updateMatrixWorld();
    chains.update(t, kick);
    forest.update(t);
    inflow.mat.uniforms.uT.value = t;
    spores.mat.uniforms.uT.value = t;
    floor.mat.uniforms.uT.value = t;
    floor.mat.uniforms.uKick.value = kick;

    // eyes: track the pointer while it moves, otherwise glance around; each blinks on its own clock
    ray.setFromCamera(tmpV.set(mx * 2, my * 2) as unknown as THREE.Vector2, camera);
    ray.ray.intersectPlane(lookPlane, look);
    const idle = smooth(1.5, 4, t - lastMove);
    eyes.forEach((e) => {
      const slot = Math.floor(t * 0.45 + e.phase);
      const jx = (hash(slot, e.seed * 7) - 0.5) * 7, jy = (hash(slot, e.seed * 11 + 3) - 0.5) * 4;
      tmpV.set(look.x + jx * idle + 0.3 * Math.sin(t * 0.7 + e.phase), look.y + jy * idle, look.z);
      e.mesh.worldToLocal(tmpV);
      // direction from the eye's spot on the skin, in the mesh's own frame
      if (e.facing === 0) tmpV.sub(eyeTmp.set(0, 0, 0)); else tmpV.sub(eyeTmp.set(e.t * e.u.uLen.value, 0, 0));
      tmpV.normalize();
      let gx: number, gy: number;
      if (e.facing === 0) { gx = tmpV.x; gy = -tmpV.y; }            // palm: sphere uv, +z faces out
      else { gx = e.facing * tmpV.y; gy = tmpV.x; }                  // finger tube: around, then along
      e.u.uGaze.value.x += (clamp(gx * 1.4, -1, 1) - e.u.uGaze.value.x) * 0.1;
      e.u.uGaze.value.y += (clamp(gy * 1.4, -1, 1) - e.u.uGaze.value.y) * 0.1;
      const bt = (t * 0.26 + e.phase * 0.37) % 1;
      e.u.uBlink.value = bt < 0.07 ? Math.sin((bt / 0.07) * Math.PI) : 0;
    });

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
