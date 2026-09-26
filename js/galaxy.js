// Galaxia espiral de flores. Todas las posiciones se calculan en la GPU (vertex shader),
// así miles de flores orbitan, respiran y florecen sin coste en la CPU.
import * as THREE from 'three';
import { createFlowerAtlas, createGlowTexture, createNebulaTexture } from './textures.js';

const TAU = Math.PI * 2;

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// Órbita compartida por flores, polen y nebulosas
const ORBIT_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uBloom;
  vec3 orbit(float r, float angle, float height, float phase) {
    float spread = mix(0.34, 1.3, uBloom);
    // Rotación diferencial periódica: los brazos respiran pero nunca se enrollan del todo
    float a = angle + uTime * 0.05 + 0.55 * sin(uTime * 0.11) / (1.0 + r * 0.35);
    float breathe = 1.0 + 0.02 * sin(uTime * 0.6 + phase * 6.2831);
    float rr = r * spread * breathe;
    float h = height * mix(0.5, 1.2, uBloom) + 0.05 * sin(uTime * 0.8 + phase * 20.0);
    return vec3(cos(a) * rr, h, sin(a) * rr);
  }
`;

const FLOWER_VERTEX = /* glsl */ `
  ${ORBIT_GLSL}
  attribute vec4 aOrbit; // radio, ángulo, altura, fase
  attribute vec4 aStyle; // tamaño, especie, giro propio, brillo
  attribute vec3 aTint;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uPulse;
  varying vec3 vTint;
  varying float vType;
  varying float vRot;
  varying float vAlpha;
  varying float vGlow;
  void main() {
    vec3 p = orbit(aOrbit.x, aOrbit.y, aOrbit.z, aOrbit.w);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    // Onda de luz que viaja del centro hacia afuera durante el pellizco
    float wave = uPulse * pow(0.5 + 0.5 * sin(aOrbit.x * 0.8 - uTime * 4.5), 3.0);
    gl_PointSize = min(aStyle.x * (1.0 + 0.5 * wave) * uSizeScale * uPixelRatio / depth, 240.0 * uPixelRatio);
    vAlpha = smoothstep(0.4, 2.6, depth);
    vGlow = wave;
    vTint = aTint * aStyle.w;
    vType = aStyle.y;
    vRot = aOrbit.w * 6.2831 + uTime * aStyle.z;
  }
`;

const FLOWER_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec3 vTint;
  varying float vType;
  varying float vRot;
  varying float vAlpha;
  varying float vGlow;
  void main() {
    vec2 pc = gl_PointCoord - 0.5;
    float c = cos(vRot);
    float s = sin(vRot);
    pc = mat2(c, -s, s, c) * pc;
    if (abs(pc.x) > 0.5 || abs(pc.y) > 0.5) discard;
    vec2 cell = vec2(mod(vType, 2.0), 1.0 - floor(vType / 2.0));
    vec4 tex = texture2D(uAtlas, (vec2(pc.x + 0.5, 0.5 - pc.y) + cell) * 0.5);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(tex.rgb * vTint * (1.0 + vGlow * 0.45), alpha);
  }
`;

const POLLEN_VERTEX = /* glsl */ `
  ${ORBIT_GLSL}
  attribute vec4 aOrbit;
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uPulse;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = orbit(aOrbit.x, aOrbit.y, aOrbit.z, aOrbit.w);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aOrbit.w * 3.0) + aOrbit.w * 40.0);
    gl_PointSize = max(1.0, aSize * uSizeScale * uPixelRatio / depth);
    // Al contraerse la densidad se multiplica: se atenúa para no saturar a blanco
    float density = mix(0.3, 1.0, uBloom);
    vAlpha = twinkle * smoothstep(0.3, 2.0, depth) * density * (1.0 + uPulse * 0.35);
    vColor = aColor;
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
  ${ORBIT_GLSL}
  attribute vec4 aOrbit;
  attribute vec3 aStyle; // tamaño, rotación, opacidad
  attribute vec3 aColor;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  void main() {
    vec3 p = orbit(aOrbit.x, aOrbit.y, aOrbit.z, aOrbit.w);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    gl_PointSize = min(aStyle.x * uSizeScale * uPixelRatio / depth, 1600.0);
    vAlpha = aStyle.z * smoothstep(1.5, 7.0, depth) * mix(0.35, 1.0, uBloom);
    vColor = aColor;
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
      uSizeScale: { value: 600 },
      uPixelRatio: { value: 1 },
    };
    this._buildNebulae(quality.nebulae);
    this._buildPollen(quality.pollen);
    this._buildCore();
    this._buildFlowers(quality.flowers);
  }

  // Distribución: bulbo central + brazos espirales + un campo disperso entre brazos
  _sample(i, spreadMul = 1) {
    const { radius, arms, armTwist, armSpread } = this.config;
    const roll = Math.random();
    if (roll < 0.12) {
      return { r: Math.abs(gaussian()) * radius * 0.11, a: Math.random() * TAU, h: gaussian() * radius * 0.045, zone: 'core' };
    }
    if (roll < 0.2) {
      return { r: radius * Math.sqrt(Math.random()) * 1.05, a: Math.random() * TAU, h: gaussian() * 0.25, zone: 'field' };
    }
    const r0 = radius * (0.08 + 0.92 * Math.pow(Math.random(), 1.2));
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
    const warm = new THREE.Color(1.0, 0.8, 0.52);
    const pale = new THREE.Color(1.0, 0.97, 0.86);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const p = this._sample(i);
      orbit.set([p.r, p.a, p.h, Math.random()], i * 4);

      const roll = Math.random();
      const type = roll < 0.32 ? 0 : roll < 0.55 ? 1 : roll < 0.75 ? 2 : 3;
      let size = p.zone === 'core' ? 0.15 + Math.random() * 0.18 : 0.22 + Math.pow(Math.random(), 2) * 0.42;
      if (Math.random() < 0.025) size = 0.75 + Math.random() * 0.45; // flores protagonistas
      if (type === 2) size *= 1.12;
      style.set([size, type, (Math.random() - 0.5) * 0.5, 0.82 + Math.random() * 0.3], i * 4);

      color.copy(warm).lerp(pale, THREE.MathUtils.clamp(p.r / radius + (Math.random() - 0.5) * 0.25, 0, 1));
      tint.set([color.r, color.g, color.b], i * 3);
    }

    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uAtlas: { value: createFlowerAtlas() } },
      vertexShader: FLOWER_VERTEX,
      fragmentShader: FLOWER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.flowers = this._points(count, { aOrbit: [orbit, 4], aStyle: [style, 4], aTint: [tint, 3] }, material, 4);
  }

  _buildPollen(count) {
    const orbit = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
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
      const intensity = (0.35 + Math.random() * 0.65) * (p.zone === 'core' ? 1.4 : 1);
      colors.set([r * intensity, g * intensity, b * intensity], i * 3);
      sizes[i] = 0.025 + Math.pow(Math.random(), 3) * 0.09;
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POLLEN_VERTEX,
      fragmentShader: POLLEN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pollen = this._points(count, { aOrbit: [orbit, 4], aColor: [colors, 3], aSize: [sizes, 1] }, material, 2);
  }

  _buildNebulae(count) {
    const orbit = new Float32Array(count * 4);
    const style = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tints = [
      [0.9, 0.55, 0.18],
      [0.85, 0.42, 0.22],
      [1.0, 0.78, 0.4],
      [0.7, 0.45, 0.35],
    ];
    for (let i = 0; i < count; i++) {
      let p = this._sample(i, 1.4);
      while (p.zone === 'core') p = this._sample(i, 1.4);
      orbit.set([p.r, p.a, p.h * 0.5, Math.random()], i * 4);
      style.set([3.5 + Math.random() * 4.5, Math.random() * TAU, 0.05 + Math.random() * 0.07], i * 3);
      colors.set(tints[(Math.random() * tints.length) | 0], i * 3);
    }
    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uCloud: { value: createNebulaTexture() } },
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nebulae = this._points(count, { aOrbit: [orbit, 4], aStyle: [style, 3], aColor: [colors, 3] }, material, 1);
  }

  _buildCore() {
    const sprite = (stops, scale, opacity, order) => {
      const material = new THREE.SpriteMaterial({
        map: createGlowTexture(stops),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(material);
      s.scale.setScalar(scale);
      s.renderOrder = order;
      this.object.add(s);
      return s;
    };
    this.halo = sprite(
      [
        [0, 'rgba(255, 200, 110, 0.9)'],
        [0.35, 'rgba(230, 150, 50, 0.25)'],
        [1, 'rgba(200, 110, 20, 0)'],
      ],
      18,
      0.4,
      0,
    );
    this.core = sprite(
      [
        [0, 'rgba(255, 250, 230, 1)'],
        [0.2, 'rgba(255, 220, 140, 0.75)'],
        [0.55, 'rgba(240, 170, 60, 0.15)'],
        [1, 'rgba(240, 170, 60, 0)'],
      ],
      3.4,
      0.95,
      3,
    );
  }

  setViewport(heightPx, fovDeg, pixelRatio) {
    this.uniforms.uSizeScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(dt, bloom, pulse) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uBloom.value = bloom;
    u.uPulse.value = pulse;
    const spread = THREE.MathUtils.lerp(0.34, 1.3, bloom);
    const breathe = 1 + Math.sin(u.uTime.value * 0.9) * 0.04;
    this.core.scale.setScalar(3.4 * (0.75 + 0.25 * spread) * breathe * (1 + pulse * 0.12));
    this.halo.scale.setScalar(18 * spread);
  }
}
