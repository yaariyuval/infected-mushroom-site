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
    { deg: 58, s: 0.78, lean: 0.4 }, { deg: 28, s: 0.62, lean: 0.2 },
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
  uniform vec2 uLook; uniform float uBlink; varying vec2 vUv;
  void main() {
    vec2 p = (vUv - .5) * 2.;
    // pointed almond: upper lid fuller than the lower
    float x2 = min(p.x * p.x, 1.);
    float up = .62 * pow(1. - x2, .9) * (1. - uBlink);
    float lo = .46 * pow(1. - x2, 1.1);
    float edge = min(up - p.y, p.y + lo);
    float alpha = smoothstep(-.14, -.1, edge);
    if (alpha <= 0.) discard;
    vec2 ip = p - uLook * vec2(.34, .12) - vec2(0., .04);
    float ir = length(ip * vec2(1., .95));
    vec3 col = mix(vec3(.62, .7, 1.), vec3(.93, .95, 1.), smoothstep(0., .3, edge));   // sclera, blue in the shadow of the lids
    vec3 irisC = mix(vec3(.05, .16, .75), vec3(.35, .62, 1.), smoothstep(.1, .5, ir));
    col = mix(col, irisC, smoothstep(.54, .5, ir));
    col = mix(col, vec3(.03, .05, .3), smoothstep(.03, 0., abs(ir - .53)));
    col = mix(col, vec3(.45, .05, .12), smoothstep(.2, .17, ir));                       // maroon pupil
    col = mix(col, vec3(1.15), smoothstep(.09, .06, length(ip - vec2(-.16, .16))));   // glint
    col = mix(vec3(.16, .02, .12), col, smoothstep(0., .1, edge));                      // thick dark lid line
    col = mix(col, vec3(.2, .35, 1.), smoothstep(.1, 0., edge) * step(p.y, 0.) * .6);  // blue lower lash line
    gl_FragColor = vec4(col * .9, alpha);
  }`;

function makeEyeDecal(width: number, height: number, eyes: Eye[], rand: () => number, lid = 0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLook: { value: new THREE.Vector2() }, uBlink: { value: lid } },
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
    const wrinkle = 1 - 0.35 * Math.max(Math.exp(-Math.pow((t - 0.58) / 0.012, 2)), Math.exp(-Math.pow((t - 0.66) / 0.012, 2)), Math.exp(-Math.pow((t - 0.33) / 0.012, 2)));
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
  const w = r0 * 2.4 * size, h = Math.min(r0 * 1.2 * size, r0 * 1.7);
  const geo = new THREE.PlaneGeometry(w, h, 16, 8);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const P = new THREE.Vector3(), T = new THREE.Vector3(), out = new THREE.Vector3(), bi = new THREE.Vector3();
  // decide once which way along the finger is the eye's "right", so it isn't mirrored
  const T0 = curve.getTangentAt(t);
  const dir = T0.x > 0 ? -1 : 1;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    const ct = THREE.MathUtils.clamp(t + (dir * u) / len, 0, 1);
    curve.getPointAt(ct, P);
    curve.getTangentAt(ct, T);
    out.copy(toward).addScaledVector(T, -T.dot(toward)).normalize();
    bi.crossVectors(T, out).normalize();
    if (bi.y < 0) bi.negate();
    const r = R * profile(ct) * 1.03;
    const th = v / r + tilt * (u / w);
    P.addScaledVector(out, Math.cos(th) * r).addScaledVector(bi, Math.sin(th) * r);
    p.setXYZ(i, P.x, P.y, P.z);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLook: { value: new THREE.Vector2() }, uBlink: { value: lid } },
    vertexShader: EYE_VERT, fragmentShader: EYE_FRAG,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
  });
  eyes.push({ mat, phase: rand() * 10, lid });
  return new THREE.Mesh(geo, mat);
}

function skinMaterial() {
  return withGlow(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.46, clearcoat: 0.4, clearcoatRoughness: 0.25,
    sheen: 1, sheenColor: new THREE.Color(1, 0.3, 0.7), sheenRoughness: 0.45,
  }), new THREE.Color(0.22, 0, 0.1), { value: 1 });
}

type Flexer = { g: THREE.Group; phase: number; amp: number };

// Left: talons only (no palm, no arm), reaching out of the dark around the arch's outer edge,
// beak-like and tapering into long dark claws, with half-closed slit eyes near the base.
function makeTalons(side: 1 | -1, scale: number, n: number, seed: number, eyes: Eye[], lid: number, eyeSize: number) {
  const rand = rng(seed);
  const group = new THREE.Group();
  group.position.copy(PORTAL);
  const skin = skinMaterial();
  const toward = new THREE.Vector3(Math.sin(-TURN) - side * 0.1, 0.45, Math.cos(-TURN)).normalize();
  const flex: Flexer[] = [];
  const mid = (n - 1) / 2;
  let lowest: { curve: THREE.CatmullRomCurve3; g: THREE.Group; R: number } | null = null;
  for (let i = 0; i < n; i++) {
    const y = (mid - i) * 0.62 * scale + 0.1 + (rand() - 0.5) * 0.1;
    const R = 0.34 * scale * (i === n - 1 ? 0.85 : 1);
    const reach = lerp(0.85, 1.15, rand()) * (i === 0 || i === n - 1 ? 0.85 : 1);
    const pts = [
      [-1.0, 0.25, -0.9], [-1.1, 0.2, 0.0], [-0.7, 0.05, 0.72],
      [0.0, -0.15, 0.92], [0.65 * reach, -0.45, 0.78], [1.05 * reach, -0.72, 0.55],
    ].map(([u, yy, z]) => new THREE.Vector3(-side * (RING_R - u * scale), y + yy * scale, z * (0.9 + 0.1 * scale)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const profile = (t: number) => {
      const beak = 1 - 0.45 * smooth(0.35, 1, t);
      return t > 0.8 ? beak * Math.pow(1 - smooth(0.8, 1, t), 0.8) : beak;
    };
    const g = new THREE.Group();
    g.add(makeFinger(curve, R, skin, profile, [0.56, 0.74]));
    g.add(eyeOnFinger(curve, lerp(0.38, 0.44, rand()), R, profile, toward, eyeSize, eyes, rand, lid));
    group.add(g);
    if (i === n - 1) lowest = { curve, g, R };
    flex.push({ g, phase: rand() * 6, amp: 0.05 });
  }
  // goo dripping from the lowest talon
  const drips: THREE.Group[] = [];
  if (side > 0 && lowest) {
    for (const t of [0.3, 0.37, 0.45]) {
      const len = lerp(0.25, 0.6, rand());
      const d = new THREE.Group();
      const prof = [[0.001, 0], [0.05, -0.02], [0.03, -0.25], [0.028, -len * 0.7], [0.06, -len * 0.92], [0.075, -len - 0.04], [0.05, -len - 0.12], [0.001, -len - 0.14]]
        .map(([x, y]) => new THREE.Vector2(x * scale * 1.4, y));
      const geo = new THREE.LatheGeometry([...prof].reverse(), 16);
      const cnt = geo.attributes.position.count;
      const col = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) col.set([0.85, 0.05, 0.4], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(cnt).fill(1), 1));
      d.add(new THREE.Mesh(geo, skin));
      const p = lowest.curve.getPointAt(t);
      d.position.copy(p).add(new THREE.Vector3(0, -lowest.R * 0.85, 0));
      d.userData.phase = rand() * 6;
      drips.push(d);
      lowest.g.add(d);
    }
  }
  function update(t: number) {
    flex.forEach((f) => { f.g.rotation.z = side * f.amp * (0.5 + 0.5 * Math.sin(t * 0.7 + f.phase)); f.g.rotation.y = 0.03 * Math.sin(t * 0.5 + f.phase); });
    drips.forEach((d) => { d.scale.y = 1 + 0.25 * Math.sin(t * 0.9 + d.userData.phase); });
  }
  return { group, update };
}


// The big hand on the right of the cover: fat, overlapping fingers that bend sharply down at the knuckle
// into rounded tips, with eyes of different sizes near the fingertips and back on the knuckles.
function makeFist(scale: number, seed: number, eyes: Eye[]) {
  const rand = rng(seed);
  const group = new THREE.Group();
  group.position.copy(PORTAL);
  const skin = skinMaterial();
  const toward = new THREE.Vector3(Math.sin(-TURN), 0.5, Math.cos(-TURN)).normalize();
  const flex: Flexer[] = [];
  const ys = [1.05, 0.38, -0.3, -0.98];
  ys.forEach((yy, i) => {
    const y = yy * scale;
    const R = 0.44 * scale * (i === 3 ? 0.88 : 1);
    const bend = lerp(0.75, 1.0, rand());
    const tipIn = lerp(0.3, 0.6, rand()) + (i === 0 ? -0.15 : 0);
    const X = RING_R;
    const z0 = 0.95 - i * 0.05;
    const pts = [
      [X + 3.1, y + 0.25, 0.1], [X + 2.1, y + 0.2, z0 - 0.2], [X + 1.1, y + 0.12, z0],
      [X + 0.25, y + 0.02, z0 + 0.08], [X - tipIn * 0.6, y - 0.35 * bend, z0 + 0.02], [X - tipIn, y - 0.85 * bend, z0 - 0.12],
    ].map(([x, yv, z]) => new THREE.Vector3(x, yv, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const profile = (t: number) => {
      const knuckles = 0.1 * Math.exp(-Math.pow((t - 0.42) / 0.07, 2)) + 0.12 * Math.exp(-Math.pow((t - 0.66) / 0.06, 2));
      const tip = t > 0.9 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.1, 2))) : 1;
      const base = t < 0.05 ? Math.sqrt(t / 0.05) : 1; // rounded, not an open tube end
      return (1 - 0.18 * smooth(0.5, 1, t) + knuckles) * tip * base;
    };
    const g = new THREE.Group();
    g.add(makeFinger(curve, R, skin, profile, [0.93, 1.0]));
    // a big eye near the fingertip on most fingers, smaller ones back on the knuckles
    if (i !== 1) g.add(eyeOnFinger(curve, lerp(0.8, 0.86, rand()), R, profile, toward, lerp(1.15, 1.45, rand()), eyes, rand, rand() > 0.6 ? 0.25 : 0, (rand() - 0.5) * 0.5));
    if (i === 1 || i === 2) g.add(eyeOnFinger(curve, lerp(0.5, 0.56, rand()), R, profile, toward, lerp(1.2, 1.4, rand()), eyes, rand, 0, (rand() - 0.5) * 0.3));
    if (i === 0 || i === 3) g.add(eyeOnFinger(curve, lerp(0.3, 0.36, rand()), R, profile, toward, lerp(0.8, 1.0, rand()), eyes, rand, 0.3, (rand() - 0.5) * 0.4));
    group.add(g);
    flex.push({ g, phase: rand() * 6, amp: 0.035 });
  });
  function update(t: number) {
    flex.forEach((f) => { f.g.rotation.z = f.amp * Math.sin(t * 0.6 + f.phase); f.g.position.x = 0.03 * Math.sin(t * 0.8 + f.phase); });
  }
  return { group, update };
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
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color(0.8, 0.85, 1), emissive: 0x4a4878 });
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
  const pelvis = V(0, 0.5, 0), chest = V(0, 0.74, 0.2), neck = V(0, 0.82, 0.3);
  blob(pelvis, 0.09, 0.07, 0.07);
  blob(V(0, 0.62, 0.1), 0.085, 0.13, 0.075, 0.75);                 // belly
  blob(chest, 0.11, 0.12, 0.085, 0.95);                             // chest, leaning forward
  limb(chest, neck, 0.045, 0.035);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin);
  head.scale.set(0.068, 0.085, 0.075);
  head.position.set(0, 0.85, 0.39);
  head.rotation.x = 0.7;                                             // bowed
  body.add(head);
  // front leg: knee forward and up, foot flat
  limb(V(-0.065, 0.5, 0.02), V(-0.075, 0.32, 0.22), 0.05, 0.038);
  limb(V(-0.075, 0.32, 0.22), V(-0.075, 0.06, 0.18), 0.036, 0.026);
  limb(V(-0.075, 0.05, 0.16), V(-0.075, 0.02, 0.27), 0.028, 0.02);
  // back leg: long stride, pushing off the toes
  limb(V(0.065, 0.5, -0.02), V(0.08, 0.28, -0.17), 0.05, 0.038);
  limb(V(0.08, 0.28, -0.17), V(0.08, 0.09, -0.38), 0.036, 0.026);
  limb(V(0.08, 0.08, -0.39), V(0.08, 0.015, -0.3), 0.026, 0.018);
  // arms: elbows forward, hands up at the face gripping the chain
  const hand = V(0.02, 0.86, 0.33);
  limb(V(-0.1, 0.78, 0.2), V(-0.11, 0.7, 0.4), 0.034, 0.028);
  limb(V(-0.11, 0.7, 0.4), V(-0.03, 0.85, 0.37), 0.027, 0.022);
  limb(V(0.1, 0.78, 0.2), V(0.12, 0.72, 0.38), 0.034, 0.028);
  limb(V(0.12, 0.72, 0.38), V(0.05, 0.86, 0.35), 0.027, 0.022);
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
  const LINK = 0.19;
  const linkGeo = new THREE.TorusGeometry(0.075, 0.024, 8, 18);
  linkGeo.scale(1.45, 1, 1);
  const anchors = [
    { a: new THREE.Vector3(-1.5, 1.0, 0.45), fig: 0 },
    { a: new THREE.Vector3(-0.4, 0.55, 0.5), fig: 0 },
    { a: new THREE.Vector3(0.9, 0.7, 0.5), fig: 1 },
  ];
  const counts = anchors.map((c) => {
    const end = new THREE.Vector3().copy(figures[c.fig].position).add(new THREE.Vector3(0, 0.55, 0));
    return Math.ceil(c.a.distanceTo(end) / LINK) + 3;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0f4a58, metalness: 0.7, roughness: 0.3, emissive: 0x04262e });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += max(vColor - 1., 0.) * vec3(.2, .9, 1.1);\n#endif');
  };
  const mesh = new THREE.InstancedMesh(linkGeo, mat, total);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), col = new THREE.Color();
  const P = (A: THREE.Vector3, B: THREE.Vector3, sag: number, t: number, out: THREE.Vector3) =>
    out.copy(A).lerp(B, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  function update(t: number, kick: number) {
    let idx = 0;
    anchors.forEach((c, ci) => {
      const fig = figures[c.fig];
      const B = new THREE.Vector3();
      fig.userData.hands.getWorldPosition(B);
      const A = rig.localToWorld(c.a.clone());
      const sag = 0.35 + 0.12 * Math.sin(t * 1.1 + ci * 1.7);
      const n = counts[ci];
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        P(A, B, sag, u, p);
        P(A, B, sag, Math.min(1, u + 0.01), tan).sub(p).normalize();
        q.setFromUnitVectors(X, tan);
        q2.setFromAxisAngle(X, i % 2 ? Math.PI / 2 : 0);
        m.compose(p, q.multiply(q2), s);
        mesh.setMatrixAt(idx, m);
        // energy flowing out of the portal along the chain
        const wave = Math.pow(0.5 + 0.5 * Math.sin(u * 14 - t * 5 + ci), 6);
        col.setScalar(1 + 0.9 * wave + 0.2 * kick);
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

function makeForest() {
  // Background trees as on the cover: a flat mauve cap with a cyan rim line, an inverted cone
  // underneath dotted with glowing almond-shaped spots, and pale strands drooping from the rim.
  const rand = rng(909);
  const group = new THREE.Group();
  const time = { value: 0 };
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xcfc4f4, roughness: 0.75, emissive: 0x3a3070 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc03a8c, roughness: 0.55, emissive: 0x30062a });
  capMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${NOISE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // speckles on the cap, and the thin cyan line along its rim
          float sp = step(.9, h21(floor(vObj.xz * 12. + vObj.y * 6.)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1., .55, .8), sp * step(.02, vObj.y));
          float rimLine = smoothstep(.95, .99, length(vObj.xz)) * smoothstep(.05, -.01, vObj.y);
          totalEmissiveRadiance += vec3(.2, .85, 1.1) * rimLine;
        }`);
  };
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uT: time },
    vertexShader: `varying vec2 vUv; varying vec3 vObj; void main(){ vUv = uv; vObj = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vObj;
      ${NOISE_GLSL}
      void main() {
        // rows of almond spots around the cone, staggered like scales
        vec2 q = vec2(vUv.x * 11., vUv.y * 4.2);
        q.x += step(1., mod(floor(q.y), 2.)) * .5;
        vec2 id = floor(q), f = fract(q) - .5;
        float h = h21(id + 7.);
        vec2 e = f / vec2(.2, .38);
        float leaf = smoothstep(1., .75, length(e) + abs(e.x) * .5);
        float on = step(.18, h) * smoothstep(.02, .15, vUv.y) * smoothstep(1., .85, vUv.y);
        float tw = .75 + .25 * sin(uT * 1.6 + h * 30.);
        vec3 base = vec3(.09, .05, .26) * (.45 + .55 * vUv.y);
        vec3 col = mix(base, vec3(.25, 1.05, 1.2) * tw, leaf * on);
        gl_FragColor = vec4(col, 1.);
      }`,
  });

  const places = [
    [-7.5, -4], [-11, -9], [-5.5, -12], [7.8, -4.5], [11.5, -9], [5.5, -13], [-15, -3], [15, -2.5], [0, -16], [-9, 1.5], [9.5, 2],
  ];
  const capGeo = new THREE.LatheGeometry(
    [[0.001, 0.62], [0.3, 0.59], [0.55, 0.5], [0.75, 0.36], [0.9, 0.2], [0.99, 0.06], [1.02, 0.0], [0.98, -0.04], [0.85, -0.03]].map(([x, y]) => new THREE.Vector2(x, y)).reverse(),
    48,
  );
  for (const [x, z] of places) {
    const t = new THREE.Group();
    const h = lerp(2.6, 5, rand()), cr = lerp(1.2, 2.0, rand());
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * cr, 0.17 * cr, h, 14), stemMat);
    stem.position.y = h / 2;
    t.add(stem);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.scale.set(cr, cr * 0.9, cr);
    cap.position.y = h;
    t.add(cap);
    const coneH = cr * lerp(0.4, 0.55, rand());
    const coneGeo = new THREE.CylinderGeometry(cr * 0.9, 0.2 * cr, coneH, 40, 1, true);
    coneGeo.translate(0, -coneH / 2, 0);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = h - 0.02;
    t.add(cone);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6;
    group.add(t);
  }
  function update(tt: number) {
    time.value = tt;

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
  const left = makeTalons(-1, 0.9, 4, 3, eyes, 0.3, 1.45);
  const right = makeFist(1.0, 8, eyes);
  rig.add(left.group, right.group);

  const figs = [makeFigure(), makeFigure()];
  // out in front of where the portal faces, trudging away from it
  figs[0].position.copy(FACING).multiplyScalar(3.6).addScaledVector(ALONG, -1.3);
  figs[1].position.copy(FACING).multiplyScalar(5.2).addScaledVector(ALONG, 0.5);
  figs.forEach((f) => { f.scale.setScalar(1.25); f.lookAt(PORTAL.x, 0, PORTAL.z); f.rotateY(Math.PI); scene.add(f); });
  rig.updateMatrixWorld(true);
  const chains = makeChains(figs, rig);
  scene.add(chains.mesh);

  const forest = makeForest();
  scene.add(forest.group);

  const inflow = makeInflow(260);
  rig.add(inflow);
  const spores = makeSpores(220, new THREE.Vector3(22, 7, 14), new THREE.Vector3(0, 0, -1), 5, 0.2);
  scene.add(spores);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.85);
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
  function frame(now: number) {
    const t = opts.still ? 14 : (now - t0) / 1000 + 4;
    const kick = opts.still ? 0.3 : Math.exp(-(((t * BPM) / 60) % 1) * 5);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;

    const ang = 0.14 * Math.sin(t * 0.07) + mx * 0.16;
    const dist = portrait ? 19 : 17;
    const shiftX = portrait ? 0 : -Math.min(5.2, 2.9 * camera.aspect);
    camera.position.set(Math.sin(ang) * dist + (portrait ? 0 : 0.8), (portrait ? 7.4 : 6.4) + my * 0.5 + 0.12 * Math.sin(t * 0.13), Math.cos(ang) * dist);
    target.set(shiftX, (portrait ? 0.9 : 1.9) + my * 0.2, 0);
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
    right.update(t);
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
