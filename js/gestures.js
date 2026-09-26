// Motor de gestos: convierte los 21 puntos de cada mano (MediaPipe) en intenciones estables.
// No depende del DOM ni de WebGL, así que se puede probar con Node (ver tests/).

import { OneEuroFilter } from './one-euro.js';

const WRIST = 0;
const PALM_POINTS = [0, 5, 9, 13, 17];
const FINGER_TIPS = [4, 8, 12, 16, 20];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const remap = (v, inMin, inMax, outMin, outMax) =>
  outMin + clamp((v - inMin) / (inMax - inMin), 0, 1) * (outMax - outMin);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const GESTURES = Object.freeze({
  IDLE: 'idle',
  OPEN: 'open',
  FIST: 'fist',
  PINCH: 'pinch',
  DUAL: 'dual',
  VICTORY: 'victory',
});

// Rasgos geométricos de una mano, invariantes a la distancia de la cámara
// (todo se normaliza por el tamaño de la palma).
export function analyzeHand(lm) {
  const palm = dist(lm[WRIST], lm[9]) || 1e-6;
  let cx = 0;
  let cy = 0;
  for (const i of PALM_POINTS) {
    cx += lm[i].x;
    cy += lm[i].y;
  }
  cx /= PALM_POINTS.length;
  cy /= PALM_POINTS.length;

  const openness = FINGER_TIPS.reduce((sum, i) => sum + dist(lm[i], lm[WRIST]), 0) / FINGER_TIPS.length / palm;
  const pinch = dist(lm[4], lm[8]) / palm;
  // Un dedo está extendido si su punta queda claramente más lejos de la muñeca que su articulación media
  const extended = [8, 12, 16, 20].map((tip) => dist(lm[tip], lm[WRIST]) > dist(lm[tip - 2], lm[WRIST]) * 1.15);

  return {
    x: 1 - cx, // la vista funciona como un espejo
    y: cy,
    palm,
    openness,
    pinch,
    extended,
    victory: extended[0] && extended[1] && !extended[2] && !extended[3],
  };
}

const DEFAULTS = {
  minZoom: 0.45,
  maxZoom: 5,
  defaultBloom: 0.62,
  fistThreshold: 1.2,
  pinchOn: 0.3,
  pinchOff: 0.45,
  debounce: 0.12, // s que un gesto debe mantenerse antes de activarse
  victoryHold: 1.1, // s manteniendo la señal de paz para capturar
  swipeSpeed: 1.8, // anchos de pantalla por segundo
  swipeCooldown: 0.5,
  zoomExponent: 1.3,
  twistGain: 1.4,
};

export class GestureEngine {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.state = {
      mode: GESTURES.IDLE,
      hands: 0,
      zoom: 1, // persistente: se conserva al retirar las manos
      twist: 0, // persistente: giro acumulado alrededor del eje de la galaxia
      tilt: 0, // persistente: inclinación (ratón / táctil)
      bloom: this.opts.defaultBloom,
      yaw: 0, // transitorio: posición horizontal de la mano
      pitch: 0, // transitorio: posición vertical de la mano
      pulse: 0,
      captureProgress: 0,
      cursors: [],
    };
    this._slots = [];
    this._count = 0;
    this._dual = null;
    this._candidate = GESTURES.IDLE;
    this._candidateSince = 0;
    this._pinching = false;
    this._victorySince = null;
    this._victoryLatched = false;
    this._lastSwipe = -Infinity;
    this._prev = null;
  }

  _slot(i) {
    if (!this._slots[i]) {
      this._slots[i] = {
        x: new OneEuroFilter({ minCutoff: 1.4, beta: 2.5 }),
        y: new OneEuroFilter({ minCutoff: 1.4, beta: 2.5 }),
        open: new OneEuroFilter({ minCutoff: 1.0, beta: 0.4 }),
        pinch: new OneEuroFilter({ minCutoff: 2.0, beta: 1.0 }),
      };
    }
    return this._slots[i];
  }

  /**
   * @param {Array<Array<{x:number,y:number}>>} landmarkSets puntos de cada mano en coordenadas de imagen
   * @param {number} t tiempo en segundos
   * @returns {{state: object, events: Array<object>}}
   */
  update(landmarkSets, t) {
    const o = this.opts;
    const s = this.state;
    const events = [];

    // Ordenadas de izquierda a derecha en pantalla para que la identidad de cada mano sea estable
    const hands = landmarkSets.map(analyzeHand).sort((a, b) => a.x - b.x);
    if (hands.length !== this._count) {
      this._slots = [];
      this._prev = null;
      this._dual = null;
      this._count = hands.length;
    }
    hands.forEach((h, i) => {
      const f = this._slot(i);
      h.x = f.x.filter(h.x, t);
      h.y = f.y.filter(h.y, t);
      h.openness = f.open.filter(h.openness, t);
      h.pinch = f.pinch.filter(h.pinch, t);
    });
    s.hands = hands.length;

    // 1. Clasificación instantánea
    let raw = GESTURES.IDLE;
    if (hands.length >= 2) {
      raw = GESTURES.DUAL;
      this._pinching = false;
    } else if (hands.length === 1) {
      const h = hands[0];
      const othersUp = h.extended[1] || h.extended[2] || h.extended[3];
      // Histéresis: cuesta más entrar en el pellizco que mantenerlo
      this._pinching = this._pinching ? h.pinch < o.pinchOff : h.pinch < o.pinchOn && othersUp;
      if (this._pinching) raw = GESTURES.PINCH;
      else if (h.victory) raw = GESTURES.VICTORY;
      else if (h.openness < o.fistThreshold) raw = GESTURES.FIST;
      else raw = GESTURES.OPEN;
    } else {
      this._pinching = false;
    }

    // 2. Anti-rebote: el gesto debe sostenerse unos milisegundos
    if (raw !== this._candidate) {
      this._candidate = raw;
      this._candidateSince = t;
    }
    if (s.mode !== this._candidate && t - this._candidateSince >= o.debounce) {
      events.push({ type: 'mode', from: s.mode, to: this._candidate });
      s.mode = this._candidate;
    }
    const mode = s.mode;

    // 3. Zoom y giro con dos manos (relativo al inicio del gesto: nunca da saltos)
    if (mode === GESTURES.DUAL && hands.length >= 2) {
      const [a, b] = hands;
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (!this._dual) this._dual = { span: Math.max(span, 0.08), angle, zoom: s.zoom, twist: s.twist };
      s.zoom = clamp(this._dual.zoom * Math.pow(span / this._dual.span, o.zoomExponent), o.minZoom, o.maxZoom);
      s.twist = this._dual.twist + wrapAngle(angle - this._dual.angle) * o.twistGain;
    } else {
      this._dual = null;
    }

    // 4. Una mano: floración, orientación y barridos
    const single = hands.length === 1 && mode !== GESTURES.IDLE && mode !== GESTURES.DUAL;
    if (single) {
      const h = hands[0];
      s.yaw = (h.x - 0.5) * 1.2;
      s.pitch = (h.y - 0.5) * 0.7;
      if (mode === GESTURES.OPEN || mode === GESTURES.FIST) s.bloom = remap(h.openness, 0.95, 1.7, 0, 1);
      if (this._prev && mode === GESTURES.OPEN) {
        const dt = t - this._prev.t;
        if (dt > 0 && dt < 0.2) {
          const vx = (h.x - this._prev.x) / dt;
          if (Math.abs(vx) > o.swipeSpeed && t - this._lastSwipe > o.swipeCooldown) {
            events.push({ type: 'swipe', velocity: vx });
            this._lastSwipe = t;
          }
        }
      }
      this._prev = { x: h.x, t };
    } else {
      this._prev = null;
      if (mode === GESTURES.IDLE || mode === GESTURES.DUAL) {
        s.yaw = 0;
        s.pitch = 0;
      }
    }

    // 5. Pellizco → resplandor
    s.pulse = mode === GESTURES.PINCH ? 1 : 0;

    // 6. Señal de paz sostenida → captura (una sola vez por gesto)
    if (mode === GESTURES.VICTORY) {
      if (this._victorySince === null) this._victorySince = t;
      s.captureProgress = this._victoryLatched ? 0 : clamp((t - this._victorySince) / o.victoryHold, 0, 1);
      if (!this._victoryLatched && s.captureProgress >= 1) {
        events.push({ type: 'capture' });
        this._victoryLatched = true;
        s.captureProgress = 0;
      }
    } else {
      this._victorySince = null;
      this._victoryLatched = false;
      s.captureProgress = 0;
    }

    s.cursors = hands.map((h) => ({
      x: h.x,
      y: h.y,
      pinch: clamp(1 - (h.pinch - 0.2) / 0.6, 0, 1),
      open: remap(h.openness, 0.95, 1.7, 0, 1),
    }));

    return { state: s, events };
  }

  resetView() {
    this.state.zoom = 1;
    this.state.twist = 0;
    this.state.tilt = 0;
    this._dual = null;
  }
}
