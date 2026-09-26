// Texturas procedurales: se dibujan en <canvas> al iniciar, sin descargar imágenes.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function petalPath(ctx, inner, length, width, shape) {
  const base = -inner;
  const tip = -(inner + length);
  ctx.beginPath();
  ctx.moveTo(0, base);
  if (shape === 'pointed') {
    ctx.bezierCurveTo(width, base - length * 0.25, width * 0.55, tip + length * 0.18, 0, tip);
    ctx.bezierCurveTo(-width * 0.55, tip + length * 0.18, -width, base - length * 0.25, 0, base);
  } else if (shape === 'notched') {
    // Punta con tres dientes, como la flor de cosmos
    ctx.bezierCurveTo(width * 0.9, base - length * 0.2, width * 1.05, tip + length * 0.3, width * 0.35, tip + length * 0.02);
    ctx.lineTo(width * 0.18, tip + length * 0.09);
    ctx.lineTo(0, tip);
    ctx.lineTo(-width * 0.18, tip + length * 0.09);
    ctx.lineTo(-width * 0.35, tip + length * 0.02);
    ctx.bezierCurveTo(-width * 1.05, tip + length * 0.3, -width * 0.9, base - length * 0.2, 0, base);
  } else {
    ctx.bezierCurveTo(width, base - length * 0.15, width * 1.05, tip + length * 0.28, 0, tip);
    ctx.bezierCurveTo(-width * 1.05, tip + length * 0.28, -width, base - length * 0.15, 0, base);
  }
  ctx.closePath();
}

function drawPetals(ctx, { count, inner, length, width, base, tip, shape = 'round', offset = 0, glow = 0 }) {
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate(offset + (i / count) * TAU + (Math.random() - 0.5) * 0.06);
    const len = length * (0.94 + Math.random() * 0.1);

    const gradient = ctx.createLinearGradient(0, -inner, 0, -(inner + len));
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, tip);
    petalPath(ctx, inner, len, width, shape);
    ctx.fillStyle = gradient;
    if (glow) {
      ctx.shadowColor = 'rgba(255, 190, 40, 0.55)';
      ctx.shadowBlur = glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, width * 0.04);
    ctx.strokeStyle = 'rgba(150, 90, 0, 0.3)';
    ctx.stroke();

    // Nervadura central
    ctx.beginPath();
    ctx.moveTo(0, -inner - len * 0.05);
    ctx.lineTo(0, -(inner + len * 0.78));
    ctx.strokeStyle = 'rgba(190, 110, 0, 0.22)';
    ctx.lineWidth = Math.max(1, width * 0.06);
    ctx.stroke();

    // Brillo satinado
    ctx.beginPath();
    ctx.ellipse(-width * 0.28, -(inner + len * 0.45), width * 0.16, len * 0.26, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 240, 0.16)';
    ctx.fill();
    ctx.restore();
  }
}

// Disco central con semillas en espiral de Fermat (filotaxis del ángulo áureo)
function drawDisk(ctx, radius, inner, outer, seedColor, seeds) {
  const gradient = ctx.createRadialGradient(-radius * 0.25, -radius * 0.25, radius * 0.1, 0, 0, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = seedColor;
  const c = (radius / Math.sqrt(seeds)) * 0.95;
  for (let k = 1; k < seeds; k++) {
    const r = c * Math.sqrt(k);
    const a = k * GOLDEN_ANGLE;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, radius * 0.035 * (0.6 + 0.4 * (r / radius)), 0, TAU);
    ctx.fill();
  }
}

// Cuatro especies de flores amarillas
const SPECIES = [
  // Margarita dorada
  (ctx, R) => {
    drawPetals(ctx, { count: 24, inner: R * 0.18, length: R * 0.8, width: R * 0.075, base: '#F4B81E', tip: '#FFF3B8', glow: R * 0.06 });
    drawDisk(ctx, R * 0.24, '#FFC933', '#C77700', 'rgba(120, 60, 0, 0.55)', 90);
  },
  // Ranúnculo
  (ctx, R) => {
    drawPetals(ctx, { count: 5, inner: R * 0.02, length: R * 0.95, width: R * 0.5, base: '#E89A00', tip: '#FFD84A', glow: R * 0.08 });
    drawDisk(ctx, R * 0.2, '#E7E27A', '#9AA23A', 'rgba(255, 230, 120, 0.9)', 40);
  },
  // Girasol
  (ctx, R) => {
    drawPetals(ctx, { count: 18, inner: R * 0.3, length: R * 0.68, width: R * 0.15, base: '#D98C00', tip: '#F2B705', shape: 'pointed', offset: TAU / 36, glow: R * 0.05 });
    drawPetals(ctx, { count: 18, inner: R * 0.3, length: R * 0.64, width: R * 0.14, base: '#F5B400', tip: '#FFE066', shape: 'pointed' });
    drawDisk(ctx, R * 0.36, '#6B3A12', '#2A1405', 'rgba(214, 150, 40, 0.7)', 260);
  },
  // Cosmos amarillo
  (ctx, R) => {
    drawPetals(ctx, { count: 8, inner: R * 0.1, length: R * 0.88, width: R * 0.3, base: '#F7B500', tip: '#FFF0A0', shape: 'notched', glow: R * 0.07 });
    drawDisk(ctx, R * 0.17, '#FFB000', '#C06A00', 'rgba(255, 220, 120, 0.85)', 50);
  },
];

// Atlas 2×2 con las cuatro especies (una sola textura → una sola llamada de dibujo)
export function createFlowerAtlas() {
  const cell = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 2;
  const ctx = canvas.getContext('2d');
  SPECIES.forEach((paint, i) => {
    ctx.save();
    ctx.translate((i % 2) * cell + cell / 2, Math.floor(i / 2) * cell + cell / 2);
    paint(ctx, cell * 0.42);
    ctx.restore();
  });
  return toTexture(canvas);
}

export function createGlowTexture(stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

// Nube de gas: manchas suaves superpuestas con un borde que se desvanece
export function createNebulaTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.35;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.35;
    const r = size * (0.12 + Math.random() * 0.22);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(255, 255, 255, 1)');
  mask.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}
