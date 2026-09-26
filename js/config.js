// Configuración global de Flora.
// La calidad se elige automáticamente según el dispositivo y puede forzarse con ?calidad=alta|media|baja

const params = new URLSearchParams(location.search);
const isCompact = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

const PRESETS = {
  alta: { flowers: 14000, pollen: 28000, nebulae: 70, stars: 7000, maxPixelRatio: 2 },
  media: { flowers: 8000, pollen: 15000, nebulae: 45, stars: 4500, maxPixelRatio: 1.5 },
  baja: { flowers: 4500, pollen: 8000, nebulae: 28, stars: 3000, maxPixelRatio: 1 },
};

const requested = params.get('calidad');
export const QUALITY_NAME = requested in PRESETS ? requested : isCompact ? 'media' : 'alta';
export const QUALITY = PRESETS[QUALITY_NAME];

export const GALAXY = {
  radius: 13,
  arms: 4,
  armTwist: 0.36, // cuánto se enrollan los brazos (rad por unidad de radio)
  armSpread: 0.7, // dispersión de las flores alrededor de cada brazo
  defaultBloom: 0.62, // 0 = capullo recogido · 1 = galaxia totalmente abierta
};

export const CAMERA = {
  fov: 55,
  baseDistance: 25,
  basePitch: 0.62,
  minZoom: 0.45,
  maxZoom: 5,
  autoRotate: 0.02,
};

const MP_VERSION = '0.10.14';
export const MEDIAPIPE = {
  bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  model:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

export const DEBUG = params.has('debug');
