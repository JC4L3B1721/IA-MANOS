// Galaxia espiral de flores alrededor de una singularidad. Todas las posiciones se calculan
// en la GPU (vertex shader): miles de flores orbitan, caen en espiral hacia el agujero negro,
// florecen, se colapsan y estallan sin coste en la CPU.
import * as THREE from 'three';
import { createFlowerAtlas, createGlowTexture, createNebulaTexture, FLOWER_SPECIES } from './textures.js';

const TAU = Math.PI * 2;

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// Dinámica compartida por flores, polen y nebulosas
const DYNAMICS_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uBloom;
  uniform float uBurst;
  uniform float uCollapse;
  uniform float uInner;
  uniform vec4 uWell;   // xyz: punto de gravedad del puntero · w: intensidad
  uniform vec4 uShock;  // xyz: centro de la onda · w: progreso 0..1 (fuera de rango = inactiva)

  // o = (radio, ángulo, altura, fase) · fall = velocidad de caída hacia la singularidad
  vec3 galaxyPos(vec4 o, float fall, out float fade, out float heat, out float energy) {
    float r0 = o.x;
    float phase = o.w;
    float spread = mix(0.34, 1.3, uBloom);
    // Rotación diferencial periódica (los brazos respiran sin enrollarse) + núcleo más rápido
    float a = o.y + uTime * (0.05 + 0.22 * exp(-r0 * 0.9)) + 0.55 * sin(uTime * 0.11) / (1.0 + r0 * 0.35);
    float rw = uInner + r0 * spread * (1.0 + 0.02 * sin(uTime * 0.6 + phase * 6.2831));
    fade = 1.0;

    // Caída en espiral: lenta al principio, vertiginosa al final; renace en su órbita original
    if (fall > 0.0) {
      float life = fract(phase * 7.13 + uTime * fall);
      float k = life * life * life;
      rw = mix(rw, 0.6, k);
      a += k * 7.5;
      fade = smoothstep(0.0, 0.08, life);
    }

    // Colapso gravitacional y explosión
    rw *= 1.0 - 0.8 * uCollapse;
    a += uCollapse * 2.2 / (rw + 0.6);
    rw += uBurst * (3.0 + rw * 1.1);

    float h = o.z * mix(0.5, 1.2, uBloom) * smoothstep(0.6, 3.5, rw) * (1.0 - uCollapse);
    h += 0.05 * sin(uTime * 0.8 + phase * 20.0);
    vec3 p = vec3(cos(a) * rw, h, sin(a) * rw);

    heat = smoothstep(3.4, 0.9, rw);
    fade *= smoothstep(0.75, 1.3, rw); // el horizonte de sucesos se lo traga
    energy = 0.0;

    // Pozo de gravedad del dedo índice: atrae y hace girar las flores cercanas
    if (uWell.w > 0.001) {
      vec3 d = uWell.xyz - p;
      float dist = length(d);
      float pull = uWell.w * exp(-dist * dist * 0.12);
      vec3 swirl = normalize(cross(d, vec3(0.0, 1.0, 0.0)) + 1e-5) * pull * 0.9;
      p += d * pull * 0.55 + swirl;
      energy += pull;
    }

    // Onda expansiva (repulsor / descarga de energía)
    if (uShock.w >= 0.0 && uShock.w < 1.0) {
      vec3 d = p - uShock.xyz;
      float dist = length(d) + 1e-4;
      float radius = uShock.w * 16.0;
      float ring = exp(-pow(dist - radius, 2.0) * 0.35) * (1.0 - uShock.w);
      p += d / dist * ring * 2.2;
      energy += ring * 1.5;
    }
    return p;
  }
`;

const FLOWER_VERTEX = /* glsl */ `
  ${DYNAMICS_GLSL}
  attribute vec4 aOrbit;  // radio, ángulo, altura, fase
  attribute vec4 aStyle;  // tamaño, especie, giro propio, brillo
  attribute vec3 aTint;
  attribute vec2 aMotion; // velocidad de caída, velocidad de volteo
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uPulse;
  varying vec3 vTint;
  varying float vType;
  varying float vRot;
  varying float vAlpha;
  varying float vGlow;
  varying float vHeat;
  varying float vSquash;
  varying float vPhase;
  void main() {
    float fade;
    float heat;
    float energy;
    vec3 p = galaxyPos(aOrbit, aMotion.x, fade, heat, energy);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    // Onda de luz que viaja del centro hacia afuera durante el pellizco
    float wave = uPulse * pow(0.5 + 0.5 * sin(aOrbit.x * 0.8 - uTime * 4.5), 3.0);
    float glow = wave + energy + uBurst * 0.6;
    float size = aStyle.x * (1.0 + 0.5 * wave + 0.35 * energy) * mix(1.0, 0.5, heat * step(0.0001, aMotion.x));
    gl_PointSize = min(size * uSizeScale * uPixelRatio / depth, 260.0 * uPixelRatio);
    vAlpha = smoothstep(0.4, 2.6, depth) * fade;
    vGlow = glow;
    vHeat = heat;
    vTint = aTint * aStyle.w;
    vType = aStyle.y;
    vRot = aOrbit.w * 6.2831 + uTime * aStyle.z;
    // Volteo 3D: la flor se inclina y se ve como una elipse que respira
    vSquash = mix(0.42, 1.0, abs(cos(aOrbit.w * 12.0 + uTime * aMotion.y)));
    vPhase = aOrbit.w;
  }
`;

const FLOWER_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform vec3 uHeatColor;
  varying vec3 vTint;
  varying float vType;
  varying float vRot;
  varying float vAlpha;
  varying float vGlow;
  varying float vHeat;
  varying float vSquash;
  varying float vPhase;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    pc = mat2(c, -s, s, c) * pc;
    pc.y /= vSquash;
    if (abs(pc.x) > 0.5 || abs(pc.y) > 0.5) discard;
    vec2 cell = vec2(mod(vType, 3.0), 2.0 - floor(vType / 3.0));
    vec4 tex = texture2D(uAtlas, (vec2(pc.x + 0.5, 0.5 - pc.y) + cell) / 3.0);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.02) discard;
    vec3 col = tex.rgb * vTint;
    // Cerca del horizonte las flores se calientan hasta brillar como plasma
    float lum = dot(tex.rgb, vec3(0.3, 0.55, 0.15));
    col = mix(col, uHeatColor * (0.35 + lum) * 0.6, vHeat * 0.45);
    col *= 1.0 + vGlow * 0.45;
    // Destello especular que recorre cada flor de vez en cuando
    float glint = pow(max(0.0, sin(uTime * 1.7 + vPhase * 60.0)), 64.0);
    col += vec3(1.0, 0.95, 0.8) * glint * smoothstep(0.3, 0.0, length(pc)) * 0.6;
    gl_FragColor = vec4(col, alpha);
  }
`;

const POLLEN_VERTEX = /* glsl */ `
  ${DYNAMICS_GLSL}
  attribute vec4 aOrbit;
  attribute vec3 aColor;
  attribute vec2 aMotion; // velocidad de caída, tamaño
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uPulse;
  uniform vec3 uPollenTint;
  uniform vec3 uHeatColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float fade;
    float heat;
    float energy;
    vec3 p = galaxyPos(aOrbit, aMotion.x, fade, heat, energy);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aOrbit.w * 3.0) + aOrbit.w * 40.0);
    gl_PointSize = max(1.0, aMotion.y * (1.0 + energy) * uSizeScale * uPixelRatio / depth);
    // Al contraerse la densidad se multiplica: se atenúa para no saturar a blanco
    float density = mix(0.3, 1.0, uBloom) * (1.0 - 0.5 * uCollapse);
    vAlpha = twinkle * fade * smoothstep(0.3, 2.0, depth) * density * (1.0 - heat * 0.7) * (1.0 + uPulse * 0.35 + energy);
    vColor = mix(aColor * uPollenTint, uHeatColor * 0.8, heat * 0.7);
  }
`;

const POLLEN_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

const NEBULA_VERTEX = /* glsl */ `
  ${DYNAMICS_GLSL}
  attribute vec4 aOrbit;
  attribute vec3 aStyle; // tamaño, rotación, opacidad
  attribute vec3 aColor;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform vec3 uNebulaTint;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  void main() {
    float fade;
    float heat;
    float energy;
    vec3 p = galaxyPos(aOrbit, 0.0, fade, heat, energy);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    gl_PointSize = min(aStyle.x * uSizeScale * uPixelRatio / depth, 1600.0);
    vAlpha = aStyle.z * fade * smoothstep(1.5, 7.0, depth) * mix(0.35, 1.0, uBloom);
    vColor = aColor * uNebulaTint;
    vRot = aStyle.y + uTime * 0.01;
  }
`;

const NEBULA_FRAGMENT = /* glsl */ `
  uniform sampler2D uCloud;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    pc = mat2(c, -s, s, c) * pc + 0.5;
    float a = texture2D(uCloud, pc).a;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export class FlowerGalaxy {
  constructor(quality, config) {
    this.config = config;
    this.object = new THREE.Group();
    this.uniforms = {
      uTime: { value: 0 },
      uBloom: { value: config.defaultBloom },
      uPulse: { value: 0 },
      uBurst: { value: 0 },
      uCollapse: { value: 0 },
      uInner: { value: config.inner },
      uWell: { value: new THREE.Vector4(0, 0, 0, 0) },
      uShock: { value: new THREE.Vector4(0, 0, 0, -1) },
      uSizeScale: { value: 600 },
      uPixelRatio: { value: 1 },
      uPollenTint: { value: new THREE.Color(1, 1, 1) },
      uNebulaTint: { value: new THREE.Color(1, 1, 1) },
      uHeatColor: { value: new THREE.Color(2.0, 0.95, 0.3) },
    };
    this._buildNebulae(quality.nebulae);
    this._buildDust(Math.round(quality.nebulae * 0.6));
    this._buildPollen(quality.pollen);
    this._buildHalo();
    this._buildFlowers(quality.flowers);
  }

  // Distribución: bulbo + brazos espirales + campo disperso entre brazos
  _sample(i, spreadMul = 1) {
    const { radius, arms, armTwist, armSpread } = this.config;
    const roll = Math.random();
    if (roll < 0.12) {
      return { r: Math.abs(gaussian()) * radius * 0.11, a: Math.random() * TAU, h: gaussian() * radius * 0.045, zone: 'core' };
    }
    if (roll < 0.2) {
      return { r: radius * Math.sqrt(Math.random()) * 1.05, a: Math.random() * TAU, h: gaussian() * 0.25, zone: 'field' };
    }
    const r0 = radius * (0.06 + 0.94 * Math.pow(Math.random(), 1.2));
    const a0 = ((i % arms) / arms) * TAU + r0 * armTwist;
    const s = armSpread * spreadMul * (0.3 + 0.075 * r0);
    const x = Math.cos(a0) * r0 + gaussian() * s;
    const z = Math.sin(a0) * r0 + gaussian() * s;
    return { r: Math.hypot(x, z), a: Math.atan2(z, x), h: gaussian() * (0.1 + 0.28 * (1 - r0 / radius)), zone: 'arm' };
  }

  _points(count, attributes, material, renderOrder) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    for (const [name, [array, size]] of Object.entries(attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // la posición real se calcula en el shader
    points.renderOrder = renderOrder;
    this.object.add(points);
    return points;
  }

  _buildFlowers(count) {
    const { radius } = this.config;
    const orbit = new Float32Array(count * 4);
    const style = new Float32Array(count * 4);
    const tint = new Float32Array(count * 3);
    const motion = new Float32Array(count * 2);
    const warm = new THREE.Color(1.0, 0.8, 0.52);
    const pale = new THREE.Color(1.0, 0.97, 0.86);
    const color = new THREE.Color();
    // Frecuencia relativa de cada especie
    const weights = [0.15, 0.12, 0.12, 0.1, 0.12, 0.09, 0.1, 0.1, 0.1];
    const cumulative = weights.map(((sum) => (w) => (sum += w))(0));

    for (let i = 0; i < count; i++) {
      const p = this._sample(i);
      orbit.set([p.r, p.a, p.h, Math.random()], i * 4);

      const roll = Math.random() * cumulative[FLOWER_SPECIES - 1];
      const type = cumulative.findIndex((c) => roll <= c);
      let size = p.zone === 'core' ? 0.15 + Math.random() * 0.18 : 0.22 + Math.pow(Math.random(), 2) * 0.42;
      if (Math.random() < 0.025) size = 0.75 + Math.random() * 0.45; // flores protagonistas
      if (type === 2 || type === 4) size *= 1.1;
      style.set([size, type, (Math.random() - 0.5) * 0.5, 0.82 + Math.random() * 0.3], i * 4);

      color.copy(warm).lerp(pale, THREE.MathUtils.clamp(p.r / radius + (Math.random() - 0.5) * 0.25, 0, 1));
      tint.set([color.r, color.g, color.b], i * 3);

      // Un 28 % de las flores cae lentamente en espiral hacia la singularidad
      const fall = Math.random() < 0.28 ? (0.01 + Math.random() * 0.018) / (0.6 + p.r * 0.08) : 0;
      motion.set([fall, 0.15 + Math.random() * 0.5], i * 2);
    }

    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uAtlas: { value: createFlowerAtlas() } },
      vertexShader: FLOWER_VERTEX,
      fragmentShader: FLOWER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.flowers = this._points(count, { aOrbit: [orbit, 4], aStyle: [style, 4], aTint: [tint, 3], aMotion: [motion, 2] }, material, 6);
  }

  _buildPollen(count) {
    const orbit = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const motion = new Float32Array(count * 2);
    const palette = [
      [1.0, 0.72, 0.28],
      [1.0, 0.86, 0.55],
      [1.0, 0.95, 0.82],
      [1.0, 0.62, 0.2],
    ];
    for (let i = 0; i < count; i++) {
      const p = this._sample(i, 1.9);
      orbit.set([p.r, p.a, p.h * 1.4, Math.random()], i * 4);
      const [r, g, b] = palette[(Math.random() * palette.length) | 0];
      const intensity = 0.35 + Math.random() * 0.65;
      colors.set([r * intensity, g * intensity, b * intensity], i * 3);
      // El polen forma corrientes que caen hacia el agujero negro
      const fall = Math.random() < 0.45 ? (0.02 + Math.random() * 0.04) / (0.6 + p.r * 0.08) : 0;
      motion.set([fall, 0.025 + Math.pow(Math.random(), 3) * 0.09], i * 2);
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POLLEN_VERTEX,
      fragmentShader: POLLEN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pollen = this._points(count, { aOrbit: [orbit, 4], aColor: [colors, 3], aMotion: [motion, 2] }, material, 4);
  }

  _cloudAttributes(count, tints, sizeRange, opacityRange) {
    const orbit = new Float32Array(count * 4);
    const style = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let p = this._sample(i, 1.4);
      while (p.zone === 'core') p = this._sample(i, 1.4);
      orbit.set([p.r, p.a, p.h * 0.5, Math.random()], i * 4);
      style.set([
        sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
        Math.random() * TAU,
        opacityRange[0] + Math.random() * (opacityRange[1] - opacityRange[0]),
      ], i * 3);
      colors.set(tints[(Math.random() * tints.length) | 0], i * 3);
    }
    return { aOrbit: [orbit, 4], aStyle: [style, 3], aColor: [colors, 3] };
  }

  _buildNebulae(count) {
    this.cloudTexture = createNebulaTexture();
    const tints = [
      [0.9, 0.55, 0.18],
      [0.85, 0.42, 0.22],
      [1.0, 0.78, 0.4],
      [0.7, 0.45, 0.35],
    ];
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uCloud: { value: this.cloudTexture } },
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nebulae = this._points(count, this._cloudAttributes(count, tints, [3.5, 8], [0.05, 0.12]), material, 3);
  }

  // Bandas de polvo oscuro entre los brazos: dan profundidad, como en las fotos del Hubble
  _buildDust(count) {
    const tints = [
      [0.02, 0.015, 0.01],
      [0.05, 0.03, 0.015],
    ];
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uCloud: { value: this.cloudTexture }, uNebulaTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.dust = this._points(count, this._cloudAttributes(count, tints, [3, 6.5], [0.25, 0.45]), material, 3.5);
  }

  _buildHalo() {
    const material = new THREE.SpriteMaterial({
      map: createGlowTexture([
        [0, 'rgba(255, 200, 110, 0.9)'],
        [0.35, 'rgba(230, 150, 50, 0.25)'],
        [1, 'rgba(200, 110, 20, 0)'],
      ]),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Sprite(material);
    this.halo.scale.setScalar(18);
    this.halo.renderOrder = -0.5;
    this.object.add(this.halo);
  }

  setViewport(heightPx, fovDeg, pixelRatio) {
    this.uniforms.uSizeScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  setTheme(theme, k) {
    const u = this.uniforms;
    u.uPollenTint.value.lerp(theme.pollen, k);
    u.uNebulaTint.value.lerp(theme.nebula, k);
    u.uHeatColor.value.lerp(theme.heat, k);
    this.halo.material.color.lerp(theme.halo, k);
  }

  update(dt, { bloom, pulse, burst, collapse, well, shock }) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uBloom.value = bloom;
    u.uPulse.value = pulse;
    u.uBurst.value = burst;
    u.uCollapse.value = collapse;
    u.uWell.value.copy(well);
    u.uShock.value.copy(shock);
    const spread = THREE.MathUtils.lerp(0.34, 1.3, bloom);
    this.halo.scale.setScalar(18 * spread * (1 - 0.6 * collapse) * (1 + burst));
  }
}
