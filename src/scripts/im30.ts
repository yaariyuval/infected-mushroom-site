// IM30 hero: the album cover brought to life.
// A glowing vortex portal in a circuit-etched fungal arch, crowned with mushrooms,
// gripped by eyed magenta claws, chained to two small figures on a circuit-board floor,
// in a forest of mushroom trees dripping cyan light. Loaded lazily by MushroomScene.astro.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CYAN, lerp, smooth, rng, noise3, makeMushroom, makeSpores, withGlow, type GroveHandle } from './grove';

const BPM = 145;
const PINK = new THREE.Color(0xe0287e);
const AQUA = new THREE.Color(0x62f9fc);
const PORTAL = new THREE.Vector3(0, 2.5, 0);
const RING_R = 2.7, TUBE = 0.46;
const TURN = -0.62; // the portal faces down-left, as on the cover
const FACING = new THREE.Vector3(Math.sin(TURN), 0, Math.cos(TURN));
const ALONG = new THREE.Vector3(Math.cos(TURN), 0, -Math.sin(TURN));

/* --------------------------------------------------------------- shared glsl */

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

/* ------------------------------------------------------------ backdrop sky */

function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec3 rd = normalize(vW - cameraPosition);
        float y = rd.y;
        vec3 c = mix(vec3(.05, .02, .16), vec3(.004, .003, .02), smoothstep(-.1, .6, y));
        float neb = fbm(vec2(atan(rd.x, rd.z) * 2.5 + uT * .01, y * 5.));
        c += vec3(.12, .03, .25) * pow(neb, 2.5) * smoothstep(-.05, .4, y);
        vec2 st = vec2(atan(rd.x, rd.z), y) * 120.;
        float h = h21(floor(st));
        c += vec3(.7, .8, 1.) * step(.988, h) * smoothstep(.1, 0., length(fract(st) - .5)) * (.5 + .5 * sin(uT * 2. + h * 50.)) * smoothstep(.05, .3, y);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.renderOrder = -1;
  return m;
}

/* ------------------------------------------------------- circuit-board floor */

function makeFloor() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPortal: { value: PORTAL }, uSpill: { value: new THREE.Vector2(PORTAL.x + FACING.x * 1.8, PORTAL.z + FACING.z * 1.8) }, uPulse: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uT, uPulse; uniform vec3 uPortal; uniform vec2 uSpill; varying vec3 vW;
      ${NOISE_GLSL}
      float trace(float d, float w, float aa) { return 1. - smoothstep(w - aa, w + aa, d); }
      void main() {
        vec2 g = vW.xz * 1.1;
        vec2 id = floor(g), f = fract(g);
        float h = h21(id);
        vec2 aa2 = fwidth(g);
        float aa = max(aa2.x, aa2.y) * .8;
        float w = .03;
        float lines = 0., pulse = 0.;
        if (h > .62) { lines = max(lines, trace(abs(f.y - .5), w, aa)); pulse = max(pulse, pow(fract(g.x * .2 + h * 3. - uT * .35), 14.) * trace(abs(f.y - .5), w * 2.5, aa)); }
        if (fract(h * 7.1) > .7) { lines = max(lines, trace(abs(f.x - .5), w, aa)); pulse = max(pulse, pow(fract(g.y * .2 + h * 5. - uT * .3), 14.) * trace(abs(f.x - .5), w * 2.5, aa)); }
        float dn = length(f - .5);
        if (fract(h * 13.3) < .22) lines = max(lines, trace(abs(dn - .09), w * .9, aa));
        // painterly base: deep blue with violet mottling
        vec3 base = mix(vec3(.035, .04, .16), vec3(.09, .04, .22), fbm(vW.xz * .35));
        base *= .75 + .5 * n2(vW.xz * 3.);
        float fade = smoothstep(26., 4., length(vW.xz - uPortal.xz));
        vec3 col = base + vec3(.1, .6, .9) * lines * .38 * fade + vec3(.4, 1.1, 1.4) * pulse * fade * uPulse * .8;
        // light spilling out of the portal
        float d = length(vW.xz - uSpill);
        col += vec3(.1, .45, .8) * exp(-d * d * .08) * .9;
        // fog
        float dist = length(vW - cameraPosition);
        col = mix(col, vec3(.05, .025, .13), 1. - exp(-dist * .035));
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  mat.extensions = { derivatives: true } as any;
  const g = new THREE.PlaneGeometry(120, 120, 1, 1);
  g.rotateX(-Math.PI / 2);
  return { mesh: new THREE.Mesh(g, mat), mat };
}

/* ------------------------------------------------------------ the portal */

function makePortal() {
  const group = new THREE.Group();
  group.position.copy(PORTAL);

  // lumpy fungal arch, etched with glowing circuitry
  const ringGeo = new THREE.TorusGeometry(RING_R, TUBE, 40, 260);
  {
    const p = ringGeo.attributes.position as THREE.BufferAttribute;
    const n = ringGeo.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const v = new THREE.Vector3(), nn = new THREE.Vector3(), c = new THREE.Color();
    const deep = new THREE.Color(0x1d2a9a), light = new THREE.Color(0x3a5de0), blot = new THREE.Color(0x14186a);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i);
      const k = noise3(v.x * 1.3, v.y * 1.3, v.z * 1.3);
      v.addScaledVector(nn, (k - 0.5) * 0.28 + (noise3(v.x * 4, v.y * 4, v.z * 4) - 0.5) * 0.06);
      p.setXYZ(i, v.x, v.y, v.z);
      const spots = smooth(0.62, 0.7, noise3(v.x * 3.2 + 9, v.y * 3.2, v.z * 3.2));
      c.copy(deep).lerp(light, smooth(-0.2, 0.5, nn.y) * 0.6 + 0.2 * noise3(v.x * 6, v.y * 6, v.z * 6)).lerp(blot, spots * 0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    ringGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ringGeo.computeVertexNormals();
  }
  const pulse = { value: 1 }, time = { value: 0 };
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.05 });
  ringMat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = time;
    sh.uniforms.uPulse = pulse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRingUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRingUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT; uniform float uPulse; varying vec2 vRingUv;\n${NOISE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // ladder-like circuit traces running around the arch, with nodes and travelling pulses
          vec2 q = vec2(vRingUv.x * 90., vRingUv.y * 10.);
          vec2 id = floor(q), f = fract(q);
          float h = h21(id + 3.);
          vec2 aa2 = fwidth(q); float aa = max(aa2.x, aa2.y);
          float front = smoothstep(.05, .18, vRingUv.y) * smoothstep(.45, .32, vRingUv.y);
          float rail = 1. - smoothstep(.06 - aa, .06 + aa, abs(f.y - .5));
          float rung = (1. - smoothstep(.07 - aa, .07 + aa, abs(f.x - .5))) * step(.55, h) * step(abs(f.y - .5), .5);
          float node = (1. - smoothstep(.1 - aa, .1 + aa, abs(length((f - .5) * vec2(1., 1.)) - .22))) * step(.82, h);
          float on = step(.4, fract(h * 7.3));
          float lines = max(max(rail * on, rung), node) * front;
          float travel = pow(fract(vRingUv.x * 6. - uT * .25 + h * .2), 10.);
          totalEmissiveRadiance += vec3(.15, .85, 1.1) * lines * (.4 + 1.3 * travel * uPulse);
        }`);
  };
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  // the vortex
  const vortexMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uKick: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uT, uKick; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vUv - .5;
        float r = length(p) * 2.;
        float a = atan(p.y, p.x);
        float depth = .22 / (r + .06);
        float sw = a / 6.2832;
        float n = fbm(vec2(sw * 5. + depth * 1.2 - uT * .12, depth * 2.2 - uT * .9));
        float n2v = fbm(vec2(sw * 11. - uT * .2, depth * 5. - uT * 1.6));
        vec3 col = mix(vec3(.01, .12, .42), vec3(.15, .7, 1.), smoothstep(.3, .8, n));
        col += vec3(.3, .85, 1.1) * pow(n2v, 3.) * .9;
        col += vec3(.3, .7, .95) * pow(max(1. - r, 0.), 3.5) * (.45 + .25 * uKick);
        // stars rushing out of the tunnel
        vec2 sq = vec2(sw * 60., depth * 6. - uT * 2.2);
        vec2 sid = floor(sq), sf = fract(sq) - .5;
        float sh = h21(sid);
        col += vec3(.9, 1.3, 1.5) * step(.8, sh) * smoothstep(.2, 0., length(sf * vec2(1., .35))) * smoothstep(.05, .4, r);
        col *= smoothstep(1., .9, r);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const vortex = new THREE.Mesh(new THREE.CircleGeometry(RING_R - TUBE * 0.2, 128), vortexMat);
  vortex.position.z = -0.05;
  group.add(vortex);

  // IM30, hovering in the light (Tektur, drawn once the font is ready)
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.font = '900 330px "Tektur Variable", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(10,40,120,0.9)';
    g.shadowBlur = 24;
    g.fillStyle = '#ffffff';
    g.fillText('IM30', 512, 270);
    g.shadowBlur = 0;
    g.fillText('IM30', 512, 270);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('900 330px "Tektur Variable"').then(draw).catch(() => {});
  const letters: THREE.Mesh[] = [];
  for (let i = 0; i < 1; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 2.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(i === 0 ? 1.6 : 0.5), opacity: i === 0 ? 1 : 0.35, blending: i === 0 ? THREE.NormalBlending : THREE.AdditiveBlending }),
    );
    m.position.set(0, -0.15, 0.25 - i * 0.28);
    if (i) (m.material as THREE.MeshBasicMaterial).color.setRGB(0.3, 0.9, 1.1);
    letters.push(m);
    group.add(m);
  }

  const light = new THREE.PointLight(0x7fe8ff, 14, 18, 1.6);
  light.position.set(0, -0.3, 1.4);
  group.add(light);

  function update(t: number, kick: number) {
    time.value = t;
    pulse.value = 0.7 + 0.6 * kick;
    vortexMat.uniforms.uT.value = t;
    vortexMat.uniforms.uKick.value = kick;
    letters.forEach((m, i) => {
      m.position.y = -0.15 + 0.07 * Math.sin(t * 0.9) - i * 0.015;
      m.rotation.y = 0.06 * Math.sin(t * 0.3);
    });
    (letters[0].material as THREE.MeshBasicMaterial).color.setRGB(0.82, 0.97, 1).multiplyScalar(0.62 + 0.12 * kick + 0.03 * Math.sin(t * 23));
    light.intensity = 11 + 6 * kick;
  }
  return { group, update, ringMat };
}

/* ----------------------------------------------- mushrooms crowning the arch */

// The cover's big mushrooms are trumpets: a thick, glossy, wavy hot-pink cap and rim over a
// dark-blue fluted funnel streaked with cyan, running straight down into a glowing stem.
// Animated: the rim flutters, light pulses run up the flutes on the beat, spores stream off the rim.
const trumpetTime = { value: 0 }, trumpetKick = { value: 0 };

function makeTrumpet(seed: number) {
  const prof = [
    [0.2, -0.4], [0.2, 0], [0.22, 0.35], [0.28, 0.65], [0.42, 0.92], [0.66, 1.12], [0.98, 1.27], [1.3, 1.36],
    [1.55, 1.4], [1.7, 1.46], [1.74, 1.54], [1.66, 1.62], [1.45, 1.63], [1.1, 1.62], [0.7, 1.57], [0.3, 1.52], [0.001, 1.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const UNDER = 9;
  const geo = new THREE.LatheGeometry(prof, 144);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const glow = new Float32Array(p.count), col = new Float32Array(p.count * 3), height = new Float32Array(p.count), rim = new Float32Array(p.count);
  const rows = prof.length;
  const pn = (a: number, f: number, sd: number) => noise3(Math.cos(a) * f + sd * 7.3, Math.sin(a) * f, sd * 3.1) * 2 - 1;
  const c = new THREE.Color(), hot = new THREE.Color(1, 0.12, 0.5), pale = new THREE.Color(1, 0.55, 0.82), deepPink = new THREE.Color(0.6, 0.03, 0.3);
  const navy = new THREE.Color(0.005, 0.015, 0.16), streak = new THREE.Color(0.03, 0.3, 0.8);
  for (let i = 0; i < p.count; i++) {
    const row = i % rows;
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rho = Math.hypot(x, z), a = Math.atan2(z, x);
    const flare = 1 + 0.09 * pn(a, 1.4, seed) * smooth(0.5, 1.7, rho);
    x *= flare; z *= flare;
    y += smooth(0.9, 1.74, rho) * (0.16 * pn(a, 2.3, seed + 2) - 0.04);
    p.setXYZ(i, x, y, z);
    height[i] = THREE.MathUtils.clamp((y + 0.4) / 2, 0, 1);
    rim[i] = smooth(1.1, 1.74, rho);
    if (row < UNDER) {
      // thin cyan streaks on dark blue, brightening toward the throat of the funnel
      const s1 = Math.pow(0.5 + 0.5 * Math.sin(a * 34 + Math.sin(y * 3 + seed) * 1.5), 6);
      const s2 = Math.pow(0.5 + 0.5 * Math.sin(a * 71 + seed), 10) * 0.6;
      const throat = 1 - smooth(0.3, 1.35, rho);
      const k = Math.min(1, (s1 + s2) * (0.5 + 0.5 * throat) + throat * 0.35);
      glow[i] = k;
      c.copy(navy).lerp(streak, k * 0.7);
    } else {
      glow[i] = 0;
      // glossy hot pink: pale where the rim rolls over, deeper toward the centre, painterly mottling
      const roll = smooth(1.35, 1.74, rho) * (1 - smooth(1.6, 1.66, y));
      c.copy(deepPink).lerp(hot, smooth(0.1, 1.2, rho)).lerp(pale, roll * 0.75 + 0.15 * noise3(x * 2.5, y * 2.5, z * 2.5));
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
  geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.25,
    side: THREE.DoubleSide, envMapIntensity: 0.3,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = trumpetTime;
    sh.uniforms.uKick = trumpetKick;
    sh.uniforms.uSeed = { value: seed };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; attribute float aHeight; attribute float aRim;\nuniform float uT, uKick, uSeed;\nvarying float vGlow; varying float vHeight;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = aGlow; vHeight = aHeight;
        {
          // the rim flutters like soft tissue, and the whole cap breathes on the beat
          float ang = atan(transformed.z, transformed.x);
          transformed.y += aRim * (.07 * sin(ang * 5. + uT * 1.6 + uSeed) + .04 * sin(ang * 9. - uT * 2.3 + uSeed * 2.));
          transformed.xz *= 1. + aRim * .035 * uKick;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uT, uKick;\nvarying float vGlow; varying float vHeight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // light running up the flutes from the stem to the rim, one pulse per beat
          float run = pow(fract(vHeight * 1.3 - uT * 145. / 60. * .5), 5.);
          float under = step(.001, vGlow);
          totalEmissiveRadiance += vec3(.02, .4, 1.) * vGlow * (.55 + 1.2 * run + .25 * uKick) + vec3(0., .02, .14) * under + vec3(.16, 0., .07) * (1. - under);
        }`);
  };
  const m = new THREE.Mesh(geo, mat);

  // sparkles on the underside, and spores streaming off the rim
  const N = 90;
  const sp = new Float32Array(N * 3), sd = new Float32Array(N);
  for (let i = 0; i < N; i++) { sd[i] = Math.random(); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const sm = new THREE.ShaderMaterial({
    uniforms: { uT: trumpetTime, uSize: { value: 30 } },
    vertexShader: `
      attribute float aSeed; uniform float uT, uSize; varying float vA; varying float vKind;
      void main() {
        float a = aSeed * 6.2832 * 7.;
        vec3 p;
        if (aSeed < .45) {
          // sparkle clinging to the fluted underside
          float r = mix(.35, 1.45, fract(aSeed * 13.));
          p = vec3(cos(a) * r, mix(.55, 1.36, (r - .35) / 1.1) - .02, sin(a) * r);
          vA = pow(.5 + .5 * sin(uT * 3. + aSeed * 90.), 8.);
          vKind = 0.;
        } else {
          // spore drifting up off the rim
          float k = fract(aSeed * 5.3 + uT * (.08 + .05 * fract(aSeed * 3.1)));
          p = vec3(cos(a) * 1.7, 1.55, sin(a) * 1.7) * vec3(1. + k * .6, 1., 1. + k * .6) + vec3(0., k * 2.4, 0.);
          p.x += sin(uT * .7 + aSeed * 20.) * .2 * k;
          vA = smoothstep(0., .1, k) * smoothstep(1., .6, k);
          vKind = 1.;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (vKind > .5 ? 1. : .6) * (.5 + fract(aSeed * 17.)) / -mv.z;
      }`,
    fragmentShader: `varying float vA; varying float vKind;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d);
        vec3 c = vKind > .5 ? vec3(1., .5, .85) : vec3(.9, 1.2, 1.4);
        gl_FragColor = vec4(c * a * a * vA * 1.3, 1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const motes = new THREE.Points(sg, sm);
  motes.frustumCulled = false;

  const g = new THREE.Group();
  g.add(m, motes);
  g.userData.seed = seed;
  g.userData.cap = m;
  g.userData.motes = sm;
  return g;
}

function crownArch(parent: THREE.Group, pulse: { value: number }) {
  const up = new THREE.Vector3(0, 1, 0);
  const place = (m: THREE.Object3D, deg: number, lift: number, lean: number) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    m.position.copy(dir).multiplyScalar(RING_R + TUBE * lift).add(new THREE.Vector3(0, 0, 0.1));
    m.quaternion.setFromUnitVectors(up, dir.clone().lerp(up, lean).normalize());
    parent.add(m);
  };
  // big trumpets, like the cover: a large one top-left, others down the right side
  [
    { deg: 122, s: 0.95, lean: 0.55 }, { deg: 150, s: 0.6, lean: 0.25 },
    { deg: 62, s: 0.78, lean: 0.4 }, { deg: 40, s: 0.55, lean: 0.5 },
  ].forEach((d, i) => {
    const t = makeTrumpet(60 + i);
    t.scale.setScalar(d.s);
    place(t, d.deg, 0.45, d.lean);
  });
  // a cluster of little purple, red-spotted mushrooms along the crown
  [
    { deg: 98, s: 0.34 }, { deg: 88, s: 0.26 }, { deg: 80, s: 0.3 }, { deg: 106, s: 0.22 }, { deg: 72, s: 0.2 }, { deg: 92, s: 0.18 },
  ].forEach((d, i) => {
    const m = makeMushroom({
      h: 1.1, r: 1.25, bend: (i % 2 ? 0.1 : -0.1), seed: 80 + i, cap: 0x7a3cc0,
      glow: CYAN.clone().multiplyScalar(0.9), detail: 0.6, wart: 0xff2a3c,
    }, pulse);
    m.scale.setScalar(d.s);
    m.userData.seed = 80 + i;
    place(m, d.deg, 0.7, 0.6);
  });
}

/* ------------------------------------------------ roots dangling in the arch */

function makeRoots() {
  const group = new THREE.Group();
  group.position.copy(PORTAL);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b1238, roughness: 0.75, emissive: 0x2a0630, emissiveIntensity: 0.6 });
  const rand = rng(77);
  const strands: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a0 = THREE.MathUtils.degToRad(lerp(62, 118, i / 6) + (rand() - 0.5) * 6);
    const a1 = a0 + THREE.MathUtils.degToRad(lerp(-14, 14, rand()));
    const r = RING_R - TUBE * 0.7;
    const A = new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0.1);
    const B = new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0.1);
    const drop = lerp(1.0, 2.3, rand());
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const curve = new THREE.CatmullRomCurve3([
      A,
      A.clone().lerp(mid, 0.4).add(new THREE.Vector3(0, -drop * 0.6, 0.05)),
      mid.clone().add(new THREE.Vector3((rand() - 0.5) * 0.3, -drop, 0.12)),
      B.clone().lerp(mid, 0.4).add(new THREE.Vector3(0, -drop * 0.55, 0.05)),
      B,
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, lerp(0.018, 0.035, rand()), 6, false), mat);
    m.userData.phase = rand() * 6;
    strands.push(m);
    group.add(m);
  }
  function update(t: number) {
    strands.forEach((m) => { m.rotation.x = 0.06 * Math.sin(t * 0.7 + m.userData.phase); m.rotation.z = 0.015 * Math.sin(t * 0.5 + m.userData.phase); });
  }
  return { group, update };
}

/* -------------------------------------------------------- eyed magenta claws */

// Eyes are painted into the skin like on the cover: flat almond shapes drawn in a shader,
// so the iris can follow the pointer and the lids can blink.
interface Eye { mat: THREE.ShaderMaterial; phase: number; lid: number }

const EYE_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const EYE_FRAG = `
  // Flat, painted eye as on the IM30 cover: a pointed almond with a thin maroon outline and blue wedge tips,
  // a band of white around a big flat-blue iris that is wider than tall, a horizontal maroon pupil,
  // a white dot and a white dash for highlights. uBlink lowers the upper lid straight across the iris.
  uniform vec2 uLook; uniform float uBlink; uniform float uAspect; varying vec2 vUv;
  float aa(float d) { float w = fwidth(d) * .9 + 1e-4; return smoothstep(-w, w, d); }
  void main() {
    vec2 p = (vUv - .5) * 2.;
    float x2 = min(p.x * p.x, 1.);
    float lid = clamp(uBlink, 0., 1.);
    float up = .8 * pow(1. - x2, .8);
    float lo = .7 * pow(1. - x2, 1.) * mix(1., .55, lid);
    // the lowered upper lid is a nearly straight line, sagging slightly in the middle
    float upL = mix(up, min(up, mix(.62, .05, lid) - .1 * (1. - x2)), step(.001, lid));
    float edge = min(upL - p.y, p.y + lo);          // > 0 inside the eye
    float inside = aa(edge + .1);                   // including the outline
    if (inside <= 0.001) discard;
    float open = aa(edge);
    // iris: a wide oval that fills almost the full height; sleepy eyes show a wide band of it
    vec2 ic = vec2(uLook.x * .18, -.03 + uLook.y * .05);
    vec2 d = (p - ic) / vec2(mix(.5, .74, lid), mix(.56, .72, lid));
    float ir = length(d);
    float pr = length((p - ic) / vec2(.21, .22));
    vec3 outline = vec3(.36, .02, .13);
    vec3 col = vec3(.93, .95, 1.);                                                     // white
    col = mix(col, vec3(.72, .8, 1.), aa(.1 - (upL - p.y)) * .5);                     // shade under the upper lid
    col = mix(col, vec3(.21, .42, 1.), aa(1. - ir));                                   // flat blue iris
    col = mix(col, vec3(.44, .05, .16), aa(1. - pr));                                  // maroon pupil
    col = mix(col, vec3(.97), aa(1. - length((p - ic - vec2(-.23, .1)) / vec2(.045, .085))));  // dot highlight
    col = mix(col, vec3(.97), aa(1. - length((p - ic - vec2(.33, .14)) / vec2(.1, .035))));    // dash highlight
    // the white is a rounded oval; the almond's pointed ends beyond it are blue wedges
    float oval = length(p / vec2(.8, .78));
    col = mix(col, vec3(.2, .38, 1.), aa(oval - 1.));
    col = mix(outline, col, open);
    // colours above are authored in sRGB; the pipeline expects linear light
    gl_FragColor = vec4(pow(col, vec3(2.2)) * .98, inside);
  }`;

function makeEyeDecal(width: number, height: number, eyes: Eye[], rand: () => number, lid = 0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLook: { value: new THREE.Vector2() }, uBlink: { value: lid }, uAspect: { value: width / height } },
    vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  eyes.push({ mat, phase: rand() * 10, lid });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

// One tube along a curve; `profile(t)` scales the radius (0 at the root, 1 at the tip),
// `claw` is where the skin fades into a dark claw point (or null for a rounded fingertip).
function makeFinger(curve: THREE.CatmullRomCurve3, R: number, skin: THREE.Material, profile: (t: number) => number, claw: [number, number] | null) {
  const TS = 80, RS = 24;
  const geo = new THREE.TubeGeometry(curve, TS, R, RS, false);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), glow = new Float32Array(p.count);
  const center = new THREE.Vector3(), v = new THREE.Vector3();
  const skinC = new THREE.Color(0.95, 0.07, 0.45), shade = new THREE.Color(0.55, 0.03, 0.32), clawC = new THREE.Color(0.02, 0.02, 0.1);
  const c = new THREE.Color();
  for (let i = 0; i <= TS; i++) {
    const t = i / TS;
    curve.getPointAt(t, center);
    const k = profile(t);
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      v.fromBufferAttribute(p, idx).sub(center).multiplyScalar(k).add(center);
      p.setXYZ(idx, v.x, v.y, v.z);
      // painterly: darker toward the root, lighter along the length
      c.copy(shade).lerp(skinC, smooth(0, 0.35, t));
      const ck = claw ? smooth(claw[0], claw[1], t) : 0;
      c.lerp(clawC, ck);
      col.set([c.r, c.g, c.b], idx * 3);
      glow[idx] = 1 - ck;
    }
  }
  geo.computeVertexNormals();
  // painted shading: undersides fall into deep crease shadow where fingers press together,
  // with a few darker wrinkle bands across the knuckles
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= TS; i++) {
    const t = i / TS;
    const wrinkle = 1;
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      const ny = nrm.getY(idx);
      const k = (0.35 + 0.65 * smooth(-0.75, 0.35, ny)) * wrinkle;
      col[idx * 3] *= k; col[idx * 3 + 1] *= k; col[idx * 3 + 2] *= k * 1.05;
      glow[idx] *= k;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return new THREE.Mesh(geo, skin);
}

// An almond eye wrapped onto the finger's surface around curve position t, facing `toward`,
// so it hugs the skin instead of floating as a flat sticker.
function eyeOnFinger(curve: THREE.CatmullRomCurve3, t: number, R: number, profile: (t: number) => number, toward: THREE.Vector3, size: number, eyes: Eye[], rand: () => number, lid = 0, tilt = 0) {
  const len = curve.getLength();
  const r0 = R * profile(t);
  const w = r0 * 2.5 * size, h = Math.min(r0 * 1.4 * size, r0 * 1.75);
  const geo = new THREE.PlaneGeometry(w, h, 16, 8);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const P = new THREE.Vector3(), T = new THREE.Vector3(), out = new THREE.Vector3(), bi = new THREE.Vector3();
  // decide once which way along the finger is the eye's "right", so it isn't mirrored
  const T0 = curve.getTangentAt(t);
  const dir = T0.x > 0 ? -1 : 1;
  for (let i = 0; i < p.count; i++) {
    const u0 = p.getX(i), v0 = p.getY(i);
    const u = u0 * Math.cos(tilt) - v0 * Math.sin(tilt), v = u0 * Math.sin(tilt) + v0 * Math.cos(tilt);
    const ct = THREE.MathUtils.clamp(t + (dir * u) / len, 0, 1);
    curve.getPointAt(ct, P);
    curve.getTangentAt(ct, T);
    out.copy(toward).addScaledVector(T, -T.dot(toward)).normalize();
    bi.crossVectors(T, out).normalize();
    if (bi.y < 0) bi.negate();
    const r = R * profile(ct) * 1.03;
    const th = v / r;
    P.addScaledVector(out, Math.cos(th) * r).addScaledVector(bi, Math.sin(th) * r);
    p.setXYZ(i, P.x, P.y, P.z);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLook: { value: new THREE.Vector2() }, uBlink: { value: lid }, uAspect: { value: w / h } },
    vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
  });
  eyes.push({ mat, phase: rand() * 10, lid });
  return new THREE.Mesh(geo, mat);
}

function skinMaterial() {
  return withGlow(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.46, clearcoat: 0.4, clearcoatRoughness: 0.25,
    sheen: 0.6, sheenColor: new THREE.Color(1, 0.3, 0.7), sheenRoughness: 0.5, fog: false,
  }), new THREE.Color(0.22, 0, 0.1), { value: 1 });
}

type Flexer = { g: THREE.Group; phase: number; amp: number };

// Direction from the hands toward the default camera, in the portal rig's local space. Eyes are projected
// onto the fingers along this direction, so from the viewer they sit on the skin exactly as painted.
const EYE_TOWARD = new THREE.Vector3(-12.1, 3.9, 14.4).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -TURN);

type FingerOpts = {
  H: number;               // half-thickness (vertical)
  W: number;               // half-depth (toward / away from the viewer)
  n: number;               // cross-section squareness: 2 = ellipse, higher = rounded box
  profile: (t: number) => number;
  topFlat?: number;        // 0..1, keeps the top edge straight while the finger tapers (beak / talon)
  claw?: [number, number]; // where the skin fades to a dark claw point
};

function makeFingerMesh(curve: THREE.CatmullRomCurve3, o: FingerOpts, skin: THREE.Material) {
  const TS = 90, RS = 32;
  const pos = new Float32Array((TS + 1) * (RS + 1) * 3), col = new Float32Array((TS + 1) * (RS + 1) * 3), glow = new Float32Array((TS + 1) * (RS + 1));
  const C = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const skinC = new THREE.Color(0.6, 0.035, 0.24), shade = new THREE.Color(0.28, 0.015, 0.22), clawC = new THREE.Color(0.02, 0.02, 0.1), c = new THREE.Color();
  const e = 2 / o.n;
  for (let i = 0; i <= TS; i++) {
    const t = i / TS;
    curve.getPointAt(t, C);
    curve.getTangentAt(t, T);
    U.copy(Y).addScaledVector(T, -T.dot(Y)).normalize();
    S.crossVectors(T, U).normalize();
    const k = o.profile(t);
    const lift = (o.topFlat ?? 0) * o.H * (1 - k);
    const ck = o.claw ? smooth(o.claw[0], o.claw[1], t) : 0;
    for (let j = 0; j <= RS; j++) {
      const a = (j / RS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), e), y = Math.sign(sa) * Math.pow(Math.abs(sa), e);
      const idx = i * (RS + 1) + j;
      pos[idx * 3] = C.x + S.x * x * o.W * k + U.x * (y * o.H * k + lift);
      pos[idx * 3 + 1] = C.y + S.y * x * o.W * k + U.y * (y * o.H * k + lift);
      pos[idx * 3 + 2] = C.z + S.z * x * o.W * k + U.z * (y * o.H * k + lift);
      c.copy(shade).lerp(skinC, smooth(0, 0.3, t)).lerp(clawC, ck);
      col.set([c.r, c.g, c.b], idx * 3);
      glow[idx] = 1 - ck;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < TS; i++) for (let j = 0; j < RS; j++) {
    const a = i * (RS + 1) + j, b = a + RS + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // weld the seam normals, then shade: undersides fall into shadow where the fingers press together
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const a = i * (RS + 1), b = a + RS;
    v.fromBufferAttribute(nrm, a).add(w.fromBufferAttribute(nrm, b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z);
    for (let j = 0; j <= RS; j++) {
      const q = a + j;
      const kk = 0.4 + 0.6 * smooth(-0.8, 0.3, nrm.getY(q));
      col[q * 3] *= kk; col[q * 3 + 1] *= kk; col[q * 3 + 2] *= kk * 1.05;
      glow[q] *= kk;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return new THREE.Mesh(geo, skin);
}

type EyeSpec = { d: number; w: number; asp: number; lid: number; tilt: number; up?: number };
const ray = new THREE.Raycaster();

// Paint an eye onto `mesh`: a grid facing EYE_TOWARD, centred on the finger at arc position t (shifted
// `up` finger-thicknesses across it), every vertex dropped onto the skin along the view direction.
function projectEye(mesh: THREE.Mesh, curve: THREE.CatmullRomCurve3, t: number, D: number, e: EyeSpec, eyes: Eye[], rand: () => number) {
  mesh.updateMatrixWorld(true);
  const toward = EYE_TOWARD, back = toward.clone().negate();
  const right = back.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const upS = toward.clone().cross(right).normalize();
  // eyes are painted level on screen (plus their own tilt), not along the finger's curl
  const along = right.clone();
  const upE = toward.clone().cross(along).normalize();
  const hitAt = (o: THREE.Vector3) => { ray.set(o.clone().addScaledVector(toward, 30), back); const h = ray.intersectObject(mesh, false)[0]; return h; };
  const centre0 = curve.getPointAt(t).clone().addScaledVector(upS, (e.up ?? 0) * D);
  const hc = hitAt(centre0);
  const centre = hc ? hc.point : centre0;
  const w = e.w * D, h = w / e.asp;
  const geo = new THREE.PlaneGeometry(w, h, 24, 10);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const ct = Math.cos(e.tilt), st = Math.sin(e.tilt);
  const o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const u0 = p.getX(i), v0 = p.getY(i);
    const u = u0 * ct - v0 * st, v = u0 * st + v0 * ct;
    o.copy(centre).addScaledVector(along, u).addScaledVector(upE, v);
    const hit = hitAt(o);
    if (hit && hit.face) o.copy(hit.point).addScaledVector(hit.face.normal, 0.012);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLook: { value: new THREE.Vector2() }, uBlink: { value: e.lid }, uAspect: { value: e.asp } },
    vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide,
  });
  eyes.push({ mat, phase: rand() * 10, lid: e.lid });
  return new THREE.Mesh(geo, mat);
}

// Arc-length position `dD` finger-thicknesses from reference position `refU` (negative = toward the root).
function uFrom(curve: THREE.CatmullRomCurve3, refU: number, dD: number, D: number) {
  return THREE.MathUtils.clamp(refU + (dD * D) / curve.getLength(), 0.02, 0.98);
}
function uExtreme(curve: THREE.CatmullRomCurve3, sign: 1 | -1) {
  let best = 0, bx = Infinity;
  for (let i = 0; i <= 200; i++) { const u = i / 200; const x = sign * curve.getPointAt(u).x; if (x < bx) { bx = x; best = u; } }
  return best;
}

// Left hand, from the cover: four heavy beak-like talons out of the dark to the left of the arch.
// Thick rounded base, straight top edge, the underside sweeping up into a sharp point; last third navy.
// Eyes on the thick base end (distances from the base, in finger thicknesses).
function makeTalons(scale: number, seed: number, eyes: Eye[]) {
  const rand = rng(seed);
  const group = new THREE.Group();
  group.position.copy(PORTAL);
  const skin = skinMaterial();
  const flex: Flexer[] = [];
  const rows: { base: [number, number]; tip: [number, number]; H: number; eye: EyeSpec | null }[] = [
    { base: [-3.4, 2.4], tip: [-1.4, 1.1], H: 0.52, eye: { d: 0.3, w: 0.62, asp: 3.2, lid: 0.55, tilt: 1.35 } },
    { base: [-4.05, 1.15], tip: [-1.85, 0.05], H: 0.64, eye: { d: 0.55, w: 0.95, asp: 3.3, lid: 0.62, tilt: -0.2 } },
    { base: [-3.95, -0.15], tip: [-1.6, -0.75], H: 0.62, eye: { d: 0.6, w: 1.0, asp: 2.2, lid: 0, tilt: -0.05 } },
    { base: [-3.75, -1.4], tip: [-1.6, -1.7], H: 0.56, eye: null },
  ];
  rows.forEach((row, i) => {
    const H = row.H * scale, D = 2 * H;
    const [bx, by] = row.base.map((v) => v * scale);
    const [tx, ty] = row.tip.map((v) => v * scale);
    const z = 0.7 + (i % 2) * 0.1;
    const pts = [0, 0.33, 0.66, 1].map((k) => new THREE.Vector3(lerp(bx, tx, k), lerp(by, ty, k) + 0.08 * Math.sin(Math.PI * k) * scale, z + 0.12 * Math.sin(Math.PI * k) - (k === 0 ? 0.25 : 0)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    const profile = (t: number) => {
      const base = t < 0.1 ? Math.sqrt(t / 0.1) : 1;
      return Math.max(0.015, 1.02 - 0.98 * Math.pow(smooth(0.3, 1, t), 0.95)) * base;
    };
    const mesh = makeFingerMesh(curve, { H, W: H * 1.1, n: 2.8, profile, topFlat: 0.7, claw: [0.55, 0.63] }, skin);
    const g = new THREE.Group();
    g.add(mesh);
    if (row.eye) g.add(projectEye(mesh, curve, uFrom(curve, 0, row.eye.d, D), D, row.eye, eyes, rand));
    group.add(g);
    flex.push({ g, phase: rand() * 6, amp: 0.03 });
  });
  function update(t: number) {
    flex.forEach((f) => { f.g.rotation.z = -f.amp * (0.5 + 0.5 * Math.sin(t * 0.7 + f.phase)); });
  }
  return { group, update };
}

// Right hand: the painted fist cut straight out of the IM30 cover art (finger shapes, gaps and eyes exactly
// as painted), standing in front of the ring's right edge and always facing the camera. A vertex shader
// makes it feel alive: the fingers squeeze slowly (tips move most), the hand breathes and brightens on the beat.
function makePaintedFist(src: string) {
  const tex = new THREE.TextureLoader().load(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the texture is the painted fist (left 2/3) plus a painted continuation of the back of the hand
  // falling into shadow (right 1/3), so there is never a hard edge where the cover's frame cut it
  const PAINT = 1 / 1.5;
  const HGT = 4.9, WID = HGT * (1024 / 864), PWID = WID * PAINT;
  const geo = new THREE.PlaneGeometry(WID, HGT, 32, 32);
  const uniforms = { map: { value: tex }, uT: { value: 0 }, uKick: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uT, uKick; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float tip = max(1. - uv.x * 1.5, 0.);        // fingertips are on the left
        float fingerBand = sin(uv.y * 16.5);        // roughly one period per finger
        p.x += tip * tip * (.06 * sin(uT * .9 + uv.y * 3.) + .03 * fingerBand * sin(uT * 1.3));
        p.y += tip * .04 * sin(uT * .7 + uv.y * 5.);
        p *= 1. + .012 * uKick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uKick; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < .02) discard;
        // pre-compensate the scene's filmic tone mapping so the paint keeps the cover's colours
        vec3 lin = min(c.rgb * 1.02, vec3(.9)) * (1. + .05 * uKick);   // keep whites under the bloom threshold
        gl_FragColor = vec4(lin, c.a);
      }`,
    // the fist always sits in front of the portal; its lower knuckles dip below floor level, so it must not be
    // depth-tested against the ground (that clipped the thumb along a straight line)
    transparent: true, depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh, uniforms, WID, HGT, PWID };
}

/* ---------------------------------------------------- chains and figures */

function longShadow() {
  // dark at the feet, fading as it stretches away from the portal
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d')!;
  const lin = x.createLinearGradient(0, 0, 0, 256);
  lin.addColorStop(0, 'rgba(4,2,20,0.85)');
  lin.addColorStop(1, 'rgba(4,2,20,0)');
  x.fillStyle = lin;
  x.beginPath(); x.ellipse(32, 128, 26, 128, 0, 0, Math.PI * 2); x.fill();
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  const geo = new THREE.PlaneGeometry(0.4, 1.6);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.012, 0.7);
  return new THREE.Mesh(geo, mat);
}

function makeFigure() {
  // Like the cover: a pale, featureless mannequin figure, barefoot, leaning hard into a lunging stride
  // away from the portal, head bowed, both hands gripping the chain at the face and hauling it over the shoulder.
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x9aa0c8, envMapIntensity: 0.3 });
  const body = new THREE.Group();
  g.add(body);
  const Y = new THREE.Vector3(0, 1, 0);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // tapered limb between two joints, with a sphere at each end so the joints read smoothly
  const limb = (A: THREE.Vector3, B: THREE.Vector3, r0: number, r1: number) => {
    const len = A.distanceTo(B);
    const geo = new THREE.CylinderGeometry(r1, r0, len, 14, 1, true);
    const m = new THREE.Mesh(geo, skin);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
    body.add(m);
    for (const [P, r] of [[A, r0], [B, r1]] as [THREE.Vector3, number][]) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), skin);
      j.position.copy(P);
      body.add(j);
    }
  };
  const blob = (P: THREE.Vector3, sx: number, sy: number, sz: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
    m.position.copy(P); m.scale.set(sx, sy, sz); m.rotation.x = rx;
    body.add(m);
  };
  // deep crouch as on the cover: torso almost horizontal, head bowed low, front knee up,
  // back leg stretched out behind, both hands clutching the chain at the face
  const pelvis = V(0, 0.36, 0), chest = V(0, 0.5, 0.3), neck = V(0, 0.52, 0.4);
  blob(pelvis, 0.09, 0.075, 0.08);
  blob(V(0, 0.44, 0.15), 0.085, 0.075, 0.13, -0.2);                 // belly
  blob(chest, 0.11, 0.09, 0.12, -0.35);                             // chest, pitched forward
  limb(chest, neck, 0.045, 0.035);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin);
  head.scale.set(0.068, 0.085, 0.075);
  head.position.set(0, 0.5, 0.49);
  head.rotation.x = 1.2;                                             // bowed low
  body.add(head);
  // front leg: knee up and forward, foot planted
  limb(V(-0.065, 0.36, 0.03), V(-0.075, 0.27, 0.27), 0.05, 0.038);
  limb(V(-0.075, 0.27, 0.27), V(-0.075, 0.05, 0.2), 0.036, 0.026);
  limb(V(-0.075, 0.04, 0.18), V(-0.075, 0.02, 0.29), 0.028, 0.02);
  // back leg: stretched out behind, pushing off the toes
  limb(V(0.065, 0.36, -0.03), V(0.08, 0.2, -0.23), 0.05, 0.038);
  limb(V(0.08, 0.2, -0.23), V(0.08, 0.06, -0.48), 0.036, 0.026);
  limb(V(0.08, 0.055, -0.49), V(0.08, 0.015, -0.4), 0.026, 0.018);
  // arms: elbows tucked down, hands at the face
  const hand = V(0.0, 0.53, 0.52);
  limb(V(-0.1, 0.53, 0.3), V(-0.1, 0.42, 0.45), 0.034, 0.028);
  limb(V(-0.1, 0.42, 0.45), V(-0.025, 0.52, 0.52), 0.027, 0.022);
  limb(V(0.1, 0.53, 0.3), V(0.1, 0.43, 0.46), 0.034, 0.028);
  limb(V(0.1, 0.43, 0.46), V(0.025, 0.53, 0.51), 0.027, 0.022);
  blob(hand, 0.035, 0.03, 0.03);
  g.userData.hands = new THREE.Object3D();
  g.userData.hands.position.copy(hand);
  body.add(g.userData.hands);
  g.userData.body = body;
  // long shadow, cast away from the portal's glow
  g.add(longShadow());
  return g;
}

function makeChains(figures: THREE.Group[], rig: THREE.Object3D) {
  // Three chains per figure, as on the cover: each starts at the foot of the IM30 letters inside the portal,
  // glowing white there, sags down onto the floor and runs out to the figure's hands, fading to dark teal.
  const LINK = 0.24;
  const linkGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 18);
  linkGeo.scale(1.45, 1, 1);
  const letterFoot = (x: number) => new THREE.Vector3(PORTAL.x + x, PORTAL.y - 1.25, PORTAL.z + 0.15);
  const anchors = [
    { a: letterFoot(-1.75), fig: 0 }, { a: letterFoot(-1.15), fig: 0 }, { a: letterFoot(-0.5), fig: 0 },
    { a: letterFoot(0.25), fig: 1 }, { a: letterFoot(0.95), fig: 1 }, { a: letterFoot(1.6), fig: 1 },
  ];
  const counts = anchors.map((c) => {
    const end = new THREE.Vector3().copy(figures[c.fig].position);
    return Math.ceil(rig.localToWorld(c.a.clone()).distanceTo(end) * 1.35 / LINK) + 4;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.35, emissive: 0x05303a });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += max(vColor - .6, 0.) * vec3(1.1, 1.25, 1.35);\n#endif');
  };
  const mesh = new THREE.InstancedMesh(linkGeo, mat, total);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3(), nx = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), col = new THREE.Color();
  const teal = new THREE.Color(0.05, 0.3, 0.36), white = new THREE.Color(1.5, 1.6, 1.65);
  const C = new THREE.Vector3();
  // quadratic curve whose control point sits below the floor, clamped so the middle lies on the ground
  const P = (A: THREE.Vector3, B: THREE.Vector3, u: number, out: THREE.Vector3) => {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.set(A.x * a + C.x * b + B.x * c, A.y * a + C.y * b + B.y * c, A.z * a + C.z * b + B.z * c);
    out.y = Math.max(out.y, 0.05);
    return out;
  };
  function update(t: number, kick: number) {
    let idx = 0;
    anchors.forEach((c, ci) => {
      const B = new THREE.Vector3();
      figures[c.fig].userData.hands.getWorldPosition(B);
      const A = rig.localToWorld(c.a.clone());
      C.copy(A).lerp(B, 0.45);
      C.y = -1.6 - 0.25 * Math.sin(t * 1.1 + ci * 1.7);
      const n = counts[ci];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        P(A, B, u, p);
        P(A, B, Math.min(1, u + 0.01), nx).sub(p).normalize();
        q.setFromUnitVectors(X, nx);
        q2.setFromAxisAngle(X, i % 2 ? Math.PI / 2 : 0);
        m.compose(p, q.multiply(q2), s);
        mesh.setMatrixAt(idx, m);
        // white and glowing near the letters, fading to dark teal toward the figure; energy pulses outward
        const near = 1 - smooth(0.05, 0.5, u);
        const wave = Math.pow(0.5 + 0.5 * Math.sin(u * 14 - t * 5 + ci), 8) * (1 - near);
        col.copy(teal).lerp(white, near).addScalar(0.5 * wave + 0.15 * kick * near);
        mesh.setColorAt(idx, col);
        idx++;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }
  return { mesh, update };
}

/* ---------------------------------------- the forest of dripping mushroom trees */

type CapKind = 'amanita' | 'parasol' | 'wavy' | 'liberty' | 'funnel';

// Background mushroom: one lathe for the cap (top surface + gill underside) and one for the stem.
// The gills are drawn in the shader (cheap), the cap has a drifting thin-film rainbow sheen.
function makeBgShroom(kind: CapKind, seed: number, capC: THREE.ColorRepresentation, gillC: THREE.Color, time: { value: number }, kick: { value: number }) {
  const rand = rng(seed);
  const g = new THREE.Group();
  const r = kind === 'liberty' ? 0.75 : kind === 'parasol' ? 1.35 : 1.05;
  const H = kind === 'liberty' ? 2.6 : kind === 'parasol' ? 2.9 : lerp(1.9, 2.5, rand());
  const bend = (rand() - 0.5) * 0.5;
  // top profile y(u), u = rho / r in [0,1]
  const top = (u: number) => {
    switch (kind) {
      case 'amanita': return 0.5 * r * Math.pow(Math.max(0, 1 - u * u), 0.6) - 0.08 * r * smooth(0.7, 1, u);
      case 'parasol': return 0.18 * r * (1 - u * u) + 0.12 * r * Math.exp(-u * u * 30) - 0.06 * r * smooth(0.8, 1, u);
      case 'wavy': return 0.12 * r * (1 - u) + 0.22 * r * smooth(0.45, 1, u) * u; // rim turns up
      case 'liberty': return 0.95 * r * Math.pow(Math.max(0, 1 - Math.pow(u, 1.8)), 0.75) + 0.1 * r * Math.exp(-u * u * 50) - 0.12 * r * smooth(0.75, 1, u);
      case 'funnel': return 0.05 * r - 0.25 * r * (1 - u) * (1 - u) + 0.28 * r * smooth(0.5, 1, u);
    }
  };
  const thick = kind === 'liberty' ? 0.08 : 0.07;
  const N = 28;
  const pts: THREE.Vector2[] = [];
  const stemR = r * (kind === 'liberty' ? 0.1 : 0.13);
  // underside first (from stem out to the rim), then over the rim, then the top back to the centre
  for (let i = 0; i <= N; i++) { const u = lerp(stemR / r, 1, i / N); pts.push(new THREE.Vector2(u * r, top(u) - thick * r * (1.4 - 0.9 * u) - (kind === 'liberty' ? 0.25 * r * (1 - u) : 0))); }
  for (let i = N; i >= 0; i--) { const u = Math.max(0.001, i / N); pts.push(new THREE.Vector2(u * r, top(u))); }
  const geo = new THREE.LatheGeometry(pts, 72);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const under = new Float32Array(p.count);
  const cols = 72 + 1, rows = pts.length;
  const wav = kind === 'wavy' ? 0.16 : kind === 'funnel' ? 0.12 : kind === 'parasol' ? 0.05 : 0.025;
  const nWaves = kind === 'wavy' ? 7 : kind === 'funnel' ? 5 : 9;
  for (let i = 0; i < p.count; i++) {
    const row = i % rows;
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rho = Math.hypot(x, z), a = Math.atan2(z, x);
    const u = rho / r;
    // wavy, irregular margin; lumpy surface
    const w = Math.sin(a * nWaves + seed) * 0.7 + (noise3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 1) - 0.5) * 1.2;
    y += wav * r * w * smooth(0.35, 1, u);
    const lump = (noise3(x * 2.2 + seed, y * 2.2, z * 2.2) - 0.5) * 0.06 * r;
    x *= 1 + lump; z *= 1 + lump;
    p.setXYZ(i, x, y, z);
    under[i] = row <= N ? 1 : 0;
  }
  void cols;
  geo.setAttribute('aUnder', new THREE.BufferAttribute(under, 1));
  geo.computeVertexNormals();

  const cap = new THREE.MeshStandardMaterial({ color: capC, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  const spots = kind === 'amanita' ? 1 : 0;
  cap.onBeforeCompile = (sh) => {
    sh.uniforms.uT = time; sh.uniforms.uKick = kick;
    sh.uniforms.uGill = { value: gillC };
    sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uR = { value: r };
    sh.uniforms.uSpots = { value: spots };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aUnder; varying float vUnder; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUnder = aUnder; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT, uKick, uSeed, uR, uSpots; uniform vec3 uGill; varying float vUnder; varying vec3 vObj;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rhoN = length(vObj.xz) / uR;
        float ang = atan(vObj.z, vObj.x);
        if (vUnder > .5) diffuseColor.rgb = uGill * .15;
        else {
          diffuseColor.rgb *= (.55 + .6 * smoothstep(.1, 1., rhoN) + .15 * n2(vObj.xz * 5. + uSeed)) * (.9 + .1 * sin(ang * 90. + n2(vec2(ang * 8., rhoN * 3.)) * 4.) * smoothstep(.4, 1., rhoN));
          float sp = smoothstep(.62, .67, n2(vec2(ang * 5., rhoN * 9.) + uSeed)) * uSpots;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95, .92, 1.), sp * smoothstep(.97, .75, rhoN));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vUnder > .5) {
          // radiating gills, brightest toward the stem, with a pulse running outward on the beat
          float gp = ang * 44. + sin(rhoN * 9. + uSeed) * .6;
          float gw = fwidth(gp);
          float gill = smoothstep(.2 + gw, .2 - gw, abs(fract(gp / 6.2832) - .5) - .3) * smoothstep(1.2, .3, gw);
          float run = pow(fract(rhoN * .9 - uT * 145. / 60. * .5), 6.);
          totalEmissiveRadiance += uGill * (.25 + gill * (.55 + .8 * run + .3 * uKick)) * (1.2 - .6 * rhoN);
        } else {
          // thin-film sheen: rainbow bands that slide with view angle and time
          float fres = pow(1. - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.);
          vec3 film = .5 + .5 * cos(6.2832 * (fres * 1.6 + rhoN * .6 + uT * .04 + uSeed * .1 + vec3(0., .33, .67)));
          totalEmissiveRadiance += film * pow(fres, 1.5) * .3 + diffuseColor.rgb * .35 + uGill * pow(fres, 3.) * .5;
        }`);
  };
  cap.customProgramCacheKey = () => 'bgshroom';
  const capMesh = new THREE.Mesh(geo, cap);
  const capGroup = new THREE.Group();
  capGroup.add(capMesh);
  capGroup.position.set(bend * H, H, 0);
  capGroup.rotation.z = -bend * 0.6 + (rand() - 0.5) * 0.15;
  g.add(capGroup);

  // stem: tapered, bent, slightly bulbous at the base, faintly glowing under the gills
  const sp: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const rad = stemR * (1.15 - 0.3 * t) * (1 + (kind === 'amanita' ? 0.6 : 0.25) * smooth(0.25, 0, t));
    sp.push(new THREE.Vector2(rad, t * H));
  }
  const sg = new THREE.LatheGeometry(sp, 20);
  const spos = sg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < spos.count; i++) { const y = spos.getY(i) / H; spos.setX(i, spos.getX(i) + bend * H * y * y); }
  sg.computeVertexNormals();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xa89ad8, roughness: 0.8, emissive: new THREE.Color(0.07, 0.05, 0.14).add(gillC.clone().multiplyScalar(0.05)), envMapIntensity: 0.15 });
  g.add(new THREE.Mesh(sg, stemMat));
  if (kind === 'amanita') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(stemR * 1.1, stemR * 1.7, 0.12 * r, 20, 1, true), stemMat);
    ring.position.set(bend * H * 0.64, H * 0.8, 0);
    g.add(ring);
  }
  g.userData.cap = capGroup;
  g.userData.seed = seed;
  return g;
}

function makeForest(pulse: { value: number }) {
  // A psychedelic grove behind the portal: varied, realistic mushroom forms with glowing gills and
  // an oil-slick rainbow sheen on the caps, breathing and swaying.
  const rand = rng(909);
  const group = new THREE.Group();
  const time = { value: 0 }, kick = { value: 0 };
  const G = (r: number, g2: number, b: number) => new THREE.Color(r, g2, b);
  const defs: { x: number; z: number; s: number; kind: CapKind; cap: number; gill: THREE.Color }[] = [
    { x: -7.5, z: -4, s: 1.5, kind: 'wavy', cap: 0x8a1a8a, gill: G(0.1, 0.8, 1.1) },
    { x: -11, z: -9, s: 2.2, kind: 'amanita', cap: 0xb0103a, gill: G(1, 0.3, 0.8) },
    { x: -5, z: -12.5, s: 2.4, kind: 'liberty', cap: 0x6a3aa0, gill: G(0.2, 0.9, 1) },
    { x: 7.8, z: -4.5, s: 1.3, kind: 'funnel', cap: 0x1a4aa0, gill: G(0.2, 1, 0.9) },
    { x: 11.5, z: -9, s: 2.3, kind: 'parasol', cap: 0x8a2a6a, gill: G(0.2, 0.8, 1.1) },
    { x: 5, z: -14, s: 2.6, kind: 'wavy', cap: 0x3a1a9a, gill: G(1, 0.35, 0.85) },
    { x: -15, z: -3, s: 1.9, kind: 'parasol', cap: 0x5a1a8a, gill: G(0.2, 0.9, 1) },
    { x: 15, z: -2.5, s: 1.8, kind: 'amanita', cap: 0xa0106a, gill: G(0.2, 0.85, 1.1) },
    { x: 0, z: -18, s: 3.2, kind: 'liberty', cap: 0x7a2a9a, gill: G(1, 0.4, 0.9) },
    { x: -9.5, z: 1.5, s: 1.0, kind: 'liberty', cap: 0x9a3a8a, gill: G(0.2, 0.9, 1) },
    { x: -3.5, z: -6.5, s: 0.95, kind: 'funnel', cap: 0xb0206a, gill: G(0.2, 1, 1) },
    { x: 3.8, z: -7, s: 1.05, kind: 'amanita', cap: 0x8a10a0, gill: G(0.2, 0.9, 1.1) },
  ];
  const shrooms: THREE.Group[] = [];
  defs.forEach((d, i) => {
    const m = makeBgShroom(d.kind, 300 + i, d.cap, d.gill, time, kick);
    m.position.set(d.x, -0.05, d.z);
    m.scale.setScalar(d.s);
    m.rotation.y = rand() * 6;
    group.add(m);
    shrooms.push(m);
    // a few small ones clustered at its base
    const kinds: CapKind[] = ['amanita', 'liberty', 'wavy', 'funnel'];
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, dist = d.s * lerp(0.7, 1.4, rand());
      const c = makeBgShroom(kinds[Math.floor(rand() * kinds.length)], 400 + i * 5 + k, d.cap, d.gill, time, kick);
      c.position.set(d.x + Math.cos(a) * dist, -0.05, d.z + Math.sin(a) * dist);
      c.scale.setScalar(d.s * lerp(0.25, 0.45, rand()));
      c.rotation.y = rand() * 6;
      group.add(c);
      shrooms.push(c);
    }
  });
  function update(t: number) {
    time.value = t;
    kick.value = pulse.value - 0.8;
    shrooms.forEach((m) => {
      const s = m.userData.seed as number;
      m.rotation.z = 0.02 * Math.sin(t * 0.45 + s);
      m.rotation.x = 0.015 * Math.sin(t * 0.37 + s * 1.3);
      const br = 1 + 0.025 * Math.sin(t * 0.8 + s);
      (m.userData.cap as THREE.Group).scale.set(br, 1 / Math.sqrt(br), br);
    });
  }
  return { group, update };
}

/* ------------------------------------------------ light pulled into the portal */

function makeInflow(count: number) {
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 40 } },
    vertexShader: `
      attribute float aSeed; uniform float uT, uSize; varying float vA;
      void main() {
        float k = fract(aSeed * 17.3 + uT * (.05 + .05 * fract(aSeed * 7.)));
        float a = aSeed * 60. + k * 5.;
        float r = mix(${(RING_R * 2.2).toFixed(2)}, .1, pow(k, .7));
        vec3 p = vec3(cos(a) * r, sin(a) * r * .9, (1. - k) * 2.4 * fract(aSeed * 3.1));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (.4 + fract(aSeed * 29.)) / -mv.z;
        vA = smoothstep(0., .15, k) * smoothstep(1., .8, k);
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vec3(.5, 1.3, 1.6) * a * a * vA * 1.4, 1.); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.position.copy(PORTAL);
  return pts;
}

/* ------------------------------------------------------------------ start */

export function start(canvas: HTMLCanvasElement, opts: { still: boolean; onFirstFrame?: () => void }): GroveHandle {
  const debug = (window as any).__groveDebug || {}; // screenshot/benchmark hook
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e0628, 0.022);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

  const backdrop = makeBackdrop();
  scene.add(backdrop);
  {
    // reflections: violet sky with a bright cyan disc where the portal is
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x120830);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2) }));
    disc.position.set(0, 2, 12);
    disc.lookAt(0, 0, 0);
    const pinkPanel = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.2, 0.7) }));
    pinkPanel.position.set(-10, 6, -4);
    pinkPanel.lookAt(0, 0, 0);
    env.add(disc, pinkPanel);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0x5a44c0, 0x0a0620, 0.45));
  const rim = new THREE.DirectionalLight(0xff4fb0, 0.8);
  rim.position.set(-6, 8, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8f7cff, 0.5);
  fill.position.set(4, 6, 10);
  scene.add(fill);

  const floor = makeFloor();
  scene.add(floor.mesh);

  const pulse = { value: 1 };
  const portal = makePortal();
  const rig = new THREE.Group();
  rig.rotation.y = TURN;
  scene.add(rig);
  rig.add(portal.group);
  crownArch(portal.group, pulse);
  const roots = makeRoots();
  rig.add(roots.group);

  const eyes: Eye[] = [];
  const left = makeTalons(1.0, 3, eyes);
  const fist = makePaintedFist(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/media/im30-fist.webp`);
  scene.add(fist.group);
  rig.add(left.group);

  const figs = [makeFigure(), makeFigure()];
  // out in front of where the portal faces, trudging away from it
  figs[0].position.copy(FACING).multiplyScalar(4.4).addScaledVector(ALONG, -2.4);
  figs[1].position.copy(FACING).multiplyScalar(6.4).addScaledVector(ALONG, 0.2);
  figs.forEach((f) => { f.scale.setScalar(1.7); f.lookAt(PORTAL.x, 0, PORTAL.z); f.rotateY(Math.PI); scene.add(f); });
  rig.updateMatrixWorld(true);
  const chains = makeChains(figs, rig);
  scene.add(chains.mesh);

  const forest = makeForest(pulse);
  if (!debug.noForest) scene.add(forest.group);

  const inflow = makeInflow(260);
  rig.add(inflow);
  const spores = makeSpores(220, new THREE.Vector3(22, 7, 14), new THREE.Vector3(0, 0, -1), 5, 0.2);
  scene.add(spores);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.97);
  if (!debug.noBloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let pr = debug.pr ?? Math.min(window.devicePixelRatio || 1, 1.25) * 0.75;
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5), MIN_PR = 0.45;
  let portrait = false;
  const target = new THREE.Vector3();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    portrait = h > w;
    camera.aspect = w / h;
    camera.fov = portrait ? 52 : 34;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    (spores.material as THREE.ShaderMaterial).uniforms.uSize.value = 50 * pr * (h / 800);
    (inflow.material as THREE.ShaderMaterial).uniforms.uSize.value = 60 * pr * (h / 800);
  }

  // eyes follow the pointer
  let mx = 0, my = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => { tx = e.clientX / innerWidth - 0.5; ty = 0.5 - e.clientY / innerHeight; };
  addEventListener('pointermove', onMove, { passive: true });

  const t0 = performance.now();
  let first = true;
  let viewCorr = 0;
  const edgeP = new THREE.Vector3();
  function frame(now: number) {
    const t = opts.still ? 14 : (now - t0) / 1000 + 4;
    const kick = opts.still ? 0.3 : Math.exp(-(((t * BPM) / 60) % 1) * 5);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;

    // the cover's viewpoint: from the front-left and a little above, looking at the portal;
    // on landscape the aim point slides left along the screen so the portal sits right of the logo
    const ang = (portrait ? -0.62 : -0.74) + 0.08 * Math.sin(t * 0.07) + mx * 0.12;
    const dist = portrait ? 25 : 19.5;
    const C = new THREE.Vector3(1.0, portrait ? 0.6 : 1.5, 0);
    const off = (portrait ? 0.4 : Math.min(6.2, 3.4 * camera.aspect)) + viewCorr;
    camera.position.set(C.x + Math.sin(ang) * dist, (portrait ? 8 : 6.4) + my * 0.5 + 0.12 * Math.sin(t * 0.13), Math.cos(ang) * dist);
    target.set(C.x - Math.cos(ang) * off, C.y + my * 0.2, Math.sin(ang) * off);
    if (debug.cam) { camera.position.fromArray(debug.cam[0]); target.fromArray(debug.cam[1]); }
    camera.lookAt(target);
    backdrop.position.copy(camera.position);
    (backdrop.material as THREE.ShaderMaterial).uniforms.uT.value = t;

    pulse.value = 0.8 + 0.4 * kick;
    trumpetTime.value = t;
    trumpetKick.value = kick;
    portal.update(t, kick);
    portal.group.children.forEach((c) => {
      if (c.userData.seed) {
        const s = c.userData.seed as number;
        const gm = c.userData.gills as THREE.MeshBasicMaterial | undefined;
        if (gm) {
          // little spotted ones bounce on the kick, alternating
          const hop = s % 2 ? kick : Math.exp(-((((t * BPM) / 60 + 0.5) % 1) * 5));
          (c.userData.cap as THREE.Object3D).scale.set(1 + 0.05 * hop, 1 - 0.07 * hop, 1 + 0.05 * hop);
          gm.color.setScalar(0.85 + 0.5 * hop);
        } else {
          (c.userData.cap as THREE.Object3D).scale.setScalar(1 + 0.02 * Math.sin(t * 0.9 + s));
        }
        const motes = c.userData.motes as THREE.ShaderMaterial | undefined;
        if (motes) motes.uniforms.uSize.value = 34 * renderer.getPixelRatio() * (canvas.clientHeight / 800);
      }
    });
    roots.update(t);
    left.update(t);
    // painted fist: fingertips resting over the ring's right edge, facing the camera
    rig.updateMatrixWorld();
    const anchor = rig.localToWorld(new THREE.Vector3(RING_R - TUBE * 1.1, -0.05, 0.95).add(PORTAL));
    fist.group.position.copy(anchor);
    fist.group.quaternion.copy(camera.quaternion);
    fist.mesh.position.set(fist.WID / 2 - 0.1, -0.25, 0);
    // keep the painting's right edge at or past the screen edge: if it drifts on-screen, slide the view
    fist.group.updateMatrixWorld();
    let ndc = Infinity;
    for (const yy of [0.42, 0, -0.38]) {
      edgeP.set(-fist.WID / 2 + fist.PWID, yy * fist.HGT, 0);
      fist.mesh.localToWorld(edgeP).project(camera);
      ndc = Math.min(ndc, edgeP.x);
    }
    if (ndc < 1.05) viewCorr = Math.min(3, viewCorr + (1.05 - ndc) * 0.6);
    else if (ndc > 1.25) viewCorr = Math.max(0, viewCorr - 0.01);
    fist.uniforms.uT.value = t;
    fist.uniforms.uKick.value = kick;
    figs.forEach((f, i) => {
      const tug = Math.sin(t * 1.1 + i * 1.7);
      // heaving forward against the chain
      (f.userData.body as THREE.Group).rotation.x = 0.04 * tug;
      (f.userData.body as THREE.Group).position.z = 0.025 * tug;
      (f.userData.body as THREE.Group).position.y = -0.008 * Math.abs(tug);
    });
    chains.update(t, kick);
    forest.update(t);
    (inflow.material as THREE.ShaderMaterial).uniforms.uT.value = t;
    (spores.material as THREE.ShaderMaterial).uniforms.uT.value = t;
    floor.mat.uniforms.uT.value = t;
    floor.mat.uniforms.uPulse.value = 0.7 + 0.6 * kick;

    // eyes: glance toward the pointer (or wander), blink now and then
    eyes.forEach((e) => {
      const lx = THREE.MathUtils.clamp(mx * 2.2 + 0.5 * Math.sin(t * 0.45 + e.phase), -1, 1);
      const ly = THREE.MathUtils.clamp(my * 2.2 + 0.4 * Math.cos(t * 0.33 + e.phase), -1, 1);
      const u = e.mat.uniforms.uLook.value as THREE.Vector2;
      u.x += (lx - u.x) * 0.08; u.y += (ly - u.y) * 0.08;
      const b = (t * 0.21 + e.phase * 0.137) % 1;
      e.mat.uniforms.uBlink.value = Math.max(e.lid, b < 0.03 ? Math.sin((b / 0.03) * Math.PI) : 0);
    });

    composer.render();
    if (first) { first = false; opts.onFirstFrame?.(); }
  }

  let running = false, visible = true, raf = 0, samples = 0, acc = 0, last = 0, warm = 90;
  function loop(now: number) {
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
