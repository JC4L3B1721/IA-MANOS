// Pruebas del motor de gestos con manos sintéticas: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHand, GestureEngine, GESTURES } from '../js/gestures.js';

// Genera los 21 puntos de una mano en coordenadas de imagen (0..1).
// s = tamaño de la palma (distancia muñeca → base del dedo medio).
function makeHand({ cx = 0.5, cy = 0.5, s = 0.1, pose = 'open' } = {}) {
  const P = (dx, dy) => ({ x: cx + dx * s, y: cy + dy * s, z: 0 });
  const lm = new Array(21);
  lm[0] = P(0, 0.45);
  const fingers = { open: [1, 1, 1, 1], pinch: [1, 1, 1, 1], fist: [0, 0, 0, 0], victory: [1, 1, 0, 0] }[pose];
  [5, 9, 13, 17].forEach((mcp, k) => {
    const bx = [-0.35, 0, 0.3, 0.55][k];
    const by = mcp === 9 ? -0.55 : -0.5;
    lm[mcp] = P(bx, by);
    if (fingers[k]) {
      lm[mcp + 1] = P(bx, by - 0.4);
      lm[mcp + 2] = P(bx, by - 0.65);
      lm[mcp + 3] = P(bx, by - 0.85);
    } else {
      lm[mcp + 1] = P(bx, by - 0.3);
      lm[mcp + 2] = P(bx, by - 0.1);
      lm[mcp + 3] = P(bx, by + 0.2);
    }
  });
  lm[1] = P(-0.35, 0.3);
  lm[2] = P(-0.6, 0.1);
  lm[3] = P(-0.8, -0.1);
  lm[4] = pose === 'open' ? P(-0.95, -0.3) : pose === 'pinch' ? P(-0.3, -1.33) : P(-0.2, -0.3);
  return lm;
}

// Alimenta el motor durante `seconds` a 30 fps
function run(engine, frames, seconds, t0 = 0) {
  const events = [];
  let t = t0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    t = t0 + i / 30;
    events.push(...engine.update(typeof frames === 'function' ? frames(i / 30) : frames, t).events);
  }
  return { events, t: t + 1 / 30 };
}

test('analyzeHand distingue mano abierta, puño, pellizco y señal de paz', () => {
  const open = analyzeHand(makeHand({ pose: 'open' }));
  const fist = analyzeHand(makeHand({ pose: 'fist' }));
  const pinch = analyzeHand(makeHand({ pose: 'pinch' }));
  const victory = analyzeHand(makeHand({ pose: 'victory' }));
  assert.ok(open.openness > 1.6, `apertura abierta ${open.openness}`);
  assert.ok(fist.openness < 1.0, `apertura puño ${fist.openness}`);
  assert.ok(pinch.pinch < 0.3, `pellizco ${pinch.pinch}`);
  assert.ok(open.pinch > 0.45);
  assert.equal(victory.victory, true);
  assert.equal(open.victory, false);
});

test('la posición se refleja como un espejo', () => {
  const h = analyzeHand(makeHand({ cx: 0.2 }));
  assert.ok(Math.abs(h.x - 0.8) < 0.05, `x reflejada ${h.x}`);
});

test('mano abierta florece y el puño recoge la galaxia', () => {
  const engine = new GestureEngine();
  run(engine, [makeHand({ pose: 'open' })], 0.4);
  assert.equal(engine.state.mode, GESTURES.OPEN);
  assert.ok(engine.state.bloom > 0.95, `bloom ${engine.state.bloom}`);

  const engine2 = new GestureEngine();
  run(engine2, [makeHand({ pose: 'fist' })], 0.4);
  assert.equal(engine2.state.mode, GESTURES.FIST);
  assert.ok(engine2.state.bloom < 0.05, `bloom ${engine2.state.bloom}`);
});

test('un fotograma aislado no cambia el gesto (anti-rebote)', () => {
  const engine = new GestureEngine();
  const { t } = run(engine, [makeHand({ pose: 'open' })], 0.4);
  engine.update([makeHand({ pose: 'fist' })], t);
  engine.update([makeHand({ pose: 'open' })], t + 1 / 30);
  assert.equal(engine.state.mode, GESTURES.OPEN);
});

test('separar las dos manos amplía y juntarlas reduce, sin saltos', () => {
  const engine = new GestureEngine();
  const pair = (span) => [makeHand({ cx: 0.5 - span / 2 }), makeHand({ cx: 0.5 + span / 2 })];

  let { t } = run(engine, pair(0.2), 0.4);
  assert.equal(engine.state.mode, GESTURES.DUAL);
  assert.ok(Math.abs(engine.state.zoom - 1) < 0.02, `zoom inicial ${engine.state.zoom}`);

  ({ t } = run(engine, pair(0.5), 1.5, t));
  const expected = Math.pow(0.5 / 0.2, 1.3);
  assert.ok(Math.abs(engine.state.zoom - expected) < 0.1, `zoom ${engine.state.zoom} ≈ ${expected}`);

  ({ t } = run(engine, pair(0.2), 1.5, t));
  assert.ok(Math.abs(engine.state.zoom - 1) < 0.08, `zoom de vuelta ${engine.state.zoom}`);
});

test('el zoom se conserva al retirar las manos', () => {
  const engine = new GestureEngine();
  const pair = (span) => [makeHand({ cx: 0.5 - span / 2 }), makeHand({ cx: 0.5 + span / 2 })];
  let { t } = run(engine, pair(0.2), 0.4);
  ({ t } = run(engine, pair(0.45), 1.2, t));
  const zoom = engine.state.zoom;
  run(engine, [], 0.6, t);
  assert.equal(engine.state.mode, GESTURES.IDLE);
  assert.equal(engine.state.zoom, zoom);
});

test('el zoom respeta los límites', () => {
  const engine = new GestureEngine({ maxZoom: 3 });
  const pair = (span) => [makeHand({ cx: 0.5 - span / 2 }), makeHand({ cx: 0.5 + span / 2 })];
  let { t } = run(engine, pair(0.1), 0.4);
  run(engine, pair(0.8), 1.5, t);
  assert.equal(engine.state.zoom, 3);
});

test('el pellizco activa el resplandor', () => {
  const engine = new GestureEngine();
  run(engine, [makeHand({ pose: 'pinch' })], 0.4);
  assert.equal(engine.state.mode, GESTURES.PINCH);
  assert.equal(engine.state.pulse, 1);
});

test('mantener la señal de paz captura una sola vez', () => {
  const engine = new GestureEngine();
  const { events } = run(engine, [makeHand({ pose: 'victory' })], 3);
  assert.equal(events.filter((e) => e.type === 'capture').length, 1);
});

test('un barrido rápido genera un impulso de giro', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, [makeHand({ cx: 0.7 })], 0.4);
  // La mano cruza la imagen hacia la izquierda (en pantalla, hacia la derecha)
  const { events } = run(engine, (dt) => [makeHand({ cx: 0.7 - dt * 2.5 })], 0.25, t);
  const swipe = events.find((e) => e.type === 'swipe');
  assert.ok(swipe, 'debería detectar el barrido');
  assert.ok(swipe.velocity > 0, 'en pantalla la mano va hacia la derecha');
});
