// The IM30 cover's mushrooms, rebuilt for the night grove:
// - trumpets: a thick, glossy, wavy hot-pink rim over a dark-blue fluted funnel streaked with cyan,
//   running down into a glowing stem; comets of light race up the flutes, drips of light fall off the rim
// - the forest: amanita, parasol, wavy, liberty-cap and funnel mushrooms with glowing gills
//   and a thin-film rainbow sheen on the caps
import * as THREE from 'three';
import { lerp, smooth, rng, noise3 } from './grove-util';

export const BPM = 145;

// shared by every fungus material; the scene sets these once per frame
export const fungiTime = { value: 0 };
export const fungiKick = { value: 0 };

export const NOISE_GLSL = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

/* ------------------------------------------------------------------ trumpets */

export interface TrumpetOpts {
  seed: number;
  stem: number;     // stem length below the funnel, in cap units (the cap rim is ~1.7 across)
  bend?: number;    // sideways sweep of the stem at the rim, in cap units
  detail?: number;  // 0..1: tessellation, fluting, drips
}

export interface Trumpet extends THREE.Group {
  userData: {
    seed: number;
    lit: { value: number };       // 0..1, fades the glow in as the infection reaches it
    points: THREE.ShaderMaterial[]; // point sprites whose size tracks the viewport
    rimTop: number;               // local height of the rim, for placing lights
  };
}

// The cover's cap: funnel profile from the stem out to the rolled lip, then the top back to the centre.
const CAP_PROFILE = [
  [0.2, 0], [0.22, 0.35], [0.28, 0.65], [0.42, 0.92], [0.66, 1.12], [0.98, 1.27], [1.3, 1.36], [1.55, 1.4],
  [1.7, 1.46], [1.74, 1.54], [1.66, 1.62], [1.45, 1.63], [1.1, 1.62], [0.7, 1.57], [0.3, 1.52], [0.001, 1.5],
];
const CAP_UNDER = 7; // profile points up to [1.55, 1.4] are the fluted underside

export function makeTrumpet(o: TrumpetOpts): Trumpet {
  const { seed, stem: L } = o;
  const bend = o.bend ?? 0;
  const detail = o.detail ?? 1;
  const rand = rng(seed * 131 + 7);

  // stem: a bulbous foot tapering up into the funnel
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, -L - 0.05)];
  const sN = Math.max(2, Math.round(L * 2.5));
  for (let i = 0; i < sN; i++) {
    const t = i / sN;
    pts.push(new THREE.Vector2(0.2 * (1 + 0.75 * smooth(0.3, 0, t)) * (1 + 0.08 * (1 - t)), -L + t * L));
  }
  const first = pts.length;
  CAP_PROFILE.forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)));
  const underEnd = first + CAP_UNDER + 0.5;
  const spline = new THREE.SplineCurve(pts);
  const perSeg = Math.round(lerp(3, 6, detail));
  const prof = spline.getPoints((pts.length - 1) * perSeg);
  const rows = prof.length;
  const segs = Math.round(lerp(72, 256, detail));
  const geo = new THREE.LatheGeometry(prof, segs);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3), under = new Float32Array(p.count);
  const height = new Float32Array(p.count), rim = new Float32Array(p.count), prho = new Float32Array(p.count), py = new Float32Array(p.count);

  // the 2D profile normal at each row, to push the flutes out of the surface
  const rowN: THREE.Vector2[] = prof.map((_, i) => {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(rows - 1, i + 1)];
    return new THREE.Vector2(b.y - a.y, -(b.x - a.x)).normalize();
  });
  const pn = (a: number, f: number, sd: number) => noise3(Math.cos(a) * f + sd * 7.3, Math.sin(a) * f, sd * 3.1) * 2 - 1;
  const c = new THREE.Color();
  const hot = new THREE.Color(1, 0.12, 0.5), pale = new THREE.Color(1, 0.55, 0.82), deepPink = new THREE.Color(0.6, 0.03, 0.3);
  const navy = new THREE.Color(0.005, 0.015, 0.16);
  const span = L + 1.63;
  for (let i = 0; i < p.count; i++) {
    const row = i % rows;
    const isUnder = (row / (rows - 1)) * (pts.length - 1) <= underEnd;
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rho = Math.hypot(x, z), a = Math.atan2(z, x);
    prho[i] = rho; py[i] = y;
    // false gills: soft ridges running down the funnel (not the stem, where they'd be finer than a pixel)
    const ridgeA = a * 34 + Math.sin(y * 3 + seed) * 1.5;
    const ridge = isUnder ? Math.pow(0.5 + 0.5 * Math.sin(ridgeA), 2) * smooth(0.45, 1.3, rho) * 0.04 * detail : 0;
    const flare = 1 + 0.09 * pn(a, 1.4, seed) * smooth(0.5, 1.7, rho);
    const n = rowN[row];
    const nx = (x / Math.max(rho, 1e-4)) * n.x, nz = (z / Math.max(rho, 1e-4)) * n.x;
    x = x * flare + nx * ridge; z = z * flare + nz * ridge;
    y += smooth(0.9, 1.74, rho) * (0.16 * pn(a, 2.3, seed + 2) - 0.04) + n.y * ridge;
    // lumpy, fleshy stem
    if (y < 0.2) { const lump = 1 + 0.06 * (noise3(x * 5 + seed, y * 1.3, z * 5) - 0.5); x *= lump; z *= lump; }
    const hN = THREE.MathUtils.clamp((y + L) / span, 0, 1);
    x += bend * hN * hN;
    p.setXYZ(i, x, y, z);
    height[i] = hN;
    rim[i] = smooth(1.1, 1.74, rho) * (y > 0.5 ? 1 : 0);
    under[i] = isUnder ? 1 : 0;
    if (isUnder) c.copy(navy);
    else {
      // glossy hot pink: pale where the rim rolls over, deeper toward the centre, painterly mottling
      const roll = smooth(1.35, 1.74, rho) * (1 - smooth(1.6, 1.66, y));
      c.copy(deepPink).lerp(hot, smooth(0.1, 1.2, rho)).lerp(pale, roll * 0.75 + 0.15 * noise3(x * 2.5, y * 2.5, z * 2.5));
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('aUnder', new THREE.BufferAttribute(under, 1));
  geo.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
  geo.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
  geo.setAttribute('aRho', new THREE.BufferAttribute(prho, 1));
  geo.setAttribute('aY', new THREE.BufferAttribute(py, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const lit = { value: 1 };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3,
    side: THREE.DoubleSide, envMapIntensity: 0.35,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: fungiTime, uKick: fungiKick, uLit: lit, uSeed: { value: seed }, uL: { value: L } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aUnder, aHeight, aRim, aRho, aY;
        uniform float uT, uKick, uSeed;
        varying float vUnder, vHeight, vRim, vRho, vY, vAng;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vUnder = aUnder; vHeight = aHeight; vRim = aRim; vRho = aRho; vY = aY; vAng = uv.x;
        {
          // the rim flutters like soft tissue, and the whole cap breathes on the beat
          float ang = atan(transformed.z, transformed.x);
          transformed.y += aRim * (.07 * sin(ang * 5. + uT * 1.6 + uSeed) + .04 * sin(ang * 9. - uT * 2.3 + uSeed * 2.));
          transformed.xz *= 1. + aRim * .035 * uKick;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uKick, uLit, uSeed, uL;
        varying float vUnder, vHeight, vRim, vRho, vY, vAng;
        float fh(float n) { return fract(sin(n * 127.1) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // The flutes are drawn per pixel: 34 ridges plus hairline streaks, each melting into its average
        // brightness once it gets finer than a pixel, so the stem never breaks up into jagged hatching.
        float fA = vAng * 6.2831853;
        // funnel: 34 flutes; down the stem they merge into 13 broad grooves
        float stemK = smoothstep(.5, -.4, vY);
        float phF = fA * 34. + sin(vY * 3. + uSeed) * 1.5, phS = fA * 13. + vY * .6 + uSeed;
        float ph = mix(phF, phS, step(.5, stemK));
        float blurF = smoothstep(.5, 2., fwidth(phF)), blurS = smoothstep(.5, 2., fwidth(phS));
        float blur = mix(blurF, blurS, stemK);
        float crest = mix(.5 + .5 * sin(phF), .5 + .5 * sin(phS), stemK);
        float s1 = mix(mix(pow(.5 + .5 * sin(phF), 6.), .226, blurF), mix(pow(.5 + .5 * sin(phS), 3.), .31, blurS), stemK);
        float ph2 = fA * 71. + uSeed;
        float s2 = mix(pow(.5 + .5 * sin(ph2), 10.), .176, smoothstep(.5, 2., fwidth(ph2))) * .6;
        float throat = 1. - smoothstep(.3, 1.35, vRho);
        float foot = mix(.18, 1., smoothstep(-uL, .4, vY));
        float flute = min(1., (s1 + s2) * (.5 + .5 * throat) + throat * .35) * foot;
        float isUnder = step(.5, vUnder);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.005, .015, .16), vec3(.03, .3, .8), flute * .7), isUnder);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vViewPosition);
          float fres = pow(1. - abs(dot(normal, V)), 2.5);
          // comets racing up individual flutes, each on its own clock, some flutes resting
          float id = floor(ph / 6.2831853 + .5) + step(.5, stemK) * 50.;
          float r1 = fh(id + uSeed * 13.), r2 = fh(id * 1.7 + uSeed);
          float x = fract(vHeight * 1.5 - uT * (.22 + .3 * r1) + r2 * 7.);
          float comet = pow(x, 14.) * (1. - smoothstep(.985, 1., x)) * pow(crest, 3.) * step(.35, r2);
          comet *= 1. - blur;
          vec3 e = vec3(.02, .4, 1.) * flute * (.6 + .3 * uKick)
                 + vec3(.35, 1.1, 1.6) * comet * 2.4 * foot
                 + vec3(0., .02, .14);
          // the cap: a thin, backlit pink lip with a glint drifting around it, flaring on the kick,
          // and an oil-slick sheen where the surface turns away
          float glint = pow(.5 + .5 * sin(fA * 2. - uT * .7 + uSeed), 3.);
          vec3 film = .5 + .5 * cos(6.2831853 * (fres * 1.4 + fA * .16 + uT * .03 + vec3(0., .33, .67)));
          vec3 top = vec3(.16, 0., .07)
                   + vec3(1., .12, .48) * fres * vRim * (.4 + .7 * glint + .35 * uKick)
                   + film * pow(fres, 1.6) * .22;
          totalEmissiveRadiance += mix(top, e, isUnder) * uLit;
        }`);
  };
  mat.customProgramCacheKey = () => 'trumpet';
  const cap = new THREE.Mesh(geo, mat);

  const g = new THREE.Group() as Trumpet;
  g.add(cap);
  const points: THREE.ShaderMaterial[] = [];

  // sparkles clinging to the underside, and spores streaming up off the rim
  {
    const N = Math.round(lerp(40, 110, detail));
    const sd = new Float32Array(N);
    for (let i = 0; i < N; i++) sd[i] = rand();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { uT: fungiTime, uSize: { value: 30 }, uLit: lit, uBend: { value: bend }, uL: { value: L } },
      vertexShader: `
        attribute float aSeed; uniform float uT, uSize, uLit, uBend, uL; varying float vA; varying float vKind;
        void main() {
          float a = aSeed * 6.2832 * 7.;
          vec3 p;
          if (aSeed < .45) {
            float r = mix(.35, 1.45, fract(aSeed * 13.));
            p = vec3(cos(a) * r, mix(.55, 1.36, (r - .35) / 1.1) - .03, sin(a) * r);
            vA = pow(.5 + .5 * sin(uT * 3. + aSeed * 90.), 8.);
            vKind = 0.;
          } else {
            float k = fract(aSeed * 5.3 + uT * (.07 + .05 * fract(aSeed * 3.1)));
            p = vec3(cos(a) * 1.7, 1.55, sin(a) * 1.7) * vec3(1. + k * .7, 1., 1. + k * .7) + vec3(0., k * 2.8, 0.);
            p.x += sin(uT * .7 + aSeed * 20.) * .25 * k;
            vA = smoothstep(0., .1, k) * smoothstep(1., .6, k);
            vKind = 1.;
          }
          float hN = clamp((p.y + uL) / (uL + 1.63), 0., 1.);
          p.x += uBend * hN * hN;
          vA *= uLit;
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
    g.add(motes);
    points.push(sm);
  }

  // drips of light: a bead swells under the lip, lets go, and falls to the ground
  if (detail > 0.3) {
    const N = Math.round(lerp(6, 18, detail));
    const sd = new Float32Array(N);
    for (let i = 0; i < N; i++) sd[i] = rand();
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const dm = new THREE.ShaderMaterial({
      uniforms: { uT: fungiTime, uSize: { value: 30 }, uLit: lit, uBend: { value: bend }, uL: { value: L } },
      vertexShader: `
        attribute float aSeed; uniform float uT, uSize, uLit, uBend, uL; varying float vA; varying float vStretch;
        void main() {
          float cyc = 3.5 + 5. * fract(aSeed * 7.7);
          float k = fract(uT / cyc + aSeed * 3.1);
          float a = aSeed * 6.2832 * 13.;
          float hang = .6;
          float fall = max(k - hang, 0.) * cyc;
          vec3 p = vec3(cos(a) * 1.58, 1.36, sin(a) * 1.58);
          float hN = clamp((p.y + uL) / (uL + 1.63), 0., 1.);
          p.x += uBend * hN * hN;
          p.y -= 2.6 * fall * fall;
          float swell = smoothstep(0., hang, k);
          vA = uLit * mix(.25, 1., swell) * step(-uL, p.y) * smoothstep(-uL, -uL + .4, p.y);
          vStretch = clamp(fall * 1.8, 0., 1.);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * mix(.35, .75, swell) / -mv.z;
        }`,
      fragmentShader: `varying float vA; varying float vStretch;
        void main(){
          vec2 q = gl_PointCoord - .5; q.x *= 1. + vStretch * 1.2; q.y += .12 * vStretch;
          float a = smoothstep(.5, 0., length(q));
          gl_FragColor = vec4(vec3(.45, 1.25, 1.6) * a * a * vA * 1.6, 1.); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const drips = new THREE.Points(dg, dm);
    drips.frustumCulled = false;
    g.add(drips);
    points.push(dm);
  }

  g.userData = { seed, lit, points, rimTop: 1.5 };
  return g;
}

/* -------------------------------------------------------------- the forest */

export type CapKind = 'amanita' | 'parasol' | 'wavy' | 'liberty' | 'funnel';

export interface ForestShroom extends THREE.Group {
  userData: { seed: number; lit: { value: number }; cap: THREE.Group };
}

// One lathe for the cap (top surface + gill underside) and one for the stem.
// The gills are drawn in the shader (cheap), the cap has a drifting thin-film rainbow sheen.
export function makeForestShroom(kind: CapKind, seed: number, capC: THREE.ColorRepresentation, gillC: THREE.Color, detail = 0.5): ForestShroom {
  const rand = rng(seed);
  const g = new THREE.Group() as ForestShroom;
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
  const N = Math.round(lerp(18, 36, detail));
  const segs = Math.round(lerp(40, 110, detail));
  const pts: THREE.Vector2[] = [];
  const stemR = r * (kind === 'liberty' ? 0.1 : 0.13);
  // underside first (from the stem out to the rim), then the top back to the centre
  for (let i = 0; i <= N; i++) { const u = lerp(stemR / r, 1, i / N); pts.push(new THREE.Vector2(u * r, top(u) - thick * r * (1.4 - 0.9 * u) - (kind === 'liberty' ? 0.25 * r * (1 - u) : 0))); }
  for (let i = N; i >= 0; i--) { const u = Math.max(0.001, i / N); pts.push(new THREE.Vector2(u * r, top(u))); }
  const geo = new THREE.LatheGeometry(pts, segs);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const under = new Float32Array(p.count);
  const rows = pts.length;
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
  geo.setAttribute('aUnder', new THREE.BufferAttribute(under, 1));
  geo.computeVertexNormals();

  const lit = { value: 1 };
  const cap = new THREE.MeshStandardMaterial({ color: capC, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  const spots = kind === 'amanita' ? 1 : 0;
  cap.onBeforeCompile = (sh) => {
    sh.uniforms.uT = fungiTime; sh.uniforms.uKick = fungiKick; sh.uniforms.uLit = lit;
    sh.uniforms.uGill = { value: gillC };
    sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uR = { value: r };
    sh.uniforms.uSpots = { value: spots };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aUnder; varying float vUnder; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUnder = aUnder; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT, uKick, uSeed, uR, uSpots, uLit; uniform vec3 uGill; varying float vUnder; varying vec3 vObj;\n${NOISE_GLSL}`)
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
          float run = pow(fract(rhoN * .9 - uT * ${(BPM / 60).toFixed(4)} * .5), 6.);
          totalEmissiveRadiance += uGill * (.25 + gill * (.55 + .8 * run + .3 * uKick)) * (1.2 - .6 * rhoN) * uLit;
        } else {
          // thin-film sheen: rainbow bands that slide with view angle and time
          float fres = pow(1. - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.);
          vec3 film = .5 + .5 * cos(6.2832 * (fres * 1.6 + rhoN * .6 + uT * .04 + uSeed * .1 + vec3(0., .33, .67)));
          totalEmissiveRadiance += film * pow(fres, 1.5) * .3 + diffuseColor.rgb * .35 * mix(.4, 1., uLit) + uGill * pow(fres, 3.) * .5 * uLit;
        }`);
  };
  cap.customProgramCacheKey = () => 'forest-shroom';
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
  const sg = new THREE.LatheGeometry(sp, Math.round(lerp(12, 28, detail)));
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
  g.userData = { seed, lit, cap: capGroup };
  return g;
}
