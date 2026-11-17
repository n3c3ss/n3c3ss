// Deterministic 4D simplex noise. The fourth and third coordinates trace a
// circle over time, which makes the terrain's breathing loop seamless.
const F4 = (Math.sqrt(5) - 1) / 4;
const G4 = (5 - Math.sqrt(5)) / 20;

type Gradient = readonly [number, number, number, number];
const gradients: Gradient[] = [];
for (let zero = 0; zero < 4; zero++) {
  for (let bits = 0; bits < 8; bits++) {
    const values = [0, 0, 0, 0];
    let bit = 0;
    for (let axis = 0; axis < 4; axis++) {
      if (axis === zero) continue;
      values[axis] = bits & (1 << bit) ? 1 : -1;
      bit++;
    }
    gradients.push(values as unknown as Gradient);
  }
}

function gradientIndex(i: number, j: number, k: number, l: number): number {
  let hash = Math.imul(i, 0x45d9f3b) ^ Math.imul(j, 0x119de1f3);
  hash = Math.imul(hash ^ k, 0x45d9f3b);
  hash = Math.imul(hash ^ l, 0x27d4eb2d);
  hash ^= hash >>> 16;
  return (hash >>> 0) & 31;
}

function contribution(i: number, j: number, k: number, l: number, x: number, y: number, z: number, w: number): number {
  const attenuation = 0.6 - x * x - y * y - z * z - w * w;
  if (attenuation <= 0) return 0;
  const gradient = gradients[gradientIndex(i, j, k, l)];
  const squared = attenuation * attenuation;
  return squared * squared * (gradient[0] * x + gradient[1] * y + gradient[2] * z + gradient[3] * w);
}

export function noise4(x: number, y: number, z: number, w: number): number {
  const skew = (x + y + z + w) * F4;
  const i = Math.floor(x + skew), j = Math.floor(y + skew);
  const k = Math.floor(z + skew), l = Math.floor(w + skew);
  const unskew = (i + j + k + l) * G4;
  const x0 = x - (i - unskew), y0 = y - (j - unskew);
  const z0 = z - (k - unskew), w0 = w - (l - unskew);

  let rankX = 0, rankY = 0, rankZ = 0, rankW = 0;
  if (x0 > y0) rankX++; else rankY++;
  if (x0 > z0) rankX++; else rankZ++;
  if (x0 > w0) rankX++; else rankW++;
  if (y0 > z0) rankY++; else rankZ++;
  if (y0 > w0) rankY++; else rankW++;
  if (z0 > w0) rankZ++; else rankW++;

  const i1 = rankX >= 3 ? 1 : 0, j1 = rankY >= 3 ? 1 : 0;
  const k1 = rankZ >= 3 ? 1 : 0, l1 = rankW >= 3 ? 1 : 0;
  const i2 = rankX >= 2 ? 1 : 0, j2 = rankY >= 2 ? 1 : 0;
  const k2 = rankZ >= 2 ? 1 : 0, l2 = rankW >= 2 ? 1 : 0;
  const i3 = rankX >= 1 ? 1 : 0, j3 = rankY >= 1 ? 1 : 0;
  const k3 = rankZ >= 1 ? 1 : 0, l3 = rankW >= 1 ? 1 : 0;

  const x1 = x0 - i1 + G4, y1 = y0 - j1 + G4, z1 = z0 - k1 + G4, w1 = w0 - l1 + G4;
  const x2 = x0 - i2 + 2 * G4, y2 = y0 - j2 + 2 * G4, z2 = z0 - k2 + 2 * G4, w2 = w0 - l2 + 2 * G4;
  const x3 = x0 - i3 + 3 * G4, y3 = y0 - j3 + 3 * G4, z3 = z0 - k3 + 3 * G4, w3 = w0 - l3 + 3 * G4;
  const x4 = x0 - 1 + 4 * G4, y4 = y0 - 1 + 4 * G4, z4 = z0 - 1 + 4 * G4, w4 = w0 - 1 + 4 * G4;

  const value =
    contribution(i, j, k, l, x0, y0, z0, w0) +
    contribution(i + i1, j + j1, k + k1, l + l1, x1, y1, z1, w1) +
    contribution(i + i2, j + j2, k + k2, l + l2, x2, y2, z2, w2) +
    contribution(i + i3, j + j3, k + k3, l + l3, x3, y3, z3, w3) +
    contribution(i + 1, j + 1, k + 1, l + 1, x4, y4, z4, w4);
  return Math.max(-1, Math.min(1, value * 27));
}

export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  scale?: number;
}

export function fbm4(x: number, y: number, z: number, w: number, options: FbmOptions = {}): number {
  const octaves = options.octaves ?? 4;
  const lacunarity = options.lacunarity ?? 2.03;
  const gain = options.gain ?? 0.5;
  let frequency = options.scale ?? 1 / 600;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise4(x * frequency, y * frequency, z * frequency, w * frequency) * amplitude;
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return normalization ? sum / normalization : 0;
}
