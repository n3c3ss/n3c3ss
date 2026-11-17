/// <reference lib="webworker" />
import { renderTerrain } from "./engine";
import type { FrameInput } from "./engine";

type InitMessage = { type: "init"; canvas: OffscreenCanvas; width: number; height: number; dpr: number; gridStep: number };
type ResizeMessage = { type: "resize"; width: number; height: number; dpr: number; gridStep: number };
type FrameMessage = { type: "frame"; elapsed: number; storyTime: number; pointer: FrameInput["pointer"]; reducedMotion?: boolean };
type WorkerMessage = InitMessage | ResizeMessage | FrameMessage;

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let width = 1, height = 1, dpr = 1, gridStep = 12, busy = false;
function resize(w: number, h: number, ratio: number, step: number) {
  if (!canvas || !context) return;
  width = Math.max(1, w); height = Math.max(1, h); dpr = Math.min(2, Math.max(1, ratio)); gridStep = step;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
}
function render(message: FrameMessage) {
  if (!context || busy) return;
  busy = true;
  try {
    const input: FrameInput = { storyTime: message.storyTime, elapsed: message.elapsed, pointer: message.pointer, reducedMotion: message.reducedMotion };
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderTerrain(context, width, height, input, gridStep);
  } finally {
    busy = false;
    self.postMessage({ type: "frame-done" });
  }
}
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    canvas = message.canvas; context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      self.postMessage({ type: "init-error" });
      return;
    }
    resize(message.width, message.height, message.dpr, message.gridStep);
    self.postMessage({ type: "ready" });
  } else if (message.type === "resize") resize(message.width, message.height, message.dpr, message.gridStep);
  else render(message);
};
