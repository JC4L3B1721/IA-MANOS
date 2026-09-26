// Singularidad central: sombra del horizonte de sucesos, disco de acreción turbulento
// con efecto Doppler y la imagen deformada del disco que la gravedad curva alrededor (anillo de fotones).
import * as THREE from 'three';

// Ruido periódico en x: permite texturas que dan la vuelta completa al disco sin costuras
const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float pnoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, period);
    float x1 = mod(i.x + 1.0, period);
    float a = hash21(vec2(x0, i.y));
    float b = hash21(vec2(x1, i.y));
    float c = hash21(vec2(x0, i.y + 1.0));
    float d = hash21(vec2(x1, i.y + 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float pfbm(vec2 p, float period) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * pnoise(p, period);
      p *= 2.0;
      period *= 2.0;
      amp *= 0.5;
    }
    return v;
  }
`;

const DISK_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DISK_FRAGMENT = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uIntensity;
  uniform vec3 uHot;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec2 uCam; // dirección hacia la cámara en el plano del disco
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float ang = atan(vPos.y, vPos.x);
    // Rotación kepleriana (más rápida por dentro). Dos capas que se relevan evitan que
    // el patrón se enrolle infinitamente con el tiempo.
    float omega = 2.4 / (0.35 + t * 2.6);
    float ph1 = fract(uTime * 0.08);
    float ph2 = fract(uTime * 0.08 + 0.5);
    float period = 10.0;
    float y = r * 9.0;
    float n1 = pfbm(vec2((ang - omega * ph1 * 12.5) / 6.28318 * period, y), period);
    float n2 = pfbm(vec2((ang - omega * ph2 * 12.5) / 6.28318 * period, y + 7.3), period);
    float n = mix(n2, n1, 1.0 - abs(ph1 * 2.0 - 1.0));
    float streaks = pow(n, 1.7) * 2.0;

    vec3 col = mix(uHot, uWarm, smoothstep(0.0, 0.14, t) * (0.55 + 0.45 * n));
    col = mix(col, uCool, smoothstep(0.3, 1.0, t));
    float edge = smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.4, 1.0, t));
    // Beaming relativista: el lado que se acerca a la cámara brilla más
    float beam = 1.0 + 0.7 * dot(vec2(sin(ang), -cos(ang)), uCam);
    float intensity = edge * (0.25 + streaks) * (1.9 - t * 1.3) * beam * uIntensity * 0.38;
    gl_FragColor = vec4(col * intensity, 1.0);
  }
`;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform float uEdgeOn;
  uniform vec3 uHot;
  uniform vec3 uWarm;
  varying vec2 vP;
  void main() {
    float d = length(vP);
    float ang = atan(vP.y, vP.x);
    // Anillo de fotones: luz que orbita justo fuera del horizonte
    float ring = exp(-pow((d - 1.05) / 0.022, 2.0)) * 1.8 + exp(-pow((d - 1.07) / 0.1, 2.0)) * 0.4;
    // Imagen curvada de la cara oculta del disco, que asoma por encima y por debajo de la sombra
    float n = pfbm(vec2((ang + uTime * 0.7) / 6.28318 * 10.0, d * 7.0), 10.0);
    float arc = exp(-pow((d - 1.3) / (0.18 + 0.1 * n), 2.0)) * (0.3 + 0.7 * abs(sin(ang)));
    arc *= (0.3 + 0.7 * uEdgeOn) * (0.45 + n);
    vec3 col = uHot * ring + mix(uWarm, uHot, 0.35) * arc * 1.3;
    col *= smoothstep(0.985, 1.01, d);
    gl_FragColor = vec4(col * uIntensity * 0.55, 1.0);
  }
`;

export class BlackHole {
  constructor({ radius = 0.9, diskInner = 1.25, diskOuter = 4.6 } = {}) {
    this.radius = radius;
    this.object = new THREE.Group();
    this.colors = {
      hot: new THREE.Color(3.0, 2.6, 2.1),
      warm: new THREE.Color(2.1, 0.95, 0.28),
      cool: new THREE.Color(0.75, 0.2, 0.04),
    };

    // Sombra: disco negro que siempre mira a la cámara y escribe profundidad,
    // así oculta todo lo que queda detrás (flores, polen, estrellas)
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.shadow.renderOrder = 0;

    this.diskUniforms = {
      uTime: { value: 0 },
      uInner: { value: diskInner },
      uOuter: { value: diskOuter },
      uIntensity: { value: 1 },
      uHot: { value: this.colors.hot },
      uWarm: { value: this.colors.warm },
      uCool: { value: this.colors.cool },
      uCam: { value: new THREE.Vector2(0, 1) },
    };
    this.disk = new THREE.Mesh(
      new THREE.RingGeometry(diskInner, diskOuter, 192, 6),
      new THREE.ShaderMaterial({
        uniforms: this.diskUniforms,
        vertexShader: DISK_VERTEX,
        fragmentShader: DISK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.disk.rotation.x = -Math.PI / 2;
    this.disk.renderOrder = 1;

    this.haloUniforms = {
      uTime: this.diskUniforms.uTime,
      uIntensity: { value: 1 },
      uEdgeOn: { value: 0.5 },
      uHot: { value: this.colors.hot },
      uWarm: { value: this.colors.warm },
    };
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.ShaderMaterial({
        uniforms: this.haloUniforms,
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halo.renderOrder = 2;

    this.object.add(this.shadow, this.disk, this.halo);
    this.object.scale.setScalar(radius);
    this._camLocal = new THREE.Vector3();
  }

  setTheme(theme, k) {
    this.colors.hot.lerp(theme.hot, k);
    this.colors.warm.lerp(theme.warm, k);
    this.colors.cool.lerp(theme.cool, k);
  }

  // Radio actual del horizonte en unidades del mundo
  get scale() {
    return this.object.scale.x;
  }

  update(dt, camera, { collapse = 0, burst = 0 } = {}) {
    this.diskUniforms.uTime.value += dt * (1 + collapse * 1.5);
    const scale = this.radius * (1 + collapse * 0.55) * (1 + burst * 0.15);
    this.object.scale.setScalar(scale);

    this.shadow.quaternion.copy(camera.quaternion);
    this.halo.quaternion.copy(camera.quaternion);

    // Dirección de la cámara en el plano del disco (coordenadas locales del anillo)
    this.disk.updateMatrixWorld();
    this._camLocal.copy(camera.position);
    this.disk.worldToLocal(this._camLocal);
    this.diskUniforms.uCam.value.set(this._camLocal.x, this._camLocal.y).normalize();

    const toCamera = camera.position.clone().normalize();
    this.haloUniforms.uEdgeOn.value = 1 - Math.abs(toCamera.y);
    const intensity = 1 + collapse * 1.4 + burst * 2.5;
    this.diskUniforms.uIntensity.value = intensity;
    this.haloUniforms.uIntensity.value = intensity;
  }
}
