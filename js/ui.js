// Capa de interfaz holográfica: introducción, telemetría, guía de gestos, esqueleto de las manos,
// retículas, orbe de energía, marcador de la singularidad, registro de eventos, escaneo y ayuda.

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGERTIPS = [4, 8, 12, 16, 20];

export const GESTURE_COPY = {
  open: ['Florecer', 'Mano abierta · la galaxia se expande'],
  fist: ['Recoger', 'Puño · la galaxia se contrae'],
  pinch: ['Resplandor', 'Pellizco · ondas de luz'],
  point: ['Pozo de gravedad', 'Índice · las flores siguen tu dedo'],
  horns: ['Hiperespacio', 'Cuernos · salto a la velocidad de la luz'],
  shaka: ['Holograma', 'Shaka · interfaz holográfica'],
  thumbsup: ['Escaneo', 'Pulgar arriba · análisis espectral'],
  dual: ['Zoom', 'Dos manos · separa para acercar, gira para rotar'],
  charge: ['Carga de energía', 'Manos juntas · sepáralas para liberar'],
  collapse: ['Colapso', 'Dos puños · todo cae en la singularidad'],
  victory: ['Captura', 'Mantén la señal de paz'],
  swipe: ['Impulso', 'Barrido lateral'],
  supernova: ['Supernova', 'Puño → mano abierta'],
  bigbang: ['Big Bang', 'La galaxia renace'],
  repulsor: ['Repulsor', 'Empuje de palma'],
  shockwave: ['Descarga', 'Energía liberada'],
};
const STATE_LABEL = {
  open: 'ABIERTA', fist: 'PUÑO', pinch: 'PELLIZCO', point: 'APUNTANDO', horns: 'WARP', shaka: 'SHAKA',
  thumbsup: 'PULGAR', dual: 'ZOOM', charge: 'CARGANDO', collapse: 'COLAPSO', victory: 'PAZ', idle: '—',
};
const HINT_COPY = ['Muestra tus manos', 'Los sensores te están buscando'];
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
      themeName: byId('theme-name'),
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
      holo: byId('holo'),
      cursorsLayer: byId('cursors'),
      link: byId('link'),
      linkLine: byId('link-line'),
      linkLabel: byId('link-label'),
      orb: byId('orb'),
      orbValue: byId('orb-value'),
      singularity: byId('singularity'),
      sgValue: byId('sg-value'),
      log: byId('log'),
      scan: byId('scan'),
      scanLines: byId('scan-lines'),
      sweep: byId('sweep'),
      guide: document.querySelector('.guide'),
      cursors: [...document.querySelectorAll('.cursor')].map((el) => ({
        el,
        progress: el.querySelector('.r-progress'),
        name: el.querySelector('.cursor__label b'),
        detail: el.querySelector('.cursor__label i'),
        visible: false,
        text: '',
      })),
      guideItems: [...document.querySelectorAll('.guide [data-gesture]')],
      guideLists: [...document.querySelectorAll('.guide__list')],
      sound: document.querySelector('[data-action="sound"]'),
      camera: document.querySelector('[data-action="camera"]'),
      holoBtn: document.querySelector('[data-action="holo"]'),
    };
    this.previewCtx = this.el.previewCanvas.getContext('2d');
    this.holoCtx = this.el.holo.getContext('2d');
    this._zoomLog = [Math.log(minZoom), Math.log(maxZoom)];
    this._listeners = new Map();
    this._metricsAt = 0;
    this._gesture = 'idle';
    this._hint = false;
    this._tempTimer = null;
    this._toastTimer = null;
    this._scanTimers = [];
    this._holoDrawn = false;
    this._orbVisible = false;
    this._bind();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this._holoRatio = ratio;
    this.el.holo.width = Math.round(window.innerWidth * ratio);
    this.el.holo.height = Math.round(window.innerHeight * ratio);
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

  setHolo(on) {
    document.body.classList.toggle('is-holo', on);
    this.el.holoBtn.setAttribute('aria-pressed', String(on));
  }

  setTheme(name) {
    this.el.themeName.textContent = name;
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

  flashGesture(name, ms = 1300, copy = null) {
    clearTimeout(this._tempTimer);
    this._highlight(name);
    this._renderNow(name, copy);
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
    let active = null;
    this.el.guideItems.forEach((li) => {
      const on = li.dataset.gesture === name;
      li.classList.toggle('is-active', on);
      if (on) active = li;
    });
    // Mantiene visible el gesto activo dentro de la guía (sin desplazar la página)
    const guide = this.el.guide;
    if (active && guide.scrollHeight > guide.clientHeight) {
      const top = active.offsetTop - guide.clientHeight / 2 + active.offsetHeight / 2;
      guide.scrollTo({ top, behavior: 'smooth' });
    }
  }

  _renderNow(override, customCopy) {
    const { now, nowTitle, nowCaption } = this.el;
    const copy = customCopy ?? GESTURE_COPY[override ?? this._gesture] ?? (this._hint ? HINT_COPY : null);
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

  // Retículas de mira que siguen a cada mano (o a la punta del índice al apuntar)
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
      const pointing = mode === 'point';
      const x = (pointing ? c.tip.x : c.x) * W;
      const y = (pointing ? c.tip.y : c.y) * H;
      const scale = pointing ? 0.8 : 1 - c.pinch * 0.35 + (mode === 'open' ? c.open * 0.15 : 0);
      cursor.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      cursor.el.dataset.mode = mode;
      cursor.progress.style.strokeDashoffset = mode === 'victory' ? RING * (1 - captureProgress) : RING;
      const text = `${c.side}|${STATE_LABEL[mode] ?? '—'} · ${Math.round(c.open * 100)}%`;
      if (text !== cursor.text) {
        cursor.text = text;
        cursor.name.textContent = c.side;
        cursor.detail.textContent = `${STATE_LABEL[mode] ?? '—'} · ${Math.round(c.open * 100)}%`;
      }
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

  // Orbe de energía entre las dos manos
  updateOrb(orb, charge) {
    const show = Boolean(orb) && charge > 0.02;
    if (show !== this._orbVisible) {
      this.el.orb.classList.toggle('is-visible', show);
      this._orbVisible = show;
    }
    if (!show) return;
    const size = 60 + charge * 140;
    this.el.orb.style.transform = `translate3d(${orb.x * window.innerWidth}px, ${orb.y * window.innerHeight}px, 0) translate(-50%, -50%)`;
    this.el.orb.style.setProperty('--size', `${size}px`);
    this.el.orb.style.setProperty('--charge', charge.toFixed(3));
    this.el.orbValue.textContent = `${Math.round(charge * 100)}%`;
  }

  // Marcador holográfico sobre el agujero negro
  updateSingularity(x, y, radiusPx, scale) {
    const size = Math.max(40, radiusPx * 5);
    this.el.singularity.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    this.el.singularity.style.setProperty('--size', `${size.toFixed(1)}px`);
    const label = `Rs ${scale.toFixed(2)}`;
    if (this.el.sgValue.textContent !== label) this.el.sgValue.textContent = label;
  }

  // Esqueleto holográfico de las manos a pantalla completa
  drawHolo(skeletons, mode) {
    const ctx = this.holoCtx;
    const r = this._holoRatio;
    const W = this.el.holo.width;
    const H = this.el.holo.height;
    if (!skeletons.length) {
      if (this._holoDrawn) ctx.clearRect(0, 0, W, H);
      this._holoDrawn = false;
      return;
    }
    this._holoDrawn = true;
    ctx.clearRect(0, 0, W, H);
    const warm = mode === 'collapse' || mode === 'charge';
    const line = warm ? 'rgba(255, 214, 120, 0.6)' : 'rgba(127, 233, 255, 0.55)';
    const glow = warm ? 'rgba(255, 190, 80, 0.9)' : 'rgba(90, 220, 255, 0.9)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const sk of skeletons) {
      const P = (i) => [sk[i].x * W, sk[i].y * H];
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14 * r;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.6 * r;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(...P(a));
        ctx.lineTo(...P(b));
      }
      ctx.stroke();

      // Palma: hexágono técnico
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1 * r;
      ctx.beginPath();
      [0, 5, 9, 13, 17].forEach((i, k) => (k ? ctx.lineTo(...P(i)) : ctx.moveTo(...P(i))));
      ctx.closePath();
      ctx.fillStyle = warm ? 'rgba(255, 200, 90, 0.06)' : 'rgba(127, 233, 255, 0.06)';
      ctx.fill();

      for (let i = 0; i < 21; i++) {
        const [x, y] = P(i);
        ctx.beginPath();
        ctx.arc(x, y, 2.2 * r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(230, 250, 255, 0.95)';
        ctx.fill();
      }
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10 * r;
      for (const i of FINGERTIPS) {
        const [x, y] = P(i);
        ctx.beginPath();
        ctx.arc(x, y, 7 * r, 0, Math.PI * 2);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1.2 * r;
        ctx.stroke();
      }
      // Coordenadas junto a la punta del índice
      ctx.shadowBlur = 0;
      const [ix, iy] = P(8);
      ctx.font = `${10 * r}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = warm ? 'rgba(255, 220, 150, 0.85)' : 'rgba(170, 240, 255, 0.85)';
      ctx.fillText(`X ${sk[8].x.toFixed(3)}  Y ${sk[8].y.toFixed(3)}`, ix + 12 * r, iy - 10 * r);
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
      ctx.shadowColor = 'rgba(90, 220, 255, 0.9)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(127, 233, 255, 0.95)';
      ctx.lineWidth = w / 200;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      lm.forEach((p, i) => {
        const tip = FINGERTIPS.includes(i);
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, tip ? w / 90 : w / 150, 0, Math.PI * 2);
        ctx.fillStyle = tip ? '#FFD978' : '#E8FBFF';
        ctx.fill();
      });
    }
  }

  // ---------- Efectos de interfaz ----------

  // Anillo expansivo en pantalla (supernova, repulsor, descarga)
  shock(x, y, variant = 'gold') {
    const ring = document.createElement('span');
    ring.className = `shock shock--${variant}`;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    this.el.cursorsLayer.append(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
  }

  log(label) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString('es', { hour12: false });
    li.innerHTML = `<time>${time}</time><span></span>`;
    li.querySelector('span').textContent = label;
    this.el.log.prepend(li);
    while (this.el.log.children.length > 6) this.el.log.lastElementChild.remove();
  }

  // Barrido de escaneo y panel de análisis que se escribe línea a línea
  scan(lines) {
    this._scanTimers.forEach(clearTimeout);
    this._scanTimers = [];
    const { sweep, scan, scanLines } = this.el;
    sweep.classList.remove('is-active');
    void sweep.offsetWidth;
    sweep.classList.add('is-active');
    scanLines.replaceChildren();
    scan.hidden = false;
    scan.classList.remove('is-leaving');
    lines.forEach(([label, value], i) => {
      this._scanTimers.push(
        setTimeout(() => {
          const li = document.createElement('li');
          li.innerHTML = '<span></span><b></b>';
          li.querySelector('span').textContent = label;
          li.querySelector('b').textContent = value;
          scanLines.append(li);
        }, 350 + i * 260),
      );
    });
    this._scanTimers.push(setTimeout(() => scan.classList.add('is-leaving'), 350 + lines.length * 260 + 4200));
    this._scanTimers.push(setTimeout(() => (scan.hidden = true), 350 + lines.length * 260 + 4800));
  }

  toast(message, ms = 2800) {
    clearTimeout(this._toastTimer);
    this.el.toastText.textContent = message;
    this.el.toast.classList.add('is-visible');
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('is-visible'), ms);
  }
}
