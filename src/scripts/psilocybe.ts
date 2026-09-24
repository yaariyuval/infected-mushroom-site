// Psilocybe cubensis and Psilocybe cyanescens, modelled from life and turned up for the grove.
// - cubensis: a bell cap that opens to convex with an umbo, then flat with an upturned margin;
//   golden-caramel crown fading to a cream margin with white veil flecks; dark purple-brown gills with
//   pale edges; a thick, fibrous white stem with a membranous ring blackened by spores
// - cyanescens ("wavy caps"): a flat chestnut cap with a paler hygrophanous band and a translucent,
//   striate, strongly undulating margin; long, thin, curving white stems, growing in clusters
// Both bruise blue; here the bruises glow cyan and pulse on the kick.
import * as THREE from 'three';
import { lerp, smooth, rng, noise3 } from './grove-util';
import { BPM, NOISE_GLSL, fungiTime, fungiKick } from './fungi';

export type Species = 'cubensis' | 'cyanescens';

export interface PsilocybeOpts {
  seed: number;
  age: number;     // 0 = young bell .. 1 = old and flat
  height: number;  // stem length, in cap radii
  bend: number;    // sideways sweep of the stem at the top, in cap radii
  detail: number;  // 0..1
}

export interface Psilocybe extends THREE.Group {
  userData: { seed: number; lit: { value: number }; cap: THREE.Group; gills?: THREE.MeshBasicMaterial; d?: number };
}

const BEAT = (BPM / 60).toFixed(4);

// cap top surface height at u = rho / R, in cap radii
function capTop(sp: Species, age: number, u: number) {
  if (sp === 'cubensis') {
    const young = 0.82 * Math.pow(Math.max(0, 1 - u * u), 0.6) - 0.28 * u * u * u;
    const mature = 0.42 * Math.pow(Math.max(0, 1 - u * u), 0.75) + 0.11 * Math.exp(-u * u * 16) - 0.08 * Math.pow(u, 4);
    const old = 0.16 * (1 - u * u) + 0.08 * Math.exp(-u * u * 16) + 0.14 * smooth(0.55, 1, u) * u;
    return age < 0.5 ? lerp(young, mature, age * 2) : lerp(mature, old, age * 2 - 1);
  }
  // cyanescens: nearly flat, a low umbo, margin lifting with age
  const young = 0.4 * Math.pow(Math.max(0, 1 - u * u), 0.7) - 0.12 * u * u;
  const old = 0.14 * (1 - u * u) + 0.05 * Math.exp(-u * u * 20) + 0.1 * smooth(0.5, 1, u);
  return lerp(young, old, age);
}

export function makePsilocybe(sp: Species, o: PsilocybeOpts): Psilocybe {
  const { seed, age, detail } = o;
  const rand = rng(seed * 7919 + 3);
  const cub = sp === 'cubensis';
  const R = cub ? lerp(0.72, 1, smooth(0, 0.6, age)) : 1;  // young bells are narrower
  const H = o.height;
  const bend = o.bend;
  const lit = { value: 1 };
  const g = new THREE.Group() as Psilocybe;

  /* ------------------------------------------------------------- stem */
  const stemTop = cub ? 0.15 : 0.075, stemBase = cub ? 0.19 : 0.1;
  const rows = Math.round(lerp(12, 36, detail));
  const sPts: THREE.Vector2[] = [new THREE.Vector2(0.001, -0.08)];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const r = lerp(stemBase, stemTop, Math.pow(t, 0.7)) * (1 + (cub ? 0.25 : 0.35) * smooth(0.12, 0, t));
    sPts.push(new THREE.Vector2(r, t * H));
  }
  const sGeo = new THREE.LatheGeometry(sPts, Math.round(lerp(12, 32, detail)));
  {
    const p = sGeo.attributes.position as THREE.BufferAttribute;
    const hh = new Float32Array(p.count);
    // cyanescens stems wander; cubensis stems are straighter and stout
    const wob = cub ? 0.04 : 0.18;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = THREE.MathUtils.clamp(y / H, 0, 1);
      const lump = 1 + 0.05 * (noise3(p.getX(i) * 6 + seed, y * 2, p.getZ(i) * 6) - 0.5);
      p.setX(i, p.getX(i) * lump + bend * t * t + wob * Math.sin(t * 5 + seed) * t);
      p.setZ(i, p.getZ(i) * lump + wob * 0.6 * Math.sin(t * 4 + seed * 2) * t);
      hh[i] = t;
    }
    sGeo.setAttribute('aT', new THREE.BufferAttribute(hh, 1));
    sGeo.computeVertexNormals();
  }
  const stemMat = new THREE.MeshStandardMaterial({ color: cub ? 0xf2ead8 : 0xeee8e2, roughness: 0.75, envMapIntensity: 0.3 });
  stemMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: fungiTime, uKick: fungiKick, uLit: lit, uSeed: { value: seed }, uCub: { value: cub ? 1 : 0 } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT; varying float vT; varying float vAng;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = aT; vAng = uv.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uT, uKick, uLit, uSeed, uCub; varying float vT; varying float vAng;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // silky fibres running up the stem, blended away when finer than a pixel
        float fp = vAng * 6.2831853 * 23. + vT * 3.;
        float fib = mix(.5 + .5 * sin(fp), .5, smoothstep(.5, 2., fwidth(fp)));
        diffuseColor.rgb *= .86 + .14 * fib;
        // cubensis: yellowish toward the cap; both darken a little at the base
        diffuseColor.rgb *= mix(vec3(1.), vec3(1., .93, .78), uCub * smoothstep(.5, 1., vT)) * (.75 + .25 * smoothstep(0., .25, vT));
        // blue bruising, heaviest toward the base
        float bruise = smoothstep(.55, .75, n2(vec2(vAng * 9., vT * 5.) + uSeed)) * smoothstep(.75, .05, vT);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .3, .75), bruise * .8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float bruiseE = smoothstep(.55, .75, n2(vec2(vAng * 9., vT * 5.) + uSeed)) * smoothstep(.75, .05, vT);
          float pulse = pow(fract(vT * 1.2 - uT * ${BEAT} * .25 + uSeed * .1), 8.);
          totalEmissiveRadiance += (vec3(.05, .65, 1.1) * bruiseE * (.45 + .6 * uKick + .7 * pulse) + mix(vec3(.08, .04, .12), vec3(.03, .07, .12), vT)) * uLit;
        }`);
  };
  stemMat.customProgramCacheKey = () => 'psilo-stem';
  g.add(new THREE.Mesh(sGeo, stemMat));

  /* ------------------------------------------------ cubensis: the ring */
  const tipX = bend + (cub ? 0.04 : 0.18) * Math.sin(5 + seed), tipZ = (cub ? 0.04 : 0.18) * 0.6 * Math.sin(4 + seed * 2);
  if (cub && age > 0.25) {
    const ry = H * 0.84, ra = lerp(stemBase, stemTop, Math.pow(0.84, 0.7));
    const ring = new THREE.LatheGeometry([
      new THREE.Vector2(ra + 0.2, ry - 0.2), new THREE.Vector2(ra + 0.13, ry - 0.08),
      new THREE.Vector2(ra + 0.05, ry), new THREE.Vector2(ra * 0.95, ry + 0.03),
    ], Math.round(lerp(16, 40, detail)));
    const p = ring.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const low = smooth(ry, ry - 0.2, p.getY(i));
      p.setY(i, p.getY(i) + low * 0.05 * Math.sin(a * 7 + seed)); // torn, sagging edge
      p.setX(i, p.getX(i) + bend * 0.84 * 0.84 + (tipX - bend) * 0.84);
      p.setZ(i, p.getZ(i) + tipZ * 0.84);
      // blackened by falling spores on top, white beneath
      const k = lerp(0.12, 0.9, low);
      col.set([k * 0.95, k * 0.9, k], i * 3);
    }
    ring.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ring.computeVertexNormals();
    g.add(new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.2 })));
  }

  /* --------------------------------------------------------------- cap */
  const capGroup = new THREE.Group();
  capGroup.position.set(tipX, H, tipZ);
  capGroup.rotation.z = -Math.atan(2 * bend / H) * 0.8;
  g.add(capGroup);

  const N = Math.round(lerp(18, 48, detail));
  const top = (u: number) => capTop(sp, age, u) * R;
  const stemR = stemTop * 1.05;
  const thick = (u: number) => (cub ? 0.2 : 0.12) * R * (1 - 0.8 * u) + 0.015;
  // profile: underside from the stem out to the margin, round the margin, then the top back to the apex
  const pts: THREE.Vector2[] = [];
  const kind: number[] = []; // 1 = underside
  const uu: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = lerp(stemR / R, 0.985, i / N);
    pts.push(new THREE.Vector2(u * R, top(u) - thick(u))); kind.push(1); uu.push(u);
  }
  for (let i = N; i >= 0; i--) {
    const u = Math.max(0.001, i / N);
    pts.push(new THREE.Vector2(u * R, top(u))); kind.push(0); uu.push(u);
  }
  const segs = Math.round(lerp(40, 128, detail));
  const cGeo = new THREE.LatheGeometry(pts, segs);
  const nWaves = cub ? 6 : 5 + Math.floor(rand() * 3);
  const wavAmp = (cub ? 0.035 : lerp(0.1, 0.22, age)) * R;
  const pn = (a: number, f: number, sd: number) => noise3(Math.cos(a) * f + sd * 7.3, Math.sin(a) * f, sd * 3.1) * 2 - 1;
  const wave = (a: number, u: number) => wavAmp * smooth(0.35, 1, u) * (0.75 * Math.sin(a * nWaves + seed) + 0.6 * pn(a, 2, seed));
  {
    const p = cGeo.attributes.position as THREE.BufferAttribute;
    const rowsC = pts.length;
    const aU = new Float32Array(p.count), aUnder = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const row = i % rowsC;
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x), u = uu[row];
      // lobed, undulating margin; cyanescens also scallops in and out
      const lobe = 1 + (cub ? 0.01 : 0.05) * smooth(0.6, 1, u) * Math.sin(a * nWaves * 2 + seed * 3);
      const lump = 1 + 0.03 * (noise3(x * 3 + seed, y * 3, z * 3) - 0.5) * detail;
      x *= lobe * lump; z *= lobe * lump;
      y += wave(a, u);
      p.setXYZ(i, x, y, z);
      aU[i] = u; aUnder[i] = kind[row];
    }
    cGeo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    cGeo.setAttribute('aUnder', new THREE.BufferAttribute(aUnder, 1));
    cGeo.computeVertexNormals();
  }
  const capMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: cub ? 0.6 : 0.45, clearcoat: cub ? 0.2 : 0.45, clearcoatRoughness: 0.45,
    side: THREE.DoubleSide, envMapIntensity: 0.2,
  });
  capMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT: fungiTime, uKick: fungiKick, uLit: lit, uSeed: { value: seed }, uCub: { value: cub ? 1 : 0 }, uAge: { value: age } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aU, aUnder; varying float vU, vUnder, vAng;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = aU; vUnder = aUnder; vAng = uv.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uT, uKick, uLit, uSeed, uCub, uAge; varying float vU, vUnder, vAng;
        ${NOISE_GLSL}
        float aaStripe(float ph, float sharp, float avg) { return mix(pow(.5 + .5 * sin(ph), sharp), avg, smoothstep(.5, 2., fwidth(ph))); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float A = vAng * 6.2831853;
        vec3 cap;
        float bruise = 0.;
        if (uCub > .5) {
          // golden-caramel crown, cream margin; young caps are darker all over
          vec3 crown = mix(vec3(.5, .12, .06), vec3(.62, .2, .05), uAge);
          vec3 mid = vec3(.92, .5, .16), margin = vec3(.98, .8, .68);
          cap = mix(crown, mid, smoothstep(.05, .6, vU));
          cap = mix(cap, margin, smoothstep(.6, .97, vU) * mix(.4, .85, uAge));
          cap *= .9 + .2 * n2(vec2(A * 3., vU * 6.) + uSeed);
          // radial fibrils and a few white veil flecks toward the margin
          cap *= .94 + .06 * aaStripe(A * 70. + n2(vec2(A * 6., vU * 4.)) * 3., 2., .375);
          float fleck = smoothstep(.76, .84, n2(vec2(A * 19., vU * 24.) + uSeed * 3.)) * smoothstep(.7, .92, vU) * (1. - uAge * .6);
          cap = mix(cap, vec3(.97, .96, .93), fleck);
          bruise = smoothstep(.62, .8, n2(vec2(A * 9., vU * 4.) + uSeed * 5.)) * smoothstep(.86, .99, vU) * .8;
        } else {
          // chestnut centre, a pale drying band, a translucent, finely striate margin stained blue
          cap = mix(vec3(.34, .07, .15), vec3(.64, .26, .14), smoothstep(0., .35, vU));
          float band = smoothstep(.35, .5, vU) * smoothstep(.75, .6, vU) * (.6 + .4 * n2(vec2(A * 4., vU * 3.) + uSeed));
          cap = mix(cap, vec3(.96, .62, .55), band * .8);
          cap = mix(cap, vec3(.55, .24, .2), smoothstep(.72, .95, vU));
          cap *= 1. - .22 * aaStripe(A * 110., 3., .31) * smoothstep(.62, .95, vU);
          bruise = smoothstep(.5, .75, n2(vec2(A * 5., vU * 3.) + uSeed * 5.)) * smoothstep(.65, 1., vU);
          cap *= .92 + .16 * n2(vec2(A * 7., vU * 9.) + uSeed);
        }
        cap = mix(cap, vec3(.1, .28, .7), bruise * .75);
        // underside: dark purple-brown gills with pale edges, radiating from the stem
        float gp = A * (uCub > .5 ? 64. : 52.);
        float gill = aaStripe(gp, 5., .25);
        vec3 under = mix(vec3(.08, .045, .07), vec3(.5, .42, .45), gill * mix(.3, .8, uCub));
        diffuseColor.rgb = mix(cap, under, step(.5, vUnder));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vViewPosition);
          float fres = pow(1. - abs(dot(normal, V)), 2.2);
          float isUnder = step(.5, vUnder);
          float b = uT * ${BEAT};
          // the margin is thin and backlit: warm gold on cubensis, a cool amber on cyanescens
          // ...drifting slowly between gold and hot pink
          vec3 rimC = mix(uCub > .5 ? vec3(1., .55, .15) : vec3(.95, .42, .25), vec3(1., .2, .6), .5 + .5 * sin(uT * .35 + uSeed + A));
          // the cap keeps its own colour under the grove's violet light
          vec3 e = cap * (1. - isUnder) * .3 + rimC * fres * smoothstep(.5, 1., vU) * .55 * (1. - isUnder);
          // an oil-slick sheen where the cap turns away
          vec3 film = .5 + .5 * cos(6.2831853 * (fres * 1.5 + vU * .5 + uT * .03 + uSeed * .1 + vec3(0., .33, .67)));
          e += film * pow(fres, 1.4) * .22 * (1. - isUnder);
          // blue bruises glow and throb on the kick
          e += vec3(.05, .7, 1.2) * bruise * (.55 + .8 * uKick) * (1. - isUnder);
          // gills: a violet-cyan glow between the plates, a ripple running out to the margin every other beat
          float run = pow(fract(vU * 1.1 - b * .5 + uSeed * .13), 6.);
          e += mix(vec3(.35, .1, .8), vec3(.1, .75, 1.), vU) * isUnder * (.18 + .6 * run + .2 * uKick) * smoothstep(1., .3, vU);
          totalEmissiveRadiance += e * uLit;
        }`);
  };
  capMat.customProgramCacheKey = () => 'psilo-cap';
  capGroup.add(new THREE.Mesh(cGeo, capMat));

  /* gill plates, for the ones seen up close */
  let gillMat: THREE.MeshBasicMaterial | undefined;
  if (detail >= 0.55) {
    const plates = Math.round(lerp(50, cub ? 120 : 90, detail));
    const steps = 8;
    const posArr: number[] = [], colArr: number[] = [], idx: number[] = [];
    const inner = stemR * 1.3, outer = 0.97 * R;
    const edge = cub ? new THREE.Color(0.75, 0.62, 0.8) : new THREE.Color(0.4, 0.3, 0.55);
    const root = new THREE.Color(0.05, 0.02, 0.06), c = new THREE.Color();
    for (let k = 0; k < plates; k++) {
      const a = (k / plates) * Math.PI * 2;
      const start = k % 2 ? lerp(inner, outer, 0.5) : k % 4 === 2 ? lerp(inner, outer, 0.25) : inner;
      const ca = Math.cos(a), sa = Math.sin(a);
      const base = posArr.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const rho = lerp(start, outer, t), u = rho / R;
        const yTop = top(u) - thick(u) + 0.005 + wave(a, u);
        const depth = (cub ? 0.12 : 0.08) * R * Math.pow(Math.sin(Math.PI * lerp(0.1, 1, t)), 0.7) * smooth(0, 0.15, t) * smooth(1, 0.8, t);
        posArr.push(ca * rho, yTop, sa * rho, ca * rho, yTop - depth, sa * rho);
        c.copy(edge).multiplyScalar(lerp(1, 0.6, u));
        colArr.push(root.r, root.g, root.b, c.r, c.g, c.b);
        if (s < steps) { const v = base + s * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    gg.setIndex(idx);
    gillMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    capGroup.add(new THREE.Mesh(gg, gillMat));
  }

  g.userData = { seed, lit, cap: capGroup, gills: gillMat };
  return g;
}

// A clump growing from one spot, stems splaying outward: a few mature caps, some young bells, a button or two.
export function makePsilocybeCluster(sp: Species, seed: number, count: number, detail: number) {
  const rand = rng(seed);
  const group = new THREE.Group();
  const members: Psilocybe[] = [];
  const cub = sp === 'cubensis';
  for (let i = 0; i < count; i++) {
    const age = i === 0 ? 0.55 : Math.pow(rand(), 0.8) * (cub ? 0.9 : 1);
    const a = (i / count) * Math.PI * 2 + rand() * 0.8;
    const spread = i === 0 ? 0 : lerp(0.15, 0.55, rand()) * (cub ? 1 : 0.6);
    const height = (cub ? lerp(2.2, 4.2, rand()) : lerp(3.5, 6.5, rand())) * lerp(0.55, 1, age);
    const m = makePsilocybe(sp, { seed: seed * 17 + i, age, height, bend: lerp(0.2, 0.9, rand()) * (i === 0 ? 0.4 : 1) * (cub ? 0.8 : 1.6), detail: i < 3 ? detail : detail * 0.7 });
    m.position.set(Math.cos(a) * spread, 0, Math.sin(a) * spread);
    m.rotation.y = -a;                 // bend (+x) points away from the clump's centre
    const s = lerp(0.75, 1.1, rand()) * (i === 0 ? 1.1 : 1);
    m.scale.setScalar(s);
    group.add(m);
    members.push(m);
  }
  return { group, members };
}
