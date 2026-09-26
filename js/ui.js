// Capa de interfaz: introducción, telemetría, guía de gestos, cursores de mano,
// vista de la cámara, avisos y diálogo de ayuda.

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

const GESTURE_COPY = {
  open: ['Florecer', 'Mano abierta · la galaxia se expande'],
  fist: ['Recoger', 'Puño · la galaxia se contrae'],
  pinch: ['Resplandor', 'Pellizco · ondas de luz'],
  dual: ['Zoom', 'Dos manos · separa para acercar, gira para rotar'],
  victory: ['Captura', 'Mantén la señal de paz'],
  swipe: ['Impulso', 'Barrido rápido'],
};
const HINT_COPY = ['Muestra tus manos', 'La cámara te está buscando'];
const STEP_LABEL = { idle: 'En espera', active: 'En curso', done: 'Listo', error: 'Error' };
const RING = 2 * Math.PI * 26;

const byId = (id) => document.getElementById(id);

export class UI {
  constructor({ minZoom, maxZoom }) {
    this.video = byId('video');
    this.el = {
      intro: byId('intro'),
      steps: byId('steps'),
      error: byId('intro-error'),
      startLabel: byId('btn-start-label'),
      zoom: byId('t-zoom'),
      bloom: byId('t-bloom'),
      hands: byId('t-hands'),
      ai: byId('t-ai'),
      fps: byId('t-fps'),
      gaugeValue: byId('g-value'),
      gaugeFill: byId('g-fill'),
      gaugeThumb: byId('g-thumb'),
      now: byId('now'),
      nowTitle: byId('now-title'),
      nowCaption: byId('now-caption'),
      toast: byId('toast'),
      toastText: byId('toast-text'),
      help: byId('help'),
      preview: byId('preview'),
      previewCanvas: byId('preview-canvas'),
      previewStatus: byId('preview-status'),
      link: byId('link'),
      linkLine: byId('link-line'),
      linkLabel: byId('link-label'),
      cursors: [...document.querySelectorAll('.cursor')].map((el) => ({
        el,
        progress: el.querySelector('.cursor__progress'),
        visible: false,
      })),
      guideItems: [...document.querySelectorAll('.guide [data-gesture]')],
      guideLists: [...document.querySelectorAll('.guide__list')],
      sound: document.querySelector('[data-action="sound"]'),
      camera: document.querySelector('[data-action="camera"]'),
    };
    this.previewCtx = this.el.previewCanvas.getContext('2d');
    this._zoomLog = [Math.log(minZoom), Math.log(maxZoom)];
    this._listeners = new Map();
    this._metricsAt = 0;
    this._gesture = 'idle';
    this._hint = false;
    this._tempTimer = null;
    this._toastTimer = null;
    this._bind();
  }

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(fn);
    return this;
  }

  _emit(name, data) {
    this._listeners.get(name)?.forEach((fn) => fn(data));
  }

  _bind() {
    byId('btn-start').addEventListener('click', () => this._emit('start'));
    byId('btn-explore').addEventListener('click', () => this._emit('explore'));
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this._emit(button.dataset.action));
    });
  }

  // ---------- Introducción ----------

  showSteps() {
    this.el.intro.classList.add('is-loading');
    this.el.error.hidden = true;
    this.el.steps.hidden = false;
    this.el.steps.querySelectorAll('[data-step]').forEach((li) => this.setStep(li.dataset.step, 'idle'));
  }

  setStep(name, state) {
    const li = this.el.steps.querySelector(`[data-step="${name}"]`);
    if (!li) return;
    li.dataset.state = state;
    li.querySelector('.steps__state').textContent = STEP_LABEL[state];
  }

  showIntroError(message) {
    this.el.intro.classList.remove('is-loading');
    this.el.error.textContent = message;
    this.el.error.hidden = false;
    this.el.startLabel.textContent = 'Reintentar con cámara';
  }

  fatal(message) {
    this.showIntroError(message);
    this.el.intro.classList.add('is-fatal');
  }

  enter() {
    document.body.classList.remove('is-intro');
    document.body.classList.add('is-running');
    setTimeout(() => (this.el.intro.hidden = true), 1200);
  }

  // ---------- Modo de entrada y controles ----------

  setInputMode(mode) {
    document.body.dataset.input = mode;
    this.el.guideLists.forEach((list) => (list.hidden = list.dataset.for !== mode));
    this.el.camera.dataset.tip = mode === 'hands' ? 'Vista de la cámara · C' : 'Activar cámara · C';
  }

  showPreview(show) {
    this.el.preview.hidden = !show;
    this.el.camera.setAttribute('aria-pressed', String(show));
  }

  togglePreview() {
    this.showPreview(this.el.preview.hidden);
  }

  setSound(on) {
    this.el.sound.setAttribute('aria-pressed', String(on));
    this.el.sound.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-sound-off');
  }

  toggleChrome() {
    document.body.classList.toggle('ui-hidden');
  }

  openHelp() {
    if (!this.el.help.open) this.el.help.showModal();
  }

  // ---------- Telemetría ----------

  setMetrics({ zoom, bloom, hands, latency, fps }) {
    const now = performance.now();
    if (now - this._metricsAt < 180) return;
    this._metricsAt = now;

    this.el.zoom.textContent = `${zoom.toFixed(2)}×`;
    this.el.bloom.textContent = `${Math.round(bloom * 100)}%`;
    this.el.hands.textContent = hands == null ? '—' : String(hands);
    this.el.hands.classList.toggle('is-live', hands > 0);
    this.el.ai.textContent = latency == null ? '—' : `${Math.round(latency)} ms`;
    this.el.fps.textContent = String(Math.round(fps));

    const [lo, hi] = this._zoomLog;
    const k = Math.min(1, Math.max(0, (Math.log(zoom) - lo) / (hi - lo)));
    const pct = `${(k * 100).toFixed(1)}%`;
    this.el.gaugeFill.style.height = pct;
    this.el.gaugeThumb.style.bottom = pct;
    this.el.gaugeValue.textContent = zoom.toFixed(1);

    if (hands != null) {
      this.el.previewStatus.textContent = hands === 0 ? 'buscando manos' : hands === 1 ? '1 mano' : `${hands} manos`;
    }
  }

  // ---------- Gestos ----------

  setGesture(mode) {
    if (mode === this._gesture) return;
    this._gesture = mode;
    this._highlight(mode);
    this._renderNow();
  }

  flashGesture(name, ms = 1100) {
    clearTimeout(this._tempTimer);
    this._highlight(name);
    this._renderNow(name);
    this._tempTimer = setTimeout(() => {
      this._highlight(this._gesture);
      this._renderNow();
    }, ms);
  }

  showHint(show) {
    if (show === this._hint) return;
    this._hint = show;
    if (this._gesture === 'idle') this._renderNow();
  }

  _highlight(name) {
    this.el.guideItems.forEach((li) => li.classList.toggle('is-active', li.dataset.gesture === name));
  }

  _renderNow(override) {
    const { now, nowTitle, nowCaption } = this.el;
    const copy = GESTURE_COPY[override ?? this._gesture] ?? (this._hint ? HINT_COPY : null);
    if (!copy) {
      now.classList.add('is-empty');
      return;
    }
    nowTitle.textContent = copy[0];
    nowCaption.textContent = copy[1];
    now.classList.toggle('is-hint', copy === HINT_COPY);
    now.classList.remove('is-empty', 'is-changing');
    void now.offsetWidth; // reinicia la animación de entrada
    now.classList.add('is-changing');
  }

  updateCursors(cursors, mode, zoom, captureProgress) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.el.cursors.forEach((cursor, i) => {
      const c = cursors[i];
      if (!c) {
        if (cursor.visible) cursor.el.classList.remove('is-visible');
        cursor.visible = false;
        return;
      }
      if (!cursor.visible) cursor.el.classList.add('is-visible');
      cursor.visible = true;
      const scale = 1 - c.pinch * 0.4 + (mode === 'open' ? c.open * 0.15 : 0);
      cursor.el.style.transform = `translate3d(${c.x * W}px, ${c.y * H}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      cursor.el.classList.toggle('is-pinch', mode === 'pinch');
      cursor.progress.style.strokeDashoffset = mode === 'victory' ? RING * (1 - captureProgress) : RING;
    });

    const dual = mode === 'dual' && cursors.length >= 2;
    this.el.link.classList.toggle('is-visible', dual);
    this.el.linkLabel.classList.toggle('is-visible', dual);
    if (dual) {
      const [a, b] = cursors;
      const line = this.el.linkLine;
      line.setAttribute('x1', a.x * W);
      line.setAttribute('y1', a.y * H);
      line.setAttribute('x2', b.x * W);
      line.setAttribute('y2', b.y * H);
      this.el.linkLabel.style.transform = `translate3d(${((a.x + b.x) / 2) * W}px, ${((a.y + b.y) / 2) * H}px, 0) translate(-50%, -50%)`;
      this.el.linkLabel.textContent = `×${zoom.toFixed(2)}`;
    }
  }

  // Esqueleto de la mano dibujado sobre la vista previa de la cámara
  drawPreview(video, landmarkSets) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || this.el.preview.hidden) return;
    const canvas = this.el.previewCanvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const lm of landmarkSets) {
      ctx.shadowColor = 'rgba(255, 205, 100, 0.9)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(233, 196, 106, 0.95)';
      ctx.lineWidth = w / 200;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      lm.forEach((p, i) => {
        const tip = FINGERTIPS.has(i);
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, (tip ? w / 90 : w / 150), 0, Math.PI * 2);
        ctx.fillStyle = tip ? '#FFD978' : '#FFF8E6';
        ctx.fill();
      });
    }
  }

  // ---------- Avisos ----------

  toast(message, ms = 2800) {
    clearTimeout(this._toastTimer);
    this.el.toastText.textContent = message;
    this.el.toast.classList.add('is-visible');
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('is-visible'), ms);
  }
}
