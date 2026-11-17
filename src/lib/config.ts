export const PALETTE = {
  BG: "#010803",
  PANEL: "#051B0D",
  DEEP: "#0B331A",
  LINE: "#3F6C50",
  FRAME: "#0A7131",
  MUTED: "#6E9E7E",
  NEON: "#0BF77F",
  MINT: "#64FAAE",
  WHITE: "#F7FBF8",
  WM_MID: "#4CF8A3",
  CODE: "#3B8252",
} as const;

export const TIMING = {
  heroRest: 1.8,
  enter: 0.4,
  leave: 0.4,
  tauWheel: 0.1,
  tauTouch: 0.05,
  breathePeriod: 54.5,
  glitchMinGapMs: 334,
} as const;

export const TOPO = {
  gridStep: 12,
  gridStepMax: 22,
  contourStep: 10,
  indexEvery: 5,
  labelEvery: 290,
  fbm: { octaves: 4, lacunarity: 2.03, gain: 0.5, scale: 1 / 600 },
  heightMax: 230,
  slowFrameMs: 13,
  dprMax: 2,
  dprMaxTouch: 1.5,
  lowEnd: { fps: 30, dpr: 1, gridStep: 16 },
  idleFps: 12,
  idleAfterMs: 2000,
  cameraDrift: { x: 70, y: 40, zoom: 0.025 },
} as const;

export const ANALYTICS = { provider: "none" as "none" | "plausible" | "umami" };
