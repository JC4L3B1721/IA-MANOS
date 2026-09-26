// Post-procesado cinematográfico:
// lente gravitacional + ondas de choque → bloom → tone mapping ACES → hiperespacio, holograma,
// aberración cromática, viñeta y grano de película.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// La luz que pasa cerca de la singularidad se curva: el fondo se deforma formando un anillo de Einstein
const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadius: { value: 0.05 },
    uAspect: { value: 1 },
    uStrength: { value: 1.4 },
    uShock: { value: new THREE.Vector4(0.5, 0.5, -1, 0) }, // x, y, progreso, potencia
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uStrength;
    uniform vec4 uShock;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - uCenter;
      d.x *= uAspect;
      float r = length(d);
      vec2 dir = d / max(r, 1e-4);
      float bend = uStrength * uRadius * uRadius / max(r, uRadius * 0.6);
      bend *= smoothstep(uRadius * 0.85, uRadius * 1.5, r);
      vec2 offset = dir * bend;
      offset.x /= uAspect;
      uv -= offset;

      // Onda de choque: un anillo que refracta la imagen al expandirse
      if (uShock.z >= 0.0 && uShock.z < 1.0) {
        vec2 s = vUv - uShock.xy;
        s.x *= uAspect;
        float sr = length(s);
        float radius = uShock.z * 0.9;
        float ring = exp(-pow((sr - radius) * 22.0, 2.0)) * (1.0 - uShock.z) * uShock.w;
        vec2 sd = s / max(sr, 1e-4);
        sd.x /= uAspect;
        uv -= sd * ring * 0.035;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.02 },
    uAberration: { value: 0.0012 },
    uFlash: { value: 0 },
    uWarp: { value: 0 },
    uHolo: { value: 0 },
    uHole: { value: new THREE.Vector3(0.5, 0.5, 0) }, // centro (uv) y radio del horizonte
    uAspect: { value: 1 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uFlash;
    uniform float uWarp;
    uniform float uHolo;
    uniform vec3 uHole;
    uniform float uAspect;
    varying vec2 vUv;
    // Hash sin senos (Dave Hoskins): grano uniforme, sin tramas visibles
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      vec2 offset = dir * (uAberration + uWarp * 0.004) * dist * dist * 4.0; // solo en los bordes
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + offset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - offset).b
      );
      // Hiperespacio: desenfoque radial que convierte las estrellas en estelas
      if (uWarp > 0.01) {
        vec3 streak = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float k = float(i) / 11.0;
          streak += texture2D(tDiffuse, 0.5 + dir * (1.0 - k * 0.22 * uWarp)).rgb;
        }
        color = mix(color, streak / 12.0 * 1.25, smoothstep(0.0, 0.35, dist) * uWarp);
      }
      // Sombra del horizonte: la luz no escapa, ni siquiera el resplandor del bloom
      vec2 hd = vUv - uHole.xy;
      hd.x *= uAspect;
      color *= mix(0.06, 1.0, smoothstep(uHole.z * 0.78, uHole.z * 0.99, length(hd)));
      // Modo holograma: tinte cian y líneas de barrido
      if (uHolo > 0.01) {
        float lines = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.6 + uTime * 6.0);
        color = mix(color, color * vec3(0.78, 1.02, 1.18) * lines, uHolo * 0.55);
      }
      color *= mix(0.5, 1.0, smoothstep(0.85, 0.2, dist * uVignette));
      color += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
      color = mix(color, vec3(1.0, 0.97, 0.9), uFlash);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.lens.uniforms.uAspect.value = width / height;
    this.finish.uniforms.uAspect.value = width / height;
  }

  // center: posición de la singularidad en coordenadas UV · radius: radio del horizonte en unidades de alto
  setLens(center, radius, strength) {
    const u = this.lens.uniforms;
    u.uCenter.value.copy(center);
    u.uRadius.value = radius;
    u.uStrength.value = strength;
    this.finish.uniforms.uHole.value.set(center.x, center.y, radius);
  }

  setShock(x, y, progress, power) {
    this.lens.uniforms.uShock.value.set(x, y, progress, power);
  }

  update(dt, { flash = 0, pulse = 0, warp = 0, holo = 0, burst = 0 } = {}) {
    const u = this.finish.uniforms;
    u.uTime.value += dt;
    u.uFlash.value = flash;
    u.uWarp.value = warp;
    u.uHolo.value = holo;
    this.bloom.strength = 0.8 + pulse * 0.12 + burst * 0.5;
  }

  render() {
    this.composer.render();
  }
}
