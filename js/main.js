// Flora · Galaxia de flores — punto de entrada.
// Une el render (Three.js), la visión artificial (MediaPipe), el motor de gestos y la interfaz holográfica.
import * as THREE from 'three';
import { QUALITY, GALAXY, CAMERA, BLACK_HOLE, THEMES, DEBUG } from './config.js';
import { FlowerGalaxy } from './galaxy.js';
import { BlackHole } from './blackhole.js';
import { Starfield } from './starfield.js';
import { PostFX } from './postfx.js';
import { HandTracker } from './hand-tracker.js';
import { GestureEngine, GESTURES } from './gestures.js';
import { AmbientAudio } from './audio.js';
import { UI, GESTURE_COPY } from './ui.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// Suavizado exponencial independiente de los FPS
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ui = new UI(CAMERA);
const canvas = document.getElementById('stage');

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (error) {
  ui.fatal('Tu navegador o tu tarjeta gráfica no soportan WebGL, necesario para dibujar la galaxia.');
  throw error;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#040406');
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.05, 800);

const galaxy = new FlowerGalaxy(QUALITY, GALAXY);
const blackHole = new BlackHole(BLACK_HOLE);
const stars = new Starfield(QUALITY.stars);
scene.add(stars.object, blackHole.object, galaxy.object);
const fx = new PostFX(renderer, scene, camera);

const audio = new AmbientAudio();
const gestures = new GestureEngine({ minZoom: CAMERA.minZoom, maxZoom: CAMERA.maxZoom, defaultBloom: GALAXY.defaultBloom });
const tracker = new HandTracker(ui.video);

// Paletas convertidas a THREE.Color para interpolarlas suavemente
const themes = THEMES.map((t) => ({
  name: t.name,
  ...Object.fromEntries(
    ['hot', 'warm', 'cool', 'pollen', 'nebula', 'heat', 'halo'].map((key) => [key, new THREE.Color(...t[key])]),
  ),
}));
let themeIndex = 0;

let pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY.maxPixelRatio);
let framing = 1; // factor de distancia según la proporción de la pantalla

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  framing = Math.pow(Math.max(1, 1.1 / camera.aspect), 0.9);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  fx.setSize(w, h, pixelRatio);
  galaxy.setViewport(h, camera.fov, pixelRatio);
  stars.setPixelRatio(pixelRatio);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Estado de la vista (valores suavizados que se dibujan)
// ---------------------------------------------------------------------------
const view = {
  zoom: 0.5, bloom: GALAXY.defaultBloom, yaw: 0, pitch: 0, twist: 0, tilt: 0, pulse: 0,
  spin: 0, autoYaw: 0.6, warp: 0, collapse: 0, holo: 0, well: 0,
};
const manual = { bloom: GALAXY.defaultBloom, pulse: 0, warp: 0, collapse: 0 };
const burst = { t: Infinity, power: 1 }; // supernova / Big Bang
const shock = { t: Infinity, power: 1, uv: new THREE.Vector2(), world: new THREE.Vector3() };
const well = { screen: new THREE.Vector2(0.5, 0.5), world: new THREE.Vector3(), uniform: new THREE.Vector4() };
const shockUniform = new THREE.Vector4(0, 0, 0, -1);
const raycaster = new THREE.Raycaster();
const galaxyPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmp = { v: new THREE.Vector3(), ndc: new THREE.Vector2(), right: new THREE.Vector3() };

gestures.state.zoom = 0.7; // vista lejana durante la introducción

let started = false;
let handsActive = false;
let enabling = false;
let holoOn = false;
let captureRequested = false;
let flash = 0;
let lastHandsAt = performance.now();
let simulated = null; // solo en modo ?debug

// Punto del plano de la galaxia bajo una posición de pantalla (0..1)
function screenToGalaxy(x, y, target) {
  tmp.ndc.set(x * 2 - 1, -(y * 2 - 1));
  raycaster.setFromCamera(tmp.ndc, camera);
  if (!raycaster.ray.intersectPlane(galaxyPlane, target)) raycaster.ray.at(camera.position.length(), target);
  return target;
}

function burstCurve() {
  // Sube en 0,15 s y se apaga lentamente
  if (burst.t === Infinity) return 0;
  const v = burst.t < 0.15 ? burst.t / 0.15 : Math.exp(-(burst.t - 0.15) * 1.1);
  return v * burst.power;
}

function triggerBurst(power = 1, label = 'supernova') {
  burst.t = 0;
  burst.power = power;
  flash = Math.max(flash, 0.35 * power);
  audio.boom();
  ui.flashGesture(label);
  ui.log(GESTURE_COPY[label][0]);
  const c = projectToScreen(new THREE.Vector3());
  ui.shock(c.x, c.y, 'gold');
}

function triggerShock(x, y, power = 1, label = 'repulsor') {
  shock.t = 0;
  shock.power = power;
  shock.uv.set(x, 1 - y);
  screenToGalaxy(x, y, shock.world);
  audio.zap();
  ui.shock(x * window.innerWidth, y * window.innerHeight, 'holo');
  ui.flashGesture(label);
  ui.log(GESTURE_COPY[label][0]);
}

function setTheme(index) {
  themeIndex = (index + themes.length) % themes.length;
  const theme = themes[themeIndex];
  ui.setTheme(theme.name);
  ui.flashGesture('theme', 1500, [theme.name, 'Paleta cósmica']);
  ui.log(`Paleta · ${theme.name}`);
  audio.beep(1);
}

function toggleHolo() {
  holoOn = !holoOn;
  ui.setHolo(holoOn);
  ui.log(holoOn ? 'Holograma activado' : 'Holograma desactivado');
  audio.beep(holoOn ? 3 : 1);
}

function runScan() {
  const theme = themes[themeIndex];
  ui.flashGesture('thumbsup');
  ui.log('Escaneo espectral');
  audio.beep(4);
  ui.scan([
    ['Flores catalogadas', QUALITY.flowers.toLocaleString('es')],
    ['Especies', '9'],
    ['Partículas de polen', QUALITY.pollen.toLocaleString('es')],
    ['Masa de la singularidad', '4,3 × 10⁶ M☉'],
    ['Radio del horizonte', `${blackHole.scale.toFixed(2)} u`],
    ['Temperatura del disco', '1,2 × 10⁷ K'],
    ['Paleta', theme.name],
    ['Estado', view.collapse > 0.5 ? 'COLAPSO' : 'Estable'],
  ]);
}

function projectToScreen(point) {
  tmp.v.copy(point).project(camera);
  return { x: (tmp.v.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.v.y * 0.5 + 0.5) * window.innerHeight, ndc: tmp.v.clone() };
}

function enterExperience() {
  if (started) return;
  started = true;
  ui.enter();
  gestures.state.zoom = 1; // la cámara vuela hacia la galaxia
  ui.log('Sistema en línea');
}

async function enableHands() {
  if (handsActive || enabling) return;
  enabling = true;
  const fromIntro = !started;
  if (fromIntro) ui.showSteps();
  else ui.toast('Activando sensores ópticos…');

  ui.setStep('camera', 'active');
  ui.setStep('model', 'active');
  const cameraReady = tracker.startCamera().then(
    () => ui.setStep('camera', 'done'),
    (error) => {
      ui.setStep('camera', 'error');
      throw error;
    },
  );
  const modelReady = tracker.loadModel().then(
    () => ui.setStep('model', 'done'),
    (error) => {
      ui.setStep('model', 'error');
      throw error;
    },
  );

  try {
    await Promise.all([cameraReady, modelReady]);
    ui.setStep('ready', 'active');
    await wait(500);
    ui.setStep('ready', 'done');
    if (fromIntro) await wait(380);
    handsActive = true;
    lastHandsAt = performance.now();
    ui.setInputMode('hands');
    ui.showPreview(true);
    enterExperience();
    ui.log('Seguimiento de manos activo');
    ui.toast('Sensores listos · levanta una mano', 3600);
  } catch (error) {
    tracker.stop();
    if (fromIntro) ui.showIntroError(error.message);
    else ui.toast(error.message, 5000);
  } finally {
    enabling = false;
  }
}

function explore() {
  ui.setInputMode('pointer');
  enterExperience();
  const touch = window.matchMedia('(pointer: coarse)').matches;
  ui.toast(touch ? 'Desliza para orbitar · pellizca para acercar' : 'Arrastra para orbitar · usa la rueda para acercar', 4200);
}

async function toggleSound() {
  const on = await audio.toggle();
  ui.setSound(on);
  ui.toast(on ? 'Sonido ambiental activado' : 'Sonido desactivado');
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function resetView() {
  gestures.resetView();
  manual.bloom = GALAXY.defaultBloom;
  ui.toast('Vista restablecida');
}

// Guarda la imagen con una firma elegante. Debe llamarse justo después de renderizar.
function saveCapture() {
  const source = renderer.domElement;
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(source, 0, 0);

  const s = out.height / 1080;
  const x = 56 * s;
  ctx.fillStyle = 'rgba(244, 238, 220, 0.9)';
  ctx.font = `300 ${Math.round(54 * s)}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText('Flora', x, out.height - 86 * s);
  ctx.fillStyle = 'rgba(233, 196, 106, 0.9)';
  ctx.font = `500 ${Math.round(13 * s)}px Inter, system-ui, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(3.5 * s).toFixed(1)}px`;
  const date = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`GALAXIA DE FLORES · ${themes[themeIndex].name.toUpperCase()} · ${date.toUpperCase()}`, x, out.height - 56 * s);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flora-galaxia-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ui.toast('Imagen guardada');
    ui.log('Captura guardada');
  }, 'image/png');

  flash = 0.85;
  audio.shutter();
}

const MODE_SOUNDS = {
  [GESTURES.PINCH]: () => audio.chime(),
  [GESTURES.HORNS]: () => audio.whoosh(),
  [GESTURES.COLLAPSE]: () => audio.beep(2),
  [GESTURES.CHARGE]: () => audio.beep(2),
  [GESTURES.POINT]: () => audio.beep(1),
};

function handleGestureEvent(event) {
  switch (event.type) {
    case 'mode':
      ui.setGesture(event.to);
      if (event.to === GESTURES.IDLE) manual.bloom = gestures.state.bloom;
      else if (GESTURE_COPY[event.to]) ui.log(GESTURE_COPY[event.to][0]);
      MODE_SOUNDS[event.to]?.();
      if (event.to === GESTURES.SHAKA) toggleHolo();
      if (event.to === GESTURES.THUMBS_UP) runScan();
      break;
    case 'swipe':
      // Mano hacia la derecha → la parte cercana de la galaxia gira hacia la derecha
      view.spin -= clamp(event.velocity, -4, 4) * 0.35;
      ui.flashGesture('swipe');
      audio.chime();
      break;
    case 'swipe-vertical':
      setTheme(themeIndex + event.direction);
      break;
    case 'supernova':
      triggerBurst(1, 'supernova');
      break;
    case 'bigbang':
      triggerBurst(1.25, 'bigbang');
      break;
    case 'repulsor':
      triggerShock(event.x, event.y, 1, 'repulsor');
      break;
    case 'shockwave':
      triggerShock(event.x, event.y, 1.3, 'shockwave');
      burst.t = 0;
      burst.power = 0.6 * event.power;
      audio.boom();
      break;
    case 'capture':
      captureRequested = true;
      break;
  }
}

// ---------------------------------------------------------------------------
// Interfaz: botones y teclado
// ---------------------------------------------------------------------------
ui.on('start', enableHands)
  .on('explore', explore)
  .on('sound', toggleSound)
  .on('camera', () => (handsActive ? ui.togglePreview() : enableHands()))
  .on('capture', () => (captureRequested = true))
  .on('holo', toggleHolo)
  .on('theme', () => setTheme(themeIndex + 1))
  .on('fullscreen', toggleFullscreen)
  .on('help', () => ui.openHelp());

window.addEventListener('keydown', (e) => {
  if (!started || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('dialog')) return;
  if (e.repeat && !['arrowup', 'arrowdown'].includes(e.key.toLowerCase())) return;
  switch (e.key.toLowerCase()) {
    case 'f': toggleFullscreen(); break;
    case 's': case 'p': captureRequested = true; break;
    case 'm': toggleSound(); break;
    case 'c': handsActive ? ui.togglePreview() : enableHands(); break;
    case 'h': ui.toggleChrome(); break;
    case 'r': resetView(); break;
    case 'n': triggerBurst(1, 'supernova'); break;
    case 'x': manual.collapse = 1; ui.flashGesture('collapse', 99999); audio.beep(2); break;
    case 'w': manual.warp = 1; ui.flashGesture('horns', 99999); audio.whoosh(); break;
    case 't': setTheme(themeIndex + 1); break;
    case 'g': toggleHolo(); break;
    case 'j': runScan(); break;
    case '?': case '/': ui.openHelp(); break;
    case 'arrowup': manual.bloom = clamp(manual.bloom + 0.08, 0, 1); break;
    case 'arrowdown': manual.bloom = clamp(manual.bloom - 0.08, 0, 1); break;
    case ' ': manual.pulse = 1; e.preventDefault(); break;
    default: return;
  }
});
window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === ' ') manual.pulse = 0;
  if (key === 'w') {
    manual.warp = 0;
    ui.flashGesture('horns', 10);
  }
  if (key === 'x' && manual.collapse) {
    manual.collapse = 0;
    ui.flashGesture('collapse', 10);
    triggerBurst(1.25, 'bigbang');
  }
});

document.addEventListener('visibilitychange', () => audio.suspend(document.hidden));

// ---------------------------------------------------------------------------
// Ratón y pantalla táctil (siempre disponibles, también con la cámara activa)
// ---------------------------------------------------------------------------
const pointers = new Map();
let pinchStart = null;
let holdTimer = null;
let downAt = null;

const pointerSpan = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y) || 1;
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downAt = { x: e.clientX, y: e.clientY };
  clearTimeout(holdTimer);
  if (pointers.size === 1) holdTimer = setTimeout(() => (manual.pulse = 1), 320);
  if (pointers.size === 2) pinchStart = { span: pointerSpan(), zoom: gestures.state.zoom };
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  const s = gestures.state;
  if (pointers.size === 1) {
    s.twist -= dx * 0.005;
    s.tilt = clamp(s.tilt + dy * 0.003, -0.5, 0.75);
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) clearTimeout(holdTimer);
  } else if (pointers.size === 2 && pinchStart) {
    s.zoom = clamp((pinchStart.zoom * pointerSpan()) / pinchStart.span, CAMERA.minZoom, CAMERA.maxZoom);
  }
});

const releasePointer = (e) => {
  pointers.delete(e.pointerId);
  clearTimeout(holdTimer);
  manual.pulse = 0;
  if (pointers.size < 2) pinchStart = null;
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('dblclick', () => triggerBurst(1, 'supernova'));

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const s = gestures.state;
    s.zoom = clamp(s.zoom * Math.exp(-e.deltaY * 0.0015), CAMERA.minZoom, CAMERA.maxZoom);
  },
  { passive: false },
);

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const perf = { frames: 0, time: 0, fps: 60, strikes: 0 };

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 1 / 20);
  const now = performance.now();
  const g = gestures.state;

  // 1. Visión artificial → gestos
  const tracking = handsActive || simulated !== null;
  if (tracking) {
    const landmarks = simulated ?? tracker.detect();
    if (landmarks) {
      const { events } = gestures.update(landmarks, now / 1000);
      events.forEach(handleGestureEvent);
      if (!simulated) ui.drawPreview(tracker.video, landmarks);
      if (landmarks.length) lastHandsAt = now;
    }
  }
  const mode = tracking ? g.mode : GESTURES.IDLE;
  const idle = mode === GESTURES.IDLE;
  const singleHand = !idle && mode !== GESTURES.DUAL && mode !== GESTURES.CHARGE && mode !== GESTURES.COLLAPSE;

  // 2. Objetivos → valores suavizados
  if (idle) manual.bloom = damp(manual.bloom, GALAXY.defaultBloom, 0.12, dt);
  const targetPulse = Math.max(tracking ? g.pulse : 0, manual.pulse);
  const targetWarp = Math.max(tracking ? g.warp : 0, manual.warp);
  const targetCollapse = Math.max(tracking ? g.collapse : 0, manual.collapse);
  view.zoom = damp(view.zoom, g.zoom, 3.2, dt);
  view.bloom = damp(view.bloom, idle ? manual.bloom : g.bloom, 2.2, dt);
  view.yaw = damp(view.yaw, singleHand ? g.yaw : 0, 2.5, dt);
  view.pitch = damp(view.pitch, singleHand ? g.pitch : 0, 2.5, dt);
  view.twist = damp(view.twist, g.twist, 5, dt);
  view.tilt = damp(view.tilt, g.tilt, 5, dt);
  view.pulse = damp(view.pulse, targetPulse, targetPulse > view.pulse ? 8 : 2.5, dt);
  view.warp = damp(view.warp, targetWarp, targetWarp > view.warp ? 1.6 : 3, dt);
  view.collapse = damp(view.collapse, targetCollapse, targetCollapse > view.collapse ? 1.1 : 5, dt);
  view.holo = damp(view.holo, holoOn ? 1 : 0, 4, dt);
  view.spin *= Math.exp(-1.1 * dt);
  view.autoYaw += dt * (CAMERA.autoRotate + view.spin + view.warp * 0.9);
  if (burst.t !== Infinity) burst.t = burst.t > 6 ? Infinity : burst.t + dt;
  if (shock.t !== Infinity) shock.t = shock.t > 1.4 ? Infinity : shock.t + dt;
  const burstValue = burstCurve();

  // 3. Cámara en órbita alrededor de la singularidad (el hiperespacio abre el campo de visión)
  const fov = CAMERA.fov + view.warp * CAMERA.warpFov;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    galaxy.setViewport(window.innerHeight, fov, pixelRatio);
  }
  const t = clock.elapsedTime;
  const distance = ((CAMERA.baseDistance * framing) / view.zoom) * (1 - view.warp * 0.25);
  const yaw = view.autoYaw + view.twist + view.yaw;
  const pitch = clamp(CAMERA.basePitch + view.tilt + view.pitch + Math.sin(t * 0.07) * 0.06, 0.08, 1.4);
  camera.position.set(
    distance * Math.cos(pitch) * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // 4. Pozo de gravedad del índice
  const pointer = tracking ? g.pointer : null;
  if (pointer) {
    well.screen.x = damp(well.screen.x, pointer.x, 12, dt);
    well.screen.y = damp(well.screen.y, pointer.y, 12, dt);
    screenToGalaxy(well.screen.x, well.screen.y, well.world);
  }
  view.well = damp(view.well, pointer ? 1 : 0, pointer ? 4 : 2, dt);
  well.uniform.set(well.world.x, well.world.y, well.world.z, view.well);

  // 5. Onda expansiva
  const shockProgress = shock.t === Infinity ? -1 : shock.t / 1.4;
  shockUniform.set(shock.world.x, shock.world.y, shock.world.z, shockProgress);
  fx.setShock(shock.uv.x, shock.uv.y, shockProgress, shock.power);

  // 6. Paleta
  const theme = themes[themeIndex];
  const themeK = 1 - Math.exp(-2.5 * dt);
  galaxy.setTheme(theme, themeK);
  blackHole.setTheme(theme, themeK);

  // 7. Render
  galaxy.update(dt, {
    bloom: view.bloom,
    pulse: view.pulse,
    burst: burstValue,
    collapse: view.collapse,
    well: well.uniform,
    shock: shockUniform,
  });
  blackHole.update(dt, camera, { collapse: view.collapse, burst: burstValue });
  stars.update(dt * (1 + view.warp * 6));

  // Lente gravitacional centrada en la singularidad
  const center = projectToScreen(new THREE.Vector3());
  tmp.right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(blackHole.scale);
  const edge = projectToScreen(tmp.right);
  const radiusPx = Math.hypot(edge.x - center.x, edge.y - center.y);
  fx.setLens(
    tmp.ndc.set(center.x / window.innerWidth, 1 - center.y / window.innerHeight),
    radiusPx / window.innerHeight,
    BLACK_HOLE.lensStrength * (1 + view.collapse * 0.8),
  );
  fx.update(dt, { flash, pulse: view.pulse, warp: view.warp, holo: view.holo, burst: burstValue });
  flash = Math.max(0, flash - dt * 2.2);
  fx.render();
  if (captureRequested) {
    captureRequested = false;
    saveCapture();
  }

  // 8. Interfaz holográfica
  ui.updateCursors(tracking ? g.cursors : [], mode, view.zoom, g.captureProgress);
  ui.drawHolo(tracking ? g.skeletons : [], mode);
  ui.updateOrb(tracking ? g.orb : null, g.charge);
  ui.updateSingularity(center.x, center.y, radiusPx, blackHole.scale);
  ui.showHint(handsActive && now - lastHandsAt > 4500);
  ui.setMetrics({
    zoom: view.zoom,
    bloom: view.bloom,
    hands: tracking ? g.hands : null,
    latency: handsActive ? tracker.latency : null,
    fps: perf.fps,
  });
  audio.setMood(view.bloom, view.zoom);

  // 9. Resolución dinámica: si la GPU no llega a 40 fps, se reduce la densidad de píxeles
  perf.frames++;
  perf.time += rawDt;
  if (perf.time >= 1) {
    perf.fps = perf.frames / perf.time;
    perf.frames = 0;
    perf.time = 0;
    perf.strikes = perf.fps < 40 && pixelRatio > 1 ? perf.strikes + 1 : 0;
    if (perf.strikes >= 2) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      perf.strikes = 0;
      resize();
    }
  }
}
frame();

if (DEBUG) {
  window.flora = {
    gestures,
    view,
    simulate(landmarkSets) {
      simulated = landmarkSets;
    },
    stopSimulation() {
      simulated = null;
    },
    emit: handleGestureEvent,
  };
}
