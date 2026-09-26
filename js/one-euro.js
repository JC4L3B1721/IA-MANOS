// Filtro One Euro (Casiez et al., 2012): suaviza el temblor de la mano cuando está quieta
// sin añadir retraso cuando se mueve rápido. Es el estándar en seguimiento de manos y VR.

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  // value: muestra nueva · t: tiempo en segundos
  filter(value, t) {
    if (this.t === null) {
      this.t = t;
      this.x = value;
      this.dx = 0;
      return value;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
