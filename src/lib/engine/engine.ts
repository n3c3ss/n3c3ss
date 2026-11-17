import { PALETTE, TIMING, TOPO } from "../config";
import { fbm4 } from "./noise";

export interface FrameInput {
  storyTime: number;
  elapsed: number;
  pointer: { x: number; y: number; active: boolean };
  reducedMotion?: boolean;
}
export interface TerrainEngine {
  resize(width: number, height: number): void;
  frame(input: FrameInput): void;
  destroy(): void;
}
type TerrainContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = readonly [number, number];
type Segment = { a: Point; b: Point };
type CameraKey = { s: number; x: number; y: number; zoom: number };

// Reused between frames to avoid allocating a full height field on every tick.
let fieldBuffer = new Float32Array(0);

// The map has a single world coordinate system. Scene keys move the camera
// through it, so the terrain, trail, peaks and nodes remain spatially coherent.
const cameraKeys: CameraKey[] = [
  { s: 0, x: 0, y: 0, zoom: 1.12 },
  { s: 3.6, x: 0, y: 0, zoom: 1 },
  { s: 5.2, x: 250, y: -70, zoom: 0.82 },
  { s: 9.6, x: 250, y: -70, zoom: 0.82 },
  { s: 14.6, x: -180, y: 170, zoom: 1.02 },
  { s: 18, x: 0, y: 0, zoom: 1 },
  { s: 19, x: 0, y: 0, zoom: 1 },
];
const peakSeeds = [
  { x: -310, y: -115, r: 120, h: 92 },
  { x: -115, y: 175, r: 155, h: 128 },
  { x: 125, y: -190, r: 135, h: 112 },
  { x: 330, y: 115, r: 165, h: 145 },
  { x: 15, y: 35, r: 100, h: 76 },
];
const trail: Point[] = [[-470, 210], [-330, 85], [-215, 130], [-85, -20], [45, 45], [180, -85], [345, -25], [465, -190]];
const nodes: Point[] = [
  [-310, -115], [-115, 175], [125, -190], [330, 115], [15, 35], [-420, -185], [420, 235], [210, 260], [-220, -270], [20, -320],
];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function cameraAt(s: number, elapsed: number, reduced: boolean) {
  let i = 0;
  while (i < cameraKeys.length - 2 && s > cameraKeys[i + 1].s) i++;
  const a = cameraKeys[i], b = cameraKeys[i + 1];
  const t = smooth((s - a.s) / Math.max(0.001, b.s - a.s));
  const drift = reduced ? 0 : 1;
  return {
    x: mix(a.x, b.x, t) + Math.sin(elapsed * 0.025) * TOPO.cameraDrift.x * drift,
    y: mix(a.y, b.y, t) + Math.cos(elapsed * 0.021) * TOPO.cameraDrift.y * drift,
    zoom: Math.exp(mix(Math.log(a.zoom), Math.log(b.zoom), t) + Math.sin(elapsed * 0.018) * TOPO.cameraDrift.zoom * drift),
  };
}

export function terrainTelemetry(storyTime: number, elapsed: number, reduced = false) {
  const camera = cameraAt(storyTime, elapsed, reduced);
  const activeNodes = Math.floor(clamp((storyTime - 4.2) / 3.2, 0, 1) * nodes.length);
  const elevation = Math.round(90 + 45 * Math.sin(storyTime * 0.2) + activeNodes * 3);
  return { ...camera, activeNodes, elevation };
}

function peakHeight(index: number, s: number) {
  const local = clamp((s - (4.1 + index * 0.24)) / 1.9, 0, 1);
  const settle = 1 - 0.18 * smooth((s - 10) / 3);
  return peakSeeds[index].h * smooth(local) * settle;
}

function fieldValue(x: number, y: number, theta: number, story: number, pointer: FrameInput["pointer"]) {
  let value = (fbm4(x, y, Math.cos(theta) * 600, Math.sin(theta) * 600, TOPO.fbm) * 0.5 + 0.5) * TOPO.heightMax;
  for (let i = 0; i < peakSeeds.length; i++) {
    const peak = peakSeeds[i];
    const dx = x - peak.x, dy = y - peak.y;
    const distortion = 1 + 0.12 * fbm4(x + i * 91, y - i * 37, 0, 0, { octaves: 2, scale: 1 / 95 });
    const d2 = dx * dx + dy * dy;
    value += peakHeight(i, story) * Math.exp(-d2 / (2 * (peak.r * distortion) ** 2));
  }
  if (pointer.active) {
    const dx = x - pointer.x, dy = y - pointer.y;
    value += 150 * Math.exp(-(dx * dx + dy * dy) / (2 * 150 * 150));
  }
  return clamp(value, 0, TOPO.heightMax);
}

function stitch(segments: Segment[]): Point[][] {
  const key = (p: Point) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const adjacency = new Map<string, number[]>();
  segments.forEach((segment, i) => {
    for (const p of [segment.a, segment.b]) {
      const k = key(p), list = adjacency.get(k) ?? [];
      list.push(i); adjacency.set(k, list);
    }
  });
  const used = new Uint8Array(segments.length);
  const paths: Point[][] = [];
  const extend = (path: Point[], atStart: boolean) => {
    while (true) {
      const endpoint = atStart ? path[0] : path[path.length - 1];
      const candidates = adjacency.get(key(endpoint)) ?? [];
      const next = candidates.find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = 1;
      const seg = segments[next];
      const other = key(seg.a) === key(endpoint) ? seg.b : seg.a;
      if (atStart) path.unshift(other); else path.push(other);
    }
  };
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const path: Point[] = [segments[i].a, segments[i].b];
    extend(path, false); extend(path, true);
    if (path.length > 2) paths.push(path);
  }
  return paths;
}

function drawPathReveal(ctx: TerrainContext, path: Point[], progress: number) {
  if (progress <= 0 || path.length < 2) return;
  if (progress >= 0.999) {
    ctx.beginPath();
    path.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
    ctx.stroke();
    return;
  }
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const length = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    lengths.push(length); total += length;
  }
  let remaining = total * progress;
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length && remaining > 0; i++) {
    const length = lengths[i - 1];
    if (remaining >= length) ctx.lineTo(path[i][0], path[i][1]);
    else {
      const t = remaining / Math.max(length, 0.001);
      ctx.lineTo(mix(path[i - 1][0], path[i][0], t), mix(path[i - 1][1], path[i][1], t));
    }
    remaining -= length;
  }
  ctx.stroke();
}

function drawContours(ctx: TerrainContext, field: Float32Array, cols: number, rows: number, step: number, story: number) {
  for (let index = 1; index <= 19; index++) {
    const reveal = smooth((story - 0.08 - index * 0.035) / 1.25);
    if (reveal <= 0.001) continue;
    const level = index / 20 * TOPO.heightMax;
    const major = index % TOPO.indexEvery === 0;
    const segments: Segment[] = [];
    for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
      const i = y * cols + x;
      const v = [field[i], field[i + 1], field[i + cols + 1], field[i + cols]];
      const p: Point[] = [[x * step, y * step], [(x + 1) * step, y * step], [(x + 1) * step, (y + 1) * step], [x * step, (y + 1) * step]];
      const hits: Point[] = [];
      for (let e = 0; e < 4; e++) {
        const n = (e + 1) % 4;
        if ((v[e] < level && v[n] >= level) || (v[e] >= level && v[n] < level)) {
          const t = v[e] === v[n] ? 0.5 : (level - v[e]) / (v[n] - v[e]);
          hits.push([mix(p[e][0], p[n][0], t), mix(p[e][1], p[n][1], t)]);
        }
      }
      if (hits.length === 2) {
        segments.push({ a: hits[0], b: hits[1] });
      } else if (hits.length === 4) {
        // Resolve saddle cells with the cell-centre value instead of joining
        // crossings in an arbitrary order (which can invert contour topology).
        const centreHigh = (v[0] + v[1] + v[2] + v[3]) * 0.25 >= level;
        const cornerHigh = v[0] >= level;
        if (centreHigh === cornerHigh) {
          segments.push({ a: hits[0], b: hits[1] }, { a: hits[2], b: hits[3] });
        } else {
          segments.push({ a: hits[3], b: hits[0] }, { a: hits[1], b: hits[2] });
        }
      }
    }
    const paths = stitch(segments);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = major ? PALETTE.NEON : PALETTE.LINE;
    ctx.lineWidth = major ? 1.5 : 0.9;
    ctx.globalAlpha = major ? 0.82 : level < 90 ? 0.35 : level < 170 ? 0.47 : 0.6;
    if (major) {
      ctx.save(); ctx.strokeStyle = PALETTE.NEON; ctx.lineWidth = 5.5; ctx.globalAlpha = 0.09;
      for (const path of paths) drawPathReveal(ctx, path, reveal);
      ctx.restore();
      ctx.strokeStyle = PALETTE.NEON; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.82;
    }
    for (const path of paths) {
      drawPathReveal(ctx, path, reveal);
      if (major && reveal > 0.88 && path.length > 8) {
        let distance = 0, nextLabel = TOPO.labelEvery;
        for (let j = 1; j < path.length; j++) {
          const a = path[j - 1], b = path[j];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          distance += length;
          if (distance >= nextLabel) {
            const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
            ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(angle);
            ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillStyle = PALETTE.BG; ctx.fillRect(-16, -7, 32, 14);
            ctx.fillStyle = PALETTE.MINT; ctx.globalAlpha = 0.92; ctx.fillText(`${Math.round(level)}M`, 0, 0);
            ctx.restore(); nextLabel += TOPO.labelEvery;
          }
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawTrail(ctx: TerrainContext, story: number, elapsed: number) {
  const progress = smooth((story - 4.2) / 3.2);
  if (progress <= 0) return;
  ctx.save(); ctx.strokeStyle = PALETTE.NEON; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
  ctx.setLineDash([7, 9]); ctx.lineDashOffset = -elapsed * 0.025;
  drawPathReveal(ctx, trail, progress);
  ctx.setLineDash([]);
  for (let i = 0; i < nodes.length; i++) {
    const reveal = clamp(progress * nodes.length - i, 0, 1);
    if (reveal <= 0) continue;
    const p = nodes[i];
    ctx.globalAlpha = reveal * 0.95; ctx.fillStyle = PALETTE.NEON;
    ctx.fillRect(p[0] - 3.5, p[1] - 3.5, 7, 7);
    ctx.beginPath(); ctx.strokeStyle = PALETTE.MINT; ctx.lineWidth = 1;
    ctx.arc(p[0], p[1], 7 + (elapsed * 0.035 + i * 2) % 10, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawSceneAnnotations(ctx: TerrainContext, story: number, elapsed: number) {
  const marks = [
    { at: 3.5, x: -310, y: -115, code: "01 / ORIGIN", note: "SIGNAL DETECTED" },
    { at: 7.2, x: 125, y: -190, code: "02 / ROUTE", note: "PATH ESTABLISHED" },
    { at: 11.8, x: 330, y: 115, code: "03 / SYSTEM", note: "NODE SYNCHRONIZED" },
    { at: 15.4, x: 15, y: 35, code: "04 / CONTACT", note: "CHANNEL OPEN" },
  ];
  ctx.save();
  ctx.font = "10px 'JetBrains Mono', monospace";
  for (const mark of marks) {
    const alpha = smooth((story - mark.at) / 0.45) * (1 - smooth((story - mark.at - 2.8) / 0.5));
    if (alpha <= 0.01) continue;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.4 + mark.x * 0.01);
    ctx.globalAlpha = alpha * (0.72 + pulse * 0.2);
    ctx.strokeStyle = PALETTE.MINT; ctx.fillStyle = PALETTE.MINT; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(mark.x, mark.y); ctx.lineTo(mark.x + 22, mark.y - 18); ctx.lineTo(mark.x + 118, mark.y - 18); ctx.stroke();
    ctx.fillRect(mark.x - 2, mark.y - 2, 4, 4);
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(mark.code, mark.x + 27, mark.y - 22);
    ctx.globalAlpha = alpha * 0.58; ctx.fillStyle = PALETTE.MUTED;
    ctx.textBaseline = "top"; ctx.fillText(mark.note, mark.x + 27, mark.y - 16);
  }
  ctx.restore();
}

export function renderTerrain(ctx: TerrainContext, width: number, height: number, input: FrameInput, gridStep: number = TOPO.gridStep) {
  const { storyTime, elapsed, pointer } = input;
  const theta = Math.PI * 2 * elapsed / TIMING.breathePeriod;
  ctx.fillStyle = PALETTE.BG; ctx.fillRect(0, 0, width, height);
  const fog = ctx.createRadialGradient(width * 0.68 + Math.sin(elapsed * 0.035) * width * 0.08, height * 0.4, 0, width * 0.68, height * 0.4, Math.max(width, height) * 0.72);
  fog.addColorStop(0, "rgba(11,51,26,.25)"); fog.addColorStop(0.55, "rgba(11,51,26,.09)"); fog.addColorStop(1, "rgba(1,8,3,0)");
  ctx.fillStyle = fog; ctx.fillRect(0, 0, width, height);

  const reduced = Boolean(input.reducedMotion);
  const camera = cameraAt(storyTime, elapsed, reduced);
  const zoom = camera.zoom;
  const worldWidth = width / zoom, worldHeight = height / zoom;
  const left = camera.x - worldWidth / 2, top = camera.y - worldHeight / 2;
  const cols = Math.ceil(width / (gridStep * zoom)) + 3;
  const rows = Math.ceil(height / (gridStep * zoom)) + 3;
  const worldStep = gridStep;
  const fieldLength = cols * rows;
  if (fieldBuffer.length !== fieldLength) fieldBuffer = new Float32Array(fieldLength);
  const field = fieldBuffer;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const wx = left + (gx - 1) * worldStep, wy = top + (gy - 1) * worldStep;
    field[gy * cols + gx] = fieldValue(wx, wy, theta, storyTime, pointer.active ? { x: (pointer.x - width / 2) / zoom + camera.x, y: (pointer.y - height / 2) / zoom + camera.y, active: true } : pointer);
  }
  // Field samples live at (left - step, top - step) + grid coordinates.
  // Translate the world origin first, then apply the camera transform.
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(zoom, zoom); ctx.translate(-camera.x + left - worldStep, -camera.y + top - worldStep);
  drawContours(ctx, field, cols, rows, worldStep, reduced ? Math.max(storyTime, 2.4) : storyTime);
  drawTrail(ctx, storyTime, elapsed);
  drawSceneAnnotations(ctx, storyTime, elapsed);
  // Sparse coordinate grid and edge ticks share the camera transform.
  ctx.strokeStyle = PALETTE.FRAME; ctx.lineWidth = 0.65; ctx.globalAlpha = 0.25;
  for (let x = Math.floor(left / 240) * 240; x <= left + worldWidth; x += 240) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + worldHeight); ctx.stroke();
  }
  for (let y = Math.floor(top / 240) * 240; y <= top + worldHeight; y += 240) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + worldWidth, y); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();

  // Decorative data columns, intentionally restrained so the content stays legible.
  ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = PALETTE.CODE; ctx.globalAlpha = 0.26;
  const dataLines = ["0x3F 7A 1C 09", "FIELD / SCAN", "VECTOR: OK", "NODE_SYNC()", "0B 33 1A 7F", "ELEVATION MAP"];
  for (let i = 0; i < dataLines.length; i++) {
    const y = ((i * 43 + elapsed * 7) % (height + 80)) - 30;
    ctx.fillText(dataLines[i], 18, y); ctx.fillText(dataLines[(i + 2) % dataLines.length], width - 128, (y + height / 2) % height);
  }
  ctx.restore();

  // Thresholded dot matrix: a second, finer field that remains screen-anchored.
  ctx.save(); ctx.fillStyle = PALETTE.CODE; ctx.globalAlpha = 0.2;
  for (let y = 8; y < height; y += 16) for (let x = 8; x < width; x += 16) {
    const sample = fbm4(x + 91, y - 37, Math.cos(theta) * 600, Math.sin(theta) * 600, { octaves: 2, scale: 1 / 260 });
    if (sample > 0.16) {
      ctx.beginPath(); ctx.arc(x, y, sample > 0.38 ? 1.2 : 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // Four restrained edge beacons, with slow independent pulses.
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 8 + i * 5 : width - 8 - (i - 2) * 5;
    const pulse = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(elapsed * 0.7 + i * 1.7));
    ctx.fillStyle = PALETTE.NEON; ctx.globalAlpha = pulse;
    ctx.fillRect(x, height * (0.22 + 0.13 * i), 1, height * 0.18);
  }
  ctx.restore();
  if (pointer.active) {
    // Survey cursor: concentric elevation rings, a fine reticle and a live height readout.
    const worldX = (pointer.x - width / 2) / zoom + camera.x;
    const worldY = (pointer.y - height / 2) / zoom + camera.y;
    const cursorElevation = Math.round(fieldValue(worldX, worldY, theta, storyTime, { x: -1e6, y: -1e6, active: false }));
    ctx.save();
    ctx.strokeStyle = PALETTE.NEON;
    ctx.lineWidth = 0.85;
    for (let i = 0; i < 5; i++) {
      const radius = 9 + i * 9;
      ctx.globalAlpha = 0.62 - i * 0.085;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(pointer.x - 27, pointer.y); ctx.lineTo(pointer.x - 7, pointer.y);
    ctx.moveTo(pointer.x + 7, pointer.y); ctx.lineTo(pointer.x + 27, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 27); ctx.lineTo(pointer.x, pointer.y - 7);
    ctx.moveTo(pointer.x, pointer.y + 7); ctx.lineTo(pointer.x, pointer.y + 27);
    ctx.arc(pointer.x, pointer.y, 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.MINT;
    ctx.font = "700 9px 'DejaVu Sans Mono', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.shadowColor = PALETTE.BG; ctx.shadowBlur = 8;
    ctx.fillText(`ELEV ${String(cursorElevation).padStart(4, "0")}`, pointer.x + 24, pointer.y - 12);
    ctx.restore();
  }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.76);
  vignette.addColorStop(0, "rgba(1,8,3,0)"); vignette.addColorStop(1, "rgba(1,8,3,.78)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = PALETTE.NEON; ctx.lineWidth = 1; ctx.globalAlpha = 0.48;
  const m = Math.max(18, Math.min(width, height) * 0.026), l = Math.max(12, Math.min(width, height) * 0.022);
  for (const [x, y, sx, sy] of [[m,m,1,1],[width-m,m,-1,1],[m,height-m,1,-1],[width-m,height-m,-1,-1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy*l); ctx.lineTo(x, y); ctx.lineTo(x + sx*l, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function createTerrainEngine(canvas: HTMLCanvasElement): TerrainEngine {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D context is unavailable");
  const ctx = context;
  let width = 1, height = 1, dpr = 1, gridStep: number = TOPO.gridStep, slowFrames = 0, destroyed = false;
  function resize(w: number, h: number) {
    width = Math.max(1, w); height = Math.max(1, h);
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency || 8;
    const weak = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData || (memory && memory <= 2) || (touch && memory && memory <= 4 && cores <= 4));
    dpr = Math.min(window.devicePixelRatio || 1, weak ? 1 : touch ? TOPO.dprMaxTouch : TOPO.dprMax);
    gridStep = weak ? TOPO.lowEnd.gridStep : TOPO.gridStep;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  }
  function frame(input: FrameInput) {
    if (destroyed) return;
    const start = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderTerrain(ctx, width, height, input, gridStep);
    if (performance.now() - start > TOPO.slowFrameMs) {
      slowFrames++; if (slowFrames > 6) gridStep = Math.min(TOPO.gridStepMax, gridStep + 2);
      if (slowFrames > 12 && dpr > 1) { dpr = 1; resize(width, height); }
    } else slowFrames = Math.max(0, slowFrames - 1);
  }
  return { resize, frame, destroy() { destroyed = true; } };
}
