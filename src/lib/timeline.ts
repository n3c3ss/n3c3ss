import { content } from "./content";
import { TIMING } from "./config";

export type SceneKind = "hero" | "offer" | "faq" | "final";
type Beat = readonly [end: number, vh: number];

export interface Scene {
  id: string;
  kind: SceneKind;
  start: number;
  dur: number;
  end: number;
  restS: number;
}

interface Segment {
  s0: number;
  s1: number;
  v0: number;
  v1: number;
}

interface SceneDefinition {
  id: string;
  kind: SceneKind;
  dur: number;
  beats: readonly Beat[];
}

const definitions: SceneDefinition[] = [
  { id: "hero", kind: "hero", dur: 4, beats: [[1.8, 0], [3.6, 16], [4, 14]] },
  { id: "offer", kind: "offer", dur: 6, beats: [[2.4, 72], [3, 18], [5.6, 20], [6, 12]] },
  ...(content.faq.items.length
    ? [{ id: "faq", kind: "faq" as const, dur: 4, beats: [[3, 44], [3.6, 20], [4, 12]] as const }]
    : []),
  { id: "final", kind: "final", dur: 5, beats: [[1, 30], [4.6, 26], [5, 14]] },
];

export const scenes: Scene[] = [];
const segments: Segment[] = [];
let storyCursor = 0;
let scrollCursor = 0;

for (const definition of definitions) {
  const start = storyCursor;
  let previousEnd = 0;
  for (const [end, vh] of definition.beats) {
    segments.push({
      s0: start + previousEnd,
      s1: start + end,
      v0: scrollCursor,
      v1: scrollCursor + vh,
    });
    scrollCursor += vh;
    previousEnd = end;
  }
  scenes.push({
    id: definition.id,
    kind: definition.kind,
    start,
    dur: definition.dur,
    end: start + definition.dur,
    restS: definition.kind === "hero" ? start + TIMING.heroRest : start + definition.dur - TIMING.leave,
  });
  storyCursor += definition.dur;
}

export const totalStory = storyCursor;
export const totalVh = scrollCursor;
export const trackVh = totalVh + 100;

export function storyFromScroll(vh: number): number {
  const value = Math.max(0, Math.min(totalVh, vh));
  for (const segment of segments) {
    if (segment.v1 > segment.v0 && value <= segment.v1 + 1e-8) {
      const p = (value - segment.v0) / (segment.v1 - segment.v0);
      return segment.s0 + p * (segment.s1 - segment.s0);
    }
  }
  return totalStory;
}

export function scrollFromStory(seconds: number): number {
  const value = Math.max(0, Math.min(totalStory, seconds));
  for (const segment of segments) {
    if (segment.v1 > segment.v0 && value <= segment.s1 + 1e-8) {
      const p = (value - segment.s0) / (segment.s1 - segment.s0);
      return segment.v0 + Math.max(0, p) * (segment.v1 - segment.v0);
    }
  }
  return totalVh;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function envelope(scene: Scene, seconds: number, index: number, count: number): number {
  const local = seconds - scene.start;
  const enter = index === 0 ? 1 : smoothstep(0, TIMING.enter, local);
  const leave = index === count - 1 ? 1 : 1 - smoothstep(scene.dur - TIMING.leave, scene.dur, local);
  return enter * leave;
}

export function leaveShiftU(scene: Scene, seconds: number): number {
  return -40 * smoothstep(scene.dur - TIMING.leave, scene.dur, seconds - scene.start);
}

export function scrollVhToPixels(vh: number, viewportHeight: number): number {
  return (vh / 100) * viewportHeight;
}

export function restScrollPixels(scene: Scene, viewportHeight: number): number {
  return scrollVhToPixels(scrollFromStory(scene.restS), viewportHeight);
}
