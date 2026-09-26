// Pruebas del motor de gestos con manos sintéticas: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHand, GestureEngine, GESTURES } from '../js/gestures.js';

const FINGERS = {
  open: [1, 1, 1, 1],
  pinch: [1, 1, 1, 1],
  fist: [0, 0, 0, 0],
  thumbsup: [0, 0, 0, 0],
  victory: [1, 1, 0, 0],
  point: [1, 0, 0, 0],
  horns: [1, 0, 0, 1],
  shaka: [0, 0, 0, 1],
};

// Genera los 21 puntos de una mano en coordenadas de imagen (0..1).
// s = tamaño de la palma (distancia muñeca → base del dedo medio).
function makeHand({ cx = 0.5, cy = 0.5, s = 0.1, pose = 'open' } = {}) {
  const P = (dx, dy) => ({ x: cx + dx * s, y: cy + dy * s, z: 0 });
  const lm = new Array(21);
  lm[0] = P(0, 0.45);
  const fingers = FINGERS[pose];
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
  const thumb = {
    open: P(-0.95, -0.3),
    shaka: P(-0.95, -0.3),
    pinch: P(-0.3, -1.33),
    thumbsup: P(-0.3, -1.4),
  }[pose];
  lm[4] = thumb ?? P(-0.2, -0.3);
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

const pair = (span, opts = {}) => [makeHand({ cx: 0.5 - span / 2, ...opts }), makeHand({ cx: 0.5 + span / 2, ...opts })];

test('analyzeHand distingue las posturas de la mano', () => {
  const pose = (p) => analyzeHand(makeHand({ pose: p })).pose;
  assert.equal(pose('open'), 'open');
  assert.equal(pose('fist'), 'closed');
  assert.equal(pose('victory'), 'victory');
  assert.equal(pose('point'), 'point');
  assert.equal(pose('horns'), 'horns');
  assert.equal(pose('shaka'), 'shaka');
  assert.equal(pose('thumbsup'), 'thumbsup');

  const open = analyzeHand(makeHand({ pose: 'open' }));
  const fist = analyzeHand(makeHand({ pose: 'fist' }));
  const pinch = analyzeHand(makeHand({ pose: 'pinch' }));
  assert.ok(open.openness > 1.6, `apertura abierta ${open.openness}`);
  assert.ok(fist.openness < 1.0, `apertura puño ${fist.openness}`);
  assert.ok(pinch.pinch < 0.3, `pellizco ${pinch.pinch}`);
  assert.ok(open.pinch > 0.45);
});

test('la posición se refleja como un espejo', () => {
  const h = analyzeHand(makeHand({ cx: 0.2 }));
  assert.ok(Math.abs(h.x - 0.8) < 0.05, `x reflejada ${h.x}`);
});

test('cada postura de una mano activa su modo', () => {
  const expected = {
    open: GESTURES.OPEN,
    fist: GESTURES.FIST,
    pinch: GESTURES.PINCH,
    victory: GESTURES.VICTORY,
    point: GESTURES.POINT,
    horns: GESTURES.HORNS,
    shaka: GESTURES.SHAKA,
    thumbsup: GESTURES.THUMBS_UP,
  };
  for (const [pose, mode] of Object.entries(expected)) {
    const engine = new GestureEngine();
    run(engine, [makeHand({ pose })], 0.4);
    assert.equal(engine.state.mode, mode, `postura ${pose}`);
  }
});

test('mano abierta florece y el puño recoge la galaxia', () => {
  const engine = new GestureEngine();
  run(engine, [makeHand({ pose: 'open' })], 0.4);
  assert.ok(engine.state.bloom > 0.95, `bloom ${engine.state.bloom}`);

  const engine2 = new GestureEngine();
  run(engine2, [makeHand({ pose: 'fist' })], 0.4);
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
  let { t } = run(engine, pair(0.3), 0.4);
  assert.equal(engine.state.mode, GESTURES.DUAL);
  assert.ok(Math.abs(engine.state.zoom - 1) < 0.02, `zoom inicial ${engine.state.zoom}`);

  ({ t } = run(engine, pair(0.6), 1.5, t));
  const expected = Math.pow(0.6 / 0.3, 1.3);
  assert.ok(Math.abs(engine.state.zoom - expected) < 0.1, `zoom ${engine.state.zoom} ≈ ${expected}`);

  ({ t } = run(engine, pair(0.3), 1.5, t));
  assert.ok(Math.abs(engine.state.zoom - 1) < 0.08, `zoom de vuelta ${engine.state.zoom}`);
});

test('el zoom se conserva al retirar las manos y respeta los límites', () => {
  const engine = new GestureEngine({ maxZoom: 3 });
  let { t } = run(engine, pair(0.25), 0.4);
  ({ t } = run(engine, pair(0.9), 1.5, t));
  assert.equal(engine.state.zoom, 3);
  run(engine, [], 0.6, t);
  assert.equal(engine.state.mode, GESTURES.IDLE);
  assert.equal(engine.state.zoom, 3);
});

test('el pellizco activa el resplandor y los cuernos el hiperespacio', () => {
  const engine = new GestureEngine();
  run(engine, [makeHand({ pose: 'pinch' })], 0.4);
  assert.equal(engine.state.pulse, 1);

  const warp = new GestureEngine();
  run(warp, [makeHand({ pose: 'horns' })], 0.4);
  assert.equal(warp.state.warp, 1);
});

test('apuntar con el índice expone la posición de la punta del dedo', () => {
  const engine = new GestureEngine();
  run(engine, [makeHand({ cx: 0.3, pose: 'point' })], 0.4);
  assert.ok(engine.state.pointer, 'debería haber puntero');
  assert.ok(Math.abs(engine.state.pointer.x - (1 - (0.3 - 0.035))) < 0.02, `x ${engine.state.pointer.x}`);
});

test('mantener la señal de paz captura una sola vez', () => {
  const engine = new GestureEngine();
  const { events } = run(engine, [makeHand({ pose: 'victory' })], 3);
  assert.equal(events.filter((e) => e.type === 'capture').length, 1);
});

test('barridos horizontal y vertical', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, [makeHand({ cx: 0.7 })], 0.4);
  const { events } = run(engine, (dt) => [makeHand({ cx: 0.7 - dt * 2.5 })], 0.25, t);
  const swipe = events.find((e) => e.type === 'swipe');
  assert.ok(swipe && swipe.velocity > 0, 'barrido hacia la derecha en pantalla');

  const engine2 = new GestureEngine();
  ({ t } = run(engine2, [makeHand({ cy: 0.3 })], 0.4));
  const vertical = run(engine2, (dt) => [makeHand({ cy: 0.3 + dt * 2.5 })], 0.25, t).events.find((e) => e.type === 'swipe-vertical');
  assert.ok(vertical && vertical.direction === 1, 'barrido hacia abajo');
});

test('puño sostenido que se abre de golpe provoca una supernova', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, [makeHand({ pose: 'fist' })], 0.6);
  const { events } = run(engine, [makeHand({ pose: 'open' })], 0.5, t);
  assert.equal(events.filter((e) => e.type === 'supernova').length, 1);

  // Un puño breve no cuenta
  const quick = new GestureEngine();
  ({ t } = run(quick, [makeHand({ pose: 'open' })], 0.4));
  ({ t } = run(quick, [makeHand({ pose: 'fist' })], 0.15, t));
  assert.equal(run(quick, [makeHand({ pose: 'open' })], 0.5, t).events.filter((e) => e.type === 'supernova').length, 0);
});

test('empujar la palma hacia la cámara dispara el repulsor', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, [makeHand({ s: 0.1 })], 0.5);
  const { events } = run(engine, (dt) => [makeHand({ s: 0.1 + Math.min(dt, 0.15) * 0.35 })], 0.4, t);
  assert.equal(events.filter((e) => e.type === 'repulsor').length, 1);
});

test('dos manos juntas cargan energía y al separarlas se libera', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, pair(0.12), 1.5);
  assert.equal(engine.state.mode, GESTURES.CHARGE);
  assert.ok(engine.state.charge > 0.9, `carga ${engine.state.charge}`);
  const { events } = run(engine, pair(0.5), 0.5, t);
  const shock = events.find((e) => e.type === 'shockwave');
  assert.ok(shock && shock.power > 0.9, 'debería liberar la energía');
});

test('dos puños colapsan la galaxia y al soltarlos hay un Big Bang', () => {
  const engine = new GestureEngine();
  let { t } = run(engine, pair(0.4, { pose: 'fist' }), 1.2);
  assert.equal(engine.state.mode, GESTURES.COLLAPSE);
  assert.equal(engine.state.collapse, 1);
  const { events } = run(engine, pair(0.4), 0.5, t);
  assert.equal(events.filter((e) => e.type === 'bigbang').length, 1);
  assert.equal(engine.state.collapse, 0);
});
