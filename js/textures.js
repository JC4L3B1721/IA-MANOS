// Texturas procedurales: se dibujan en <canvas> al iniciar, sin descargar imágenes.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const FLOWER_SPECIES = 9;

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
  } else if (shape === 'lance') {
    // Pétalo largo y afilado (lirio, crisantemo)
    ctx.bezierCurveTo(width * 0.7, base - length * 0.35, width * 0.35, tip + length * 0.1, 0, tip);
    ctx.bezierCurveTo(-width * 0.35, tip + length * 0.1, -width * 0.7, base - length * 0.35, 0, base);
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

// Pétalos con degradado, sombra en la base, varias nervaduras, borde iluminado y brillo satinado
function drawPetals(ctx, opts) {
  const {
    count, inner, length, width, base, tip,
    shape = 'round', offset = 0, glow = 0, veins = 3,
    rim = 'rgba(255, 250, 225, 0.4)', shade = 0.28, jitter = 0.06, freckles = 0,
  } = opts;
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate(offset + (i / count) * TAU + (Math.random() - 0.5) * jitter);
    const len = length * (0.94 + Math.random() * 0.1);
    const w = width * (0.94 + Math.random() * 0.1);

    petalPath(ctx, inner, len, w, shape);
    const gradient = ctx.createLinearGradient(0, -inner, 0, -(inner + len));
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, tip);
    ctx.fillStyle = gradient;
    if (glow) {
      ctx.shadowColor = 'rgba(255, 190, 40, 0.55)';
      ctx.shadowBlur = glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Todo lo que sigue queda recortado dentro del pétalo
    ctx.save();
    ctx.clip();
    const shadow = ctx.createLinearGradient(0, -inner, 0, -(inner + len * 0.55));
    shadow.addColorStop(0, `rgba(110, 50, 0, ${shade})`);
    shadow.addColorStop(1, 'rgba(110, 50, 0, 0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-w * 1.2, -(inner + len), w * 2.4, len);

    ctx.lineCap = 'round';
    for (let v = 0; v < veins; v++) {
      const spread = veins === 1 ? 0 : (v / (veins - 1) - 0.5) * w * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -inner - len * 0.04);
      ctx.quadraticCurveTo(spread * 0.9, -(inner + len * 0.45), spread * 0.5, -(inner + len * 0.82));
      ctx.strokeStyle = v === (veins - 1) / 2 ? 'rgba(185, 105, 0, 0.3)' : 'rgba(185, 105, 0, 0.16)';
      ctx.lineWidth = Math.max(1, w * (v === (veins - 1) / 2 ? 0.055 : 0.03));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(-w * 0.28, -(inner + len * 0.45), w * 0.16, len * 0.26, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 240, 0.18)';
    ctx.fill();

    for (let f = 0; f < freckles; f++) {
      const fy = -(inner + len * (0.08 + Math.random() * 0.35));
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * w * 0.7, fy, Math.max(1, w * 0.05 * Math.random()), 0, TAU);
      ctx.fillStyle = 'rgba(150, 60, 0, 0.55)';
      ctx.fill();
    }
    ctx.restore();

    petalPath(ctx, inner, len, w, shape);
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.strokeStyle = rim;
    ctx.stroke();
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

// Estambres: filamentos finos con anteras
function drawStamens(ctx, count, inner, length, color, anther) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + Math.random() * 0.3;
    const len = length * (0.75 + Math.random() * 0.25);
    const x = Math.cos(a) * len;
    const y = Math.sin(a) * len;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.quadraticCurveTo(x * 0.6 + y * 0.12, y * 0.6 - x * 0.12, x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, length * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y, length * 0.07, length * 0.04, a, 0, TAU);
    ctx.fillStyle = anther;
    ctx.fill();
  }
}

// Nueve especies de flores amarillas
const SPECIES = [
  // 0 · Margarita dorada (doble corona)
  (ctx, R) => {
    drawPetals(ctx, { count: 26, inner: R * 0.18, length: R * 0.8, width: R * 0.075, base: '#EFAE12', tip: '#FFF1B0', glow: R * 0.06, veins: 1, offset: 0.12 });
    drawPetals(ctx, { count: 22, inner: R * 0.18, length: R * 0.62, width: R * 0.07, base: '#F6BF28', tip: '#FFF6C8', veins: 1 });
    drawDisk(ctx, R * 0.24, '#FFC933', '#C77700', 'rgba(120, 60, 0, 0.55)', 110);
  },
  // 1 · Ranúnculo en capas
  (ctx, R) => {
    drawPetals(ctx, { count: 6, inner: R * 0.02, length: R * 0.95, width: R * 0.46, base: '#E08A00', tip: '#FFD84A', glow: R * 0.08 });
    drawPetals(ctx, { count: 6, inner: R * 0.02, length: R * 0.72, width: R * 0.36, base: '#EFA000', tip: '#FFE27A', offset: TAU / 12, shade: 0.35 });
    drawPetals(ctx, { count: 5, inner: R * 0.01, length: R * 0.48, width: R * 0.26, base: '#F2A800', tip: '#FFEB9A', shade: 0.4 });
    drawDisk(ctx, R * 0.13, '#E7E27A', '#8C9A30', 'rgba(255, 230, 120, 0.9)', 30);
  },
  // 2 · Girasol
  (ctx, R) => {
    drawPetals(ctx, { count: 20, inner: R * 0.3, length: R * 0.68, width: R * 0.14, base: '#D98C00', tip: '#F2B705', shape: 'pointed', offset: TAU / 40, glow: R * 0.05 });
    drawPetals(ctx, { count: 20, inner: R * 0.3, length: R * 0.64, width: R * 0.13, base: '#F5B400', tip: '#FFE066', shape: 'pointed' });
    drawDisk(ctx, R * 0.36, '#6B3A12', '#2A1405', 'rgba(214, 150, 40, 0.7)', 300);
  },
  // 3 · Cosmos amarillo
  (ctx, R) => {
    drawPetals(ctx, { count: 8, inner: R * 0.1, length: R * 0.88, width: R * 0.3, base: '#F2A800', tip: '#FFF0A0', shape: 'notched', glow: R * 0.07, veins: 5 });
    drawStamens(ctx, 18, R * 0.08, R * 0.2, 'rgba(255, 190, 40, 0.9)', '#FFE38A');
    drawDisk(ctx, R * 0.14, '#FFB000', '#C06A00', 'rgba(255, 220, 120, 0.85)', 40);
  },
  // 4 · Dalia: anillos concéntricos de pétalos
  (ctx, R) => {
    const rings = [
      [16, 0.95, 0.15, '#D98400', '#FFD24D'],
      [16, 0.8, 0.14, '#E39300', '#FFDB66'],
      [14, 0.64, 0.13, '#EDA100', '#FFE180'],
      [12, 0.48, 0.12, '#F2AC0C', '#FFE89A'],
      [10, 0.32, 0.1, '#F5B61E', '#FFEFB4'],
    ];
    rings.forEach(([count, length, width, base, tip], i) => {
      drawPetals(ctx, { count, inner: R * 0.02, length: R * length, width: R * width, base, tip, shape: 'pointed', offset: i * 0.21, glow: i === 0 ? R * 0.06 : 0, veins: 1, shade: 0.3 + i * 0.05 });
    });
  },
  // 5 · Loto dorado
  (ctx, R) => {
    drawPetals(ctx, { count: 8, inner: R * 0.05, length: R * 0.92, width: R * 0.32, base: '#E6A200', tip: '#FFE9B8', shape: 'pointed', glow: R * 0.07, veins: 5 });
    drawPetals(ctx, { count: 8, inner: R * 0.05, length: R * 0.7, width: R * 0.28, base: '#F0B000', tip: '#FFF2CC', shape: 'pointed', offset: TAU / 16, shade: 0.35, veins: 5 });
    drawPetals(ctx, { count: 6, inner: R * 0.04, length: R * 0.46, width: R * 0.22, base: '#F7C21A', tip: '#FFF7DC', shape: 'pointed', shade: 0.4 });
    drawDisk(ctx, R * 0.12, '#FFE7A0', '#D9A020', 'rgba(255, 245, 200, 0.9)', 24);
  },
  // 6 · Lirio estrella con pecas y estambres largos
  (ctx, R) => {
    drawPetals(ctx, { count: 6, inner: R * 0.04, length: R * 0.95, width: R * 0.22, base: '#F0A000', tip: '#FFF2A8', shape: 'lance', glow: R * 0.06, veins: 3, freckles: 14 });
    drawStamens(ctx, 6, R * 0.05, R * 0.62, 'rgba(255, 220, 140, 0.95)', '#B8520A');
    drawDisk(ctx, R * 0.08, '#FFE27A', '#E0A020', 'rgba(255, 255, 220, 0.6)', 10);
  },
  // 7 · Crisantemo araña de pétalos finos
  (ctx, R) => {
    drawPetals(ctx, { count: 34, inner: R * 0.1, length: R * 0.88, width: R * 0.05, base: '#E39600', tip: '#FFE890', shape: 'lance', glow: R * 0.05, veins: 1, jitter: 0.12 });
    drawPetals(ctx, { count: 26, inner: R * 0.08, length: R * 0.6, width: R * 0.05, base: '#EFAA10', tip: '#FFF0B0', shape: 'lance', offset: 0.1, veins: 1, jitter: 0.12 });
    drawPetals(ctx, { count: 16, inner: R * 0.04, length: R * 0.34, width: R * 0.06, base: '#F5B820', tip: '#FFF5C8', shape: 'lance', veins: 1 });
  },
  // 8 · Flor cósmica: pétalos translúcidos con bordes de luz y polvo de estrellas
  (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    drawPetals(ctx, {
      count: 7, inner: R * 0.05, length: R * 0.9, width: R * 0.3, base: 'rgba(255, 190, 70, 0.5)', tip: 'rgba(255, 245, 210, 0.12)',
      glow: R * 0.12, veins: 5, rim: 'rgba(255, 244, 200, 0.95)', shade: 0,
    });
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU;
      const r = Math.pow(Math.random(), 0.7) * R * 0.85;
      const size = R * (0.004 + Math.random() * 0.014);
      const g = ctx.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, size * 3);
      g.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
      g.addColorStop(1, 'rgba(255, 220, 140, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.cos(a) * r - size * 3, Math.sin(a) * r - size * 3, size * 6, size * 6);
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
    core.addColorStop(0, 'rgba(255, 255, 255, 1)');
    core.addColorStop(0.3, 'rgba(255, 230, 150, 0.8)');
    core.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.fillStyle = core;
    ctx.fillRect(-R * 0.3, -R * 0.3, R * 0.6, R * 0.6);
    // Destello de cuatro puntas
    for (const angle of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(angle + Math.PI / 4);
      const flare = ctx.createLinearGradient(-R * 0.75, 0, R * 0.75, 0);
      flare.addColorStop(0, 'rgba(255, 240, 200, 0)');
      flare.addColorStop(0.5, 'rgba(255, 250, 230, 0.9)');
      flare.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = flare;
      ctx.fillRect(-R * 0.75, -R * 0.012, R * 1.5, R * 0.024);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
];

// Atlas 3×3 con las nueve especies (una sola textura → una sola llamada de dibujo)
export function createFlowerAtlas() {
  const cell = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 3;
  const ctx = canvas.getContext('2d');
  SPECIES.forEach((paint, i) => {
    ctx.save();
    ctx.translate((i % 3) * cell + cell / 2, Math.floor(i / 3) * cell + cell / 2);
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
