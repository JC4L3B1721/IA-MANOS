// Flora · Galaxia de flores — punto de entrada.
// Une el render (Three.js), la visión artificial (MediaPipe), el motor de gestos y la interfaz.
import * as THREE from 'three';
import { QUALITY, GALAXY, CAMERA, DEBUG } from './config.js';
import { FlowerGalaxy } from './galaxy.js';
import { Starfield } from './starfield.js';
import { PostFX } from './postfx.js';
import { HandTracker } from './hand-tracker.js';
import { GestureEngine, GESTURES } from './gestures.js';
import { AmbientAudio } from './audio.js';
import { UI } from './ui.js';

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
const stars = new Starfield(QUALITY.stars);
scene.add(stars.object, galaxy.object);
const fx = new PostFX(renderer, scene, camera);

const audio = new AmbientAudio();
const gestures = new GestureEngine({ minZoom: CAMERA.minZoom, maxZoom: CAMERA.maxZoom, defaultBloom: GALAXY.defaultBloom });
const tracker = new HandTracker(ui.video);

let pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY.maxPixelRatio);
let framing = 1; // factor de distancia según la proporción de la pantalla

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  framing = Math.pow(Math.max(1, 1.1 / camera.aspect), 0.9);
  camera.updateProjectionMatrix();
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
const view = { zoom: 0.5, bloom: GALAXY.defaultBloom, yaw: 0, pitch: 0, twist: 0, tilt: 0, pulse: 0, spin: 0, autoYaw: 0.6 };
const manual = { bloom: GALAXY.defaultBloom, pulse: 0 };
gestures.state.zoom = 0.7; // vista lejana durante la introducción

let started = false;
let handsActive = false;
let enabling = false;
let captureRequested = false;
let flash = 0;
let lastHandsAt = performance.now();
let simulated = null; // solo en modo ?debug

function enterExperience() {
  if (started) return;
  started = true;
  ui.enter();
  gestures.state.zoom = 1; // la cámara vuela hacia la galaxia
}

async function enableHands() {
  if (handsActive || enabling) return;
  enabling = true;
  const fromIntro = !started;
  if (fromIntro) ui.showSteps();
  else ui.toast('Activando la cámara…');

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
    ui.toast('Cámara lista · levanta una mano', 3600);
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
  ctx.fillText(`GALAXIA DE FLORES · ${date.toUpperCase()}`, x, out.height - 56 * s);

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
  }, 'image/png');

  flash = 0.85;
  audio.shutter();
}

function handleGestureEvent(event) {
  switch (event.type) {
    case 'mode':
      ui.setGesture(event.to);
      if (event.to === GESTURES.IDLE) manual.bloom = gestures.state.bloom;
      if (event.to === GESTURES.PINCH) audio.chime();
      break;
    case 'swipe':
      // Mano hacia la derecha → la parte cercana de la galaxia gira hacia la derecha
      view.spin -= clamp(event.velocity, -4, 4) * 0.35;
      ui.flashGesture('swipe');
      audio.chime();
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
  .on('fullscreen', toggleFullscreen)
  .on('help', () => ui.openHelp());

window.addEventListener('keydown', (e) => {
  if (!started || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('dialog')) return;
  switch (e.key.toLowerCase()) {
    case 'f': toggleFullscreen(); break;
    case 's': case 'p': captureRequested = true; break;
    case 'm': toggleSound(); break;
    case 'c': handsActive ? ui.togglePreview() : enableHands(); break;
    case 'h': ui.toggleChrome(); break;
    case 'r': resetView(); break;
    case '?': case '/': ui.openHelp(); break;
    case 'arrowup': manual.bloom = clamp(manual.bloom + 0.08, 0, 1); break;
    case 'arrowdown': manual.bloom = clamp(manual.bloom - 0.08, 0, 1); break;
    case ' ': manual.pulse = 1; e.preventDefault(); break;
    default: return;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') manual.pulse = 0;
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
  const singleHand = !idle && mode !== GESTURES.DUAL;

  // 2. Objetivos → valores suavizados
  if (idle) manual.bloom = damp(manual.bloom, GALAXY.defaultBloom, 0.12, dt);
  const targetPulse = Math.max(tracking ? g.pulse : 0, manual.pulse);
  view.zoom = damp(view.zoom, g.zoom, 3.2, dt);
  view.bloom = damp(view.bloom, idle ? manual.bloom : g.bloom, 2.2, dt);
  view.yaw = damp(view.yaw, singleHand ? g.yaw : 0, 2.5, dt);
  view.pitch = damp(view.pitch, singleHand ? g.pitch : 0, 2.5, dt);
  view.twist = damp(view.twist, g.twist, 5, dt);
  view.tilt = damp(view.tilt, g.tilt, 5, dt);
  view.pulse = damp(view.pulse, targetPulse, targetPulse > view.pulse ? 8 : 2.5, dt);
  view.spin *= Math.exp(-1.1 * dt);
  view.autoYaw += dt * (CAMERA.autoRotate + view.spin);

  // 3. Cámara en órbita alrededor del núcleo
  const t = clock.elapsedTime;
  const distance = (CAMERA.baseDistance * framing) / view.zoom;
  const yaw = view.autoYaw + view.twist + view.yaw;
  const pitch = clamp(CAMERA.basePitch + view.tilt + view.pitch + Math.sin(t * 0.07) * 0.06, 0.08, 1.4);
  camera.position.set(
    distance * Math.cos(pitch) * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(0, 0, 0);

  // 4. Render
  galaxy.update(dt, view.bloom, view.pulse);
  stars.update(dt);
  fx.update(dt, { flash, pulse: view.pulse });
  flash = Math.max(0, flash - dt * 2.2);
  fx.render();
  if (captureRequested) {
    captureRequested = false;
    saveCapture();
  }

  // 5. Interfaz
  ui.updateCursors(tracking ? g.cursors : [], mode, view.zoom, g.captureProgress);
  ui.showHint(handsActive && now - lastHandsAt > 4500);
  ui.setMetrics({
    zoom: view.zoom,
    bloom: view.bloom,
    hands: tracking ? g.hands : null,
    latency: handsActive ? tracker.latency : null,
    fps: perf.fps,
  });
  audio.setMood(view.bloom, view.zoom);

  // 6. Resolución dinámica: si la GPU no llega a 40 fps, se reduce la densidad de píxeles
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
  };
}
