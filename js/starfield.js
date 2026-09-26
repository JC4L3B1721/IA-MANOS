// Cielo de estrellas lejanas que titilan suavemente
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.8) + aPhase * 60.0);
    gl_PointSize = aSize * uPixelRatio;
    vColor = aColor;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.05, d) * vTwinkle);
  }
`;

export class Starfield {
  constructor(count) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = [
      [1.0, 0.96, 0.88],
      [1.0, 0.86, 0.6],
      [0.78, 0.84, 1.0],
    ];
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(150 + Math.random() * 160);
      positions.set([v.x, v.y, v.z], i * 3);
      sizes[i] = Math.random() < 0.03 ? 2.6 + Math.random() * 1.4 : 0.7 + Math.random() * 1.5;
      phases[i] = Math.random();
      const [r, g, b] = palette[Math.random() < 0.7 ? 0 : Math.random() < 0.6 ? 1 : 2];
      const k = 0.35 + Math.random() * 0.65;
      colors.set([r * k, g * k, b * k], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this.uniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 } };
    this.object = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.object.renderOrder = -1;
    this.object.frustumCulled = false;
  }

  setPixelRatio(pixelRatio) {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
    this.object.rotation.y += dt * 0.004;
  }
}
