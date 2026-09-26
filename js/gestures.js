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
  // Una mano
  OPEN: 'open',
  FIST: 'fist',
  PINCH: 'pinch',
  VICTORY: 'victory',
  POINT: 'point',
  HORNS: 'horns',
  SHAKA: 'shaka',
  THUMBS_UP: 'thumbsup',
  // Dos manos
  DUAL: 'dual',
  CHARGE: 'charge',
  COLLAPSE: 'collapse',
});

const G = GESTURES;
export const TWO_HAND_MODES = new Set([G.DUAL, G.CHARGE, G.COLLAPSE]);

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
  const thumbOut = dist(lm[4], lm[9]) / palm > 0.85;
  let highest = Infinity;
  for (let i = 5; i < 21; i++) highest = Math.min(highest, lm[i].y);
  const thumbUp = lm[4].y < highest - 0.25 * palm;

  // Postura de los dedos (el pellizco y la apertura se deciden después, con histéresis)
  const [index, middle, ring, pinky] = extended;
  let pose = 'open';
  if (!index && !middle && !ring && !pinky) pose = thumbUp ? 'thumbsup' : 'closed';
  else if (index && !middle && !ring && pinky) pose = 'horns';
  else if (!index && !middle && !ring && pinky && thumbOut) pose = 'shaka';
  else if (index && middle && !ring && !pinky) pose = 'victory';
  else if (index && !middle && !ring && !pinky) pose = 'point';

  return {
    x: 1 - cx, // la vista funciona como un espejo
    y: cy,
    tip: { x: 1 - lm[8].x, y: lm[8].y },
    palm,
    openness,
    pinch,
    extended,
    pose,
    victory: pose === 'victory',
    lm,
  };
}

const DEFAULTS = {
  minZoom: 0.45,
  maxZoom: 5,
  defaultBloom: 0.62,
  fistThreshold: 1.2,
  openThreshold: 1.4,
  pinchOn: 0.3,
  pinchOff: 0.45,
  debounce: 0.12, // s que un gesto debe mantenerse antes de activarse
  victoryHold: 1.1, // s manteniendo la señal de paz para capturar
  swipeSpeed: 1.8, // pantallas por segundo
  swipeCooldown: 0.5,
  zoomExponent: 1.3,
  twistGain: 1.4,
  chargeSpan: 0.2, // manos casi juntas
  chargeTime: 1.2, // s para cargar al 100 %
  collapseHold: 0.8, // s de colapso para provocar un Big Bang al soltar
  supernovaHold: 0.35, // s mínimos de puño
  supernovaWindow: 0.35, // s máximos para abrir la mano
  supernovaOpen: 1.5,
  repulsorGrowth: 1.28, // la palma crece un 28 % (empuje hacia la cámara)
  repulsorCooldown: 0.9,
};

export class GestureEngine {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.state = {
      mode: G.IDLE,
      hands: 0,
      zoom: 1, // persistente: se conserva al retirar las manos
      twist: 0, // persistente: giro acumulado alrededor del eje de la galaxia
      tilt: 0, // persistente: inclinación (ratón / táctil)
      bloom: this.opts.defaultBloom,
      yaw: 0, // transitorio: posición horizontal de la mano
      pitch: 0, // transitorio: posición vertical de la mano
      pulse: 0,
      warp: 0,
      collapse: 0,
      charge: 0,
      pointer: null,
      orb: null,
      captureProgress: 0,
      cursors: [],
      skeletons: [],
    };
    this._slots = [];
    this._count = 0;
    this._lastT = null;
    this._dual = null;
    this._candidate = G.IDLE;
    this._candidateSince = 0;
    this._modeSince = 0;
    this._pinching = false;
    this._victorySince = null;
    this._victoryLatched = false;
    this._lastSwipe = -Infinity;
    this._lastRepulsor = -Infinity;
    this._prev = null;
    this._palmHistory = [];
    this._fistSince = null;
    this._fistLast = null;
  }

  _slot(i) {
    if (!this._slots[i]) {
      const f = (minCutoff, beta) => new OneEuroFilter({ minCutoff, beta });
      this._slots[i] = {
        x: f(1.4, 2.5),
        y: f(1.4, 2.5),
        tx: f(1.6, 3),
        ty: f(1.6, 3),
        open: f(1.0, 0.4),
        pinch: f(2.0, 1.0),
        palm: f(2.5, 2),
        skeleton: Array.from({ length: 21 }, () => ({ x: f(1.8, 3), y: f(1.8, 3) })),
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
    const dt = this._lastT === null ? 0 : clamp(t - this._lastT, 0, 0.25);
    this._lastT = t;

    // Ordenadas de izquierda a derecha en pantalla para que la identidad de cada mano sea estable
    const hands = landmarkSets.map(analyzeHand).sort((a, b) => a.x - b.x);
    if (hands.length !== this._count) {
      this._slots = [];
      this._prev = null;
      this._dual = null;
      this._palmHistory = [];
      this._count = hands.length;
    }
    hands.forEach((h, i) => {
      const f = this._slot(i);
      h.x = f.x.filter(h.x, t);
      h.y = f.y.filter(h.y, t);
      h.tip = { x: f.tx.filter(h.tip.x, t), y: f.ty.filter(h.tip.y, t) };
      h.openness = f.open.filter(h.openness, t);
      h.pinchRaw = h.pinch;
      h.pinch = f.pinch.filter(h.pinch, t);
      h.palm = f.palm.filter(h.palm, t);
      h.skeleton = h.lm.map((p, j) => ({ x: f.skeleton[j].x.filter(1 - p.x, t), y: f.skeleton[j].y.filter(p.y, t) }));
    });
    s.hands = hands.length;

    // 1. Clasificación instantánea
    let raw = G.IDLE;
    let span = 0;
    if (hands.length >= 2) {
      this._pinching = false;
      const [a, b] = hands;
      span = Math.hypot(b.x - a.x, b.y - a.y);
      const closed = (h) => h.openness < o.fistThreshold && h.pose !== 'thumbsup';
      if (closed(a) && closed(b)) raw = G.COLLAPSE;
      else if (a.openness > o.openThreshold && b.openness > o.openThreshold && span < o.chargeSpan) raw = G.CHARGE;
      else raw = G.DUAL;
    } else if (hands.length === 1) {
      const h = hands[0];
      const othersUp = h.extended[1] || h.extended[2] || h.extended[3];
      // Histéresis: cuesta más entrar en el pellizco que mantenerlo
      this._pinching = this._pinching ? h.pinchRaw < o.pinchOff : h.pinchRaw < o.pinchOn && othersUp;
      if (this._pinching) raw = G.PINCH;
      else if (h.pose === 'thumbsup') raw = G.THUMBS_UP;
      else if (h.pose === 'horns') raw = G.HORNS;
      else if (h.pose === 'shaka') raw = G.SHAKA;
      else if (h.pose === 'victory') raw = G.VICTORY;
      else if (h.pose === 'point') raw = G.POINT;
      else if (h.openness < o.fistThreshold) raw = G.FIST;
      else raw = G.OPEN;
    } else {
      this._pinching = false;
    }

    // 2. Supernova: puño sostenido que se abre de golpe (se detecta sobre la señal cruda, sin anti-rebote)
    if (hands.length === 1) {
      const h = hands[0];
      if (raw === G.FIST) {
        if (this._fistSince === null) this._fistSince = t;
        this._fistLast = t;
      } else if (this._fistSince !== null) {
        if (raw === G.OPEN && h.openness > o.supernovaOpen) {
          if (t - this._fistLast <= o.supernovaWindow && this._fistLast - this._fistSince >= o.supernovaHold) {
            events.push({ type: 'supernova', x: h.x, y: h.y });
          }
          this._fistSince = null;
        } else if (t - this._fistLast > o.supernovaWindow) {
          this._fistSince = null;
        }
      }
    } else {
      this._fistSince = null;
    }

    // 3. Anti-rebote: el gesto debe sostenerse unos milisegundos
    if (raw !== this._candidate) {
      this._candidate = raw;
      this._candidateSince = t;
    }
    if (s.mode !== this._candidate && t - this._candidateSince >= o.debounce) {
      const from = s.mode;
      const held = t - this._modeSince;
      s.mode = this._candidate;
      this._modeSince = t;
      events.push({ type: 'mode', from, to: s.mode });
      // Liberar la energía acumulada separando las manos
      if (from === G.CHARGE && s.mode === G.DUAL && s.charge >= 0.5 && s.orb) {
        events.push({ type: 'shockwave', x: s.orb.x, y: s.orb.y, power: s.charge });
        s.charge = 0;
      }
      // Soltar un colapso sostenido provoca un Big Bang
      if (from === G.COLLAPSE && held >= o.collapseHold) events.push({ type: 'bigbang' });
    }
    const mode = s.mode;

    // 4. Dos manos: zoom y giro relativos (nunca dan saltos), carga de energía y colapso
    if (mode === G.DUAL && hands.length >= 2) {
      const [a, b] = hands;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (!this._dual) this._dual = { span: Math.max(span, 0.08), angle, zoom: s.zoom, twist: s.twist };
      s.zoom = clamp(this._dual.zoom * Math.pow(span / this._dual.span, o.zoomExponent), o.minZoom, o.maxZoom);
      s.twist = this._dual.twist + wrapAngle(angle - this._dual.angle) * o.twistGain;
    } else {
      this._dual = null;
    }

    if (mode === G.CHARGE && hands.length >= 2) {
      const [a, b] = hands;
      s.charge = Math.min(1, s.charge + dt / o.chargeTime);
      s.orb = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, span };
    } else {
      s.charge = Math.max(0, s.charge - dt * 1.5);
      s.orb = null;
    }
    s.collapse = mode === G.COLLAPSE ? 1 : 0;

    // 5. Una mano: floración, orientación, puntero, hiperespacio, barridos y repulsor
    const single = hands.length === 1 && mode !== G.IDLE && !TWO_HAND_MODES.has(mode);
    if (single) {
      const h = hands[0];
      s.yaw = (h.x - 0.5) * 1.2;
      s.pitch = (h.y - 0.5) * 0.7;
      if (mode === G.OPEN || mode === G.FIST) s.bloom = remap(h.openness, 0.95, 1.7, 0, 1);

      if (this._prev && mode === G.OPEN) {
        const dtPrev = t - this._prev.t;
        if (dtPrev > 0 && dtPrev < 0.2) {
          const vx = (h.x - this._prev.x) / dtPrev;
          const vy = (h.y - this._prev.y) / dtPrev;
          if (Math.max(Math.abs(vx), Math.abs(vy)) > o.swipeSpeed && t - this._lastSwipe > o.swipeCooldown) {
            if (Math.abs(vx) >= Math.abs(vy)) events.push({ type: 'swipe', velocity: vx });
            else events.push({ type: 'swipe-vertical', direction: Math.sign(vy) });
            this._lastSwipe = t;
          }
        }
      }
      this._prev = { x: h.x, y: h.y, t };

      // Repulsor: la palma crece de golpe porque la mano se empuja hacia la cámara
      if (mode === G.OPEN) {
        this._palmHistory.push({ t, palm: h.palm });
        while (this._palmHistory.length && t - this._palmHistory[0].t > 0.4) this._palmHistory.shift();
        const ref = this._palmHistory.find((p) => t - p.t <= 0.25 && t - p.t >= 0.1);
        if (ref && h.palm / ref.palm > o.repulsorGrowth && t - this._lastRepulsor > o.repulsorCooldown) {
          events.push({ type: 'repulsor', x: h.x, y: h.y });
          this._lastRepulsor = t;
          this._palmHistory = [];
        }
      } else {
        this._palmHistory = [];
      }
    } else {
      this._prev = null;
      this._palmHistory = [];
      if (mode === G.IDLE || TWO_HAND_MODES.has(mode)) {
        s.yaw = 0;
        s.pitch = 0;
      }
    }

    s.pulse = mode === G.PINCH ? 1 : 0;
    s.warp = mode === G.HORNS ? 1 : 0;
    s.pointer = mode === G.POINT && hands.length === 1 ? { ...hands[0].tip } : null;

    // 6. Señal de paz sostenida → captura (una sola vez por gesto)
    if (mode === G.VICTORY) {
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

    s.cursors = hands.map((h, i) => ({
      x: h.x,
      y: h.y,
      tip: h.tip,
      side: hands.length === 1 ? 'MANO' : i === 0 ? 'MANO I' : 'MANO D',
      pinch: clamp(1 - (h.pinch - 0.2) / 0.6, 0, 1),
      open: remap(h.openness, 0.95, 1.7, 0, 1),
    }));
    s.skeletons = hands.map((h) => h.skeleton);

    return { state: s, events };
  }

  resetView() {
    this.state.zoom = 1;
    this.state.twist = 0;
    this.state.tilt = 0;
    this._dual = null;
  }
}
