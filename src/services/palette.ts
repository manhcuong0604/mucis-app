import { ThemeColors } from '../types';

interface Swatch {
  r: number;
  g: number;
  b: number;
  hex: string;
  hsl: [number, number, number];
  score: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function extractColorsFromCanvas(imgElement: HTMLImageElement): ThemeColors {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2D context');

    canvas.width = 64;
    canvas.height = 64;
    ctx.drawImage(imgElement, 0, 0, 64, 64);
    const imageData = ctx.getImageData(0, 0, 64, 64).data;

    const colorBins: { [key: string]: { r: number; g: number; b: number; count: number } } = {};

    for (let i = 0; i < imageData.length; i += 16) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];

      if (a < 128) continue;
      // Filter out pure black or near white
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 18 || brightness > 240) continue;

      // Quantize to 32 steps
      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;

      if (!colorBins[key]) {
        colorBins[key] = { r: qr, g: qg, b: qb, count: 0 };
      }
      colorBins[key].count++;
    }

    const swatches: Swatch[] = Object.values(colorBins).map(bin => {
      const [h, s, l] = rgbToHsl(bin.r, bin.g, bin.b);
      // Prioritize vibrant, saturated colors over drab grays
      const saturationBonus = s > 35 ? (s / 100) * 1.8 : 0.3;
      const score = bin.count * saturationBonus;
      return {
        r: bin.r,
        g: bin.g,
        b: bin.b,
        hex: `#${bin.r.toString(16).padStart(2, '0')}${bin.g.toString(16).padStart(2, '0')}${bin.b.toString(16).padStart(2, '0')}`,
        hsl: [h, s, l],
        score
      };
    });

    swatches.sort((a, b) => b.score - a.score);

    if (swatches.length >= 2) {
      const primary = swatches[0];
      // Pick secondary that has a distinct hue
      const secondary = swatches.slice(1).find(s => Math.abs(s.hsl[0] - primary.hsl[0]) > 30) || swatches[1];
      const accent = swatches.slice(2).find(s => Math.abs(s.hsl[0] - primary.hsl[0]) > 60 && Math.abs(s.hsl[0] - secondary.hsl[0]) > 40) || swatches[2] || primary;

      const pRgb = `${primary.r}, ${primary.g}, ${primary.b}`;
      const sRgb = `${secondary.r}, ${secondary.g}, ${secondary.b}`;
      const aRgb = `${accent.r}, ${accent.g}, ${accent.b}`;

      document.documentElement.style.setProperty('--color-primary', pRgb);
      document.documentElement.style.setProperty('--color-secondary', sRgb);
      document.documentElement.style.setProperty('--color-accent', aRgb);

      return {
        primary: `rgb(${pRgb})`,
        secondary: `rgb(${sRgb})`,
        accent: `rgb(${aRgb})`,
        backgroundGradient: `
          radial-gradient(circle at 18% 22%, rgba(${pRgb}, 0.38) 0%, transparent 55%),
          radial-gradient(circle at 82% 78%, rgba(${sRgb}, 0.32) 0%, transparent 60%),
          radial-gradient(circle at 50% 40%, rgba(${aRgb}, 0.20) 0%, transparent 65%),
          radial-gradient(circle at 80% 20%, rgba(${pRgb}, 0.18) 0%, transparent 50%)
        `
      };
    }
  } catch (err) {
    console.warn('Canvas color extraction error:', err);
  }

  return getDefaultPalette();
}

function getDefaultPalette(): ThemeColors {
  const p = '99, 102, 241';
  const s = '168, 85, 247';
  const a = '6, 182, 212';
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--color-primary', p);
    document.documentElement.style.setProperty('--color-secondary', s);
    document.documentElement.style.setProperty('--color-accent', a);
  }
  return {
    primary: 'rgb(99, 102, 241)',
    secondary: 'rgb(168, 85, 247)',
    accent: 'rgb(6, 182, 212)',
    backgroundGradient: `
      radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.30) 0%, transparent 55%),
      radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.25) 0%, transparent 60%),
      radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.15) 0%, transparent 65%)
    `
  };
}

export async function extractPaletteFromImage(imageUrl: string): Promise<ThemeColors> {
  if (!imageUrl) return getDefaultPalette();

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolve(extractColorsFromCanvas(img));
    };
    img.onerror = () => {
      resolve(getDefaultPalette());
    };
    img.src = imageUrl;
  });
}
