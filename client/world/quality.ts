// Device quality presets and frame-time driven adaptation.
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySettings = {
  level: QualityLevel;
  shadows: boolean;
  shadowMapSize: number;
  // Retro (pixelated) mode renders small and is scaled up by the page. How chunky the
  // pixels look is retroScale, a divisor of the canvas' own width, so the effect is the
  // same at any window size or browser zoom; retroWidth only caps the cost on a wide
  // screen. Crisp mode renders at native resolution up to maxPixelRatio.
  retroScale: number;
  retroWidth: number;
  maxPixelRatio: number;
  waterSegments: number;
  particles: number;
  rainDrops: number;
  grass: number;
  lanternLights: number;
  // Rings and segments of the polar terrain grid; more on desktops, fewer on phones.
  terrain: { rings: number; segments: number };
};
export const presets: Record<QualityLevel, QualitySettings> = {
  low: { level: 'low', shadows: false, shadowMapSize: 0, retroScale: 2.6, retroWidth: 560, maxPixelRatio: 1, waterSegments: 24, particles: 96, rainDrops: 160, grass: 90, lanternLights: 0, terrain: { rings: 28, segments: 96 } },
  medium: { level: 'medium', shadows: true, shadowMapSize: 1024, retroScale: 2.1, retroWidth: 720, maxPixelRatio: 1.25, waterSegments: 48, particles: 192, rainDrops: 320, grass: 200, lanternLights: 1, terrain: { rings: 44, segments: 128 } },
  high: { level: 'high', shadows: true, shadowMapSize: 2048, retroScale: 1.7, retroWidth: 960, maxPixelRatio: 1.75, waterSegments: 72, particles: 256, rainDrops: 650, grass: 320, lanternLights: 2, terrain: { rings: 44, segments: 128 } },
};
const order: QualityLevel[] = ['low', 'medium', 'high'];
export function detectQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse && (cores <= 4 || memory <= 3)) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}
// Steps quality down after sustained slow frames and back up after sustained headroom.
export class AdaptiveQuality {
  level: QualityLevel;
  auto = true;
  private slowFor = 0;
  private fastFor = 0;
  private average = 16;
  constructor(
    initial: QualityLevel,
    private readonly ceiling: QualityLevel,
    private readonly onChange: (level: QualityLevel) => void,
  ) {
    this.level = initial;
  }
  setManual(level: QualityLevel | 'auto', detected: QualityLevel) {
    this.auto = level === 'auto';
    const next = level === 'auto' ? detected : level;
    if (next !== this.level) {
      this.level = next;
      this.onChange(next);
    }
    this.slowFor = this.fastFor = 0;
  }
  update(frameMs: number) {
    this.average += (frameMs - this.average) * 0.05;
    if (!this.auto) return;
    if (this.average > 26) {
      this.slowFor += frameMs;
      this.fastFor = 0;
    } else if (this.average < 15) {
      this.fastFor += frameMs;
      this.slowFor = 0;
    } else this.slowFor = this.fastFor = 0;
    const index = order.indexOf(this.level);
    if (this.slowFor > 2500 && index > 0) {
      this.level = order[index - 1];
      this.slowFor = this.fastFor = 0;
      this.onChange(this.level);
    } else if (this.fastFor > 20000 && index < order.indexOf(this.ceiling)) {
      this.level = order[index + 1];
      this.slowFor = this.fastFor = 0;
      this.onChange(this.level);
    }
  }
  get averageFrameMs() {
    return this.average;
  }
}
