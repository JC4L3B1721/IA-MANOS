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
  inner: 1.9, // radio donde empiezan las flores, fuera del disco de acreción
};

export const BLACK_HOLE = { radius: 0.9, diskInner: 1.25, diskOuter: 4.6, lensStrength: 1.4 };

// Paletas del disco de acreción, el polen y las nebulosas (barrido vertical para cambiar).
// Las flores siempre son amarillas. Colores en HDR lineal: valores > 1 brillan con el bloom.
export const THEMES = [
  {
    name: 'Sol dorado',
    hot: [3.0, 2.6, 2.1], warm: [2.1, 0.95, 0.28], cool: [0.75, 0.2, 0.04],
    pollen: [1, 1, 1], nebula: [1, 1, 1], heat: [2.0, 0.95, 0.3], halo: [1, 1, 1],
  },
  {
    name: 'Eclipse carmesí',
    hot: [3.0, 2.1, 1.7], warm: [2.2, 0.45, 0.2], cool: [0.8, 0.06, 0.05],
    pollen: [1.1, 0.72, 0.62], nebula: [1.15, 0.5, 0.5], heat: [2.2, 0.55, 0.3], halo: [1, 0.6, 0.55],
  },
  {
    name: 'Nebulosa cuántica',
    hot: [2.4, 2.8, 3.2], warm: [0.5, 1.3, 2.4], cool: [0.08, 0.25, 0.9],
    pollen: [0.72, 0.95, 1.3], nebula: [0.45, 0.85, 1.4], heat: [0.8, 1.5, 2.4], halo: [0.6, 0.85, 1.2],
  },
  {
    name: 'Aurora boreal',
    hot: [2.4, 3.0, 2.6], warm: [0.4, 2.0, 1.2], cool: [0.05, 0.5, 0.45],
    pollen: [0.75, 1.15, 0.9], nebula: [0.45, 1.25, 0.95], heat: [0.9, 2.1, 1.3], halo: [0.7, 1.1, 0.9],
  },
  {
    name: 'Plasma violeta',
    hot: [3.0, 2.4, 3.0], warm: [1.8, 0.6, 2.2], cool: [0.45, 0.08, 0.8],
    pollen: [1.05, 0.75, 1.25], nebula: [1.0, 0.55, 1.35], heat: [1.9, 0.8, 2.2], halo: [0.95, 0.7, 1.15],
  },
];

export const CAMERA = {
  fov: 55,
  baseDistance: 25,
  basePitch: 0.62,
  minZoom: 0.45,
  maxZoom: 5,
  autoRotate: 0.02,
  warpFov: 28, // grados extra de campo de visión en el hiperespacio
};

const MP_VERSION = '0.10.14';
export const MEDIAPIPE = {
  bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  model:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

export const DEBUG = params.has('debug');
