// Cámara + MediaPipe Hand Landmarker (21 puntos por mano, hasta 2 manos).
// Todo el análisis ocurre en el navegador: ningún fotograma sale del dispositivo.
import { MEDIAPIPE } from './config.js';

export class TrackerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const CAMERA_ERRORS = {
  NotAllowedError: 'Permiso de cámara denegado. Actívalo desde el icono del candado en la barra de direcciones.',
  NotFoundError: 'No se encontró ninguna cámara conectada.',
  NotReadableError: 'La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.',
  OverconstrainedError: 'La cámara no admite la configuración solicitada.',
};

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.stream = null;
    this.latency = 0;
    this.delegate = null;
    this._lastVideoTime = -1;
  }

  async startCamera() {
    if (!window.isSecureContext) {
      throw new TrackerError('insecure', 'La cámara solo funciona en https:// o en http://localhost.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new TrackerError('unsupported', 'Este navegador no permite acceder a la cámara.');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 60, max: 60 } },
      });
    } catch (error) {
      throw new TrackerError(error.name, CAMERA_ERRORS[error.name] ?? `No se pudo abrir la cámara (${error.name ?? error}).`);
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  async loadModel() {
    if (this.landmarker) return;
    try {
      const { FilesetResolver, HandLandmarker } = await import(MEDIAPIPE.bundle);
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasm);
      const create = (delegate) =>
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MEDIAPIPE.model, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });
      try {
        this.landmarker = await create('GPU');
        this.delegate = 'GPU';
      } catch {
        this.landmarker = await create('CPU');
        this.delegate = 'CPU';
      }
    } catch (error) {
      console.error(error);
      throw new TrackerError('model', 'No se pudo cargar el modelo de visión artificial. Revisa tu conexión a internet.');
    }
  }

  get ready() {
    return Boolean(this.landmarker) && this.video.readyState >= 2;
  }

  // Devuelve los puntos de cada mano solo cuando llega un fotograma nuevo; si no, null
  detect() {
    if (!this.ready) return null;
    const time = this.video.currentTime;
    if (time === this._lastVideoTime) return null;
    this._lastVideoTime = time;
    const start = performance.now();
    const result = this.landmarker.detectForVideo(this.video, start);
    this.latency = performance.now() - start;
    return result.landmarks ?? [];
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
