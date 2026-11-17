import { envelope, leaveShiftU, restScrollPixels, scenes, storyFromScroll, totalVh } from "../timeline";
import { TIMING } from "../config";
import { track as trackEvent } from "../analytics";
import { createTerrainEngine, terrainTelemetry, type TerrainEngine } from "../engine/engine";
import { createNoiseTile, decodeText, setStyleIfChanged, triggerGlitch } from "./dom";

type SceneElement = HTMLElement & { dataset: DOMStringMap };

export function mountExperience(root: HTMLElement): () => void {
  let canvas = root.querySelector<HTMLCanvasElement>("[data-terrain]");
  const track = root.querySelector<HTMLElement>("[data-scroll-track]");
  const stage = root.querySelector<HTMLElement>("[data-stage]");
  const sceneElements = Array.from(root.querySelectorAll<SceneElement>("[data-scene]"));
  const hudScene = root.querySelector<HTMLElement>("[data-hud-scene]");
  const hudProgress = root.querySelector<HTMLElement>("[data-hud-progress]");
  const hudProgressBar = root.querySelector<HTMLElement>("[data-hud-progressbar]");
  const hudTime = root.querySelector<HTMLElement>("[data-hud-time]");
  const hudCoords = root.querySelector<HTMLElement>("[data-hud-coords]");
  const hudElev = root.querySelector<HTMLElement>("[data-hud-elev]");
  const hudNodes = root.querySelector<HTMLElement>("[data-hud-nodes]");
  const grain = root.querySelector<HTMLElement>("[data-grain]");
  if (!canvas || !track || !stage) return () => {};

  const cache = new WeakMap<HTMLElement, Map<string, string>>();
  const decodeElements = Array.from(root.querySelectorAll<HTMLElement>("[data-decode]"));
  const navItems = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-index]"));
  const decodeSource = new Map<HTMLElement, string>();
  const decodeFrames = new WeakMap<HTMLElement, number>();
  decodeElements.forEach((element) => {
    const source = element.textContent?.trim() ?? "";
    decodeSource.set(element, source);
    element.setAttribute("aria-label", source);
  });
  const listeners = new AbortController();
  let engine: TerrainEngine | null = null;
  let worker: Worker | null = null;
  let workerReady = false;
  let workerBusy = false;
  let raf = 0;
  let last = performance.now();
  let story = 0;
  let targetStory = 0;
  let introStart = performance.now();
  let userInteracted = false;
  let lastActivity = performance.now();
  let pointer = { x: -1000, y: -1000, active: false };
  let pointerTarget = { x: -1000, y: -1000, active: false };
  let hiddenHud = false;
  let hiddenGrain = false;
  let lastTerrainFrame = 0;
  let lastSceneIndex = -1;
  let mounted = true;
  let engineStarted = false;
  let initTimer = 0;
  let idleHandle: number | null = null;
  let pageVisible = !document.hidden;
  const heroMark = root.querySelector<HTMLElement>(".wordmark[data-glitch]");
  const finalMark = root.querySelector<HTMLElement>(".final-wordmark[data-glitch]");
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 8;
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const weakDevice = saveData || Boolean(memory && memory <= 2) || Boolean(touch && memory && memory <= 4 && cores <= 4);
  const terrainFps = weakDevice ? 30 : 60;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionQuery.matches;

  function resize() {
    const rect = stage!.getBoundingClientRect();
    if (engine) engine.resize(rect.width, rect.height);
    if (worker && workerReady) {
      const ratio = Math.min(window.devicePixelRatio || 1, weakDevice ? 1 : touch ? 1.5 : 2);
      try {
        worker.postMessage({ type: "resize", width: rect.width, height: rect.height, dpr: ratio, gridStep: weakDevice ? 16 : 12 });
      } catch {
        activateMainThreadFallback();
      }
    }
    track!.style.height = `${totalVh + 100}vh`;
  }

  function activateMainThreadFallback() {
    worker?.terminate();
    worker = null;
    workerReady = false;
    workerBusy = false;
    if (!canvas || !stage) return;
    // A canvas becomes permanently transferred after transferControlToOffscreen.
    // Replace it before asking the main thread for a 2D context.
    const replacement = document.createElement("canvas");
    replacement.className = canvas.className;
    replacement.setAttribute("data-terrain", "");
    replacement.setAttribute("aria-hidden", "true");
    canvas.replaceWith(replacement);
    canvas = replacement;
    engine = createTerrainEngine(canvas);
    const rect = stage.getBoundingClientRect();
    engine.resize(rect.width, rect.height);
  }

  function initEngine() {
    if (!mounted || document.hidden || engineStarted) return;
    engineStarted = true;
    if (canvas && "transferControlToOffscreen" in canvas && typeof Worker !== "undefined") {
      try {
        const activeWorker = new Worker(new URL("../engine/topo.worker.ts", import.meta.url));
        worker = activeWorker;
        activeWorker.onmessage = (event: MessageEvent) => {
          if (event.data?.type === "ready") workerReady = true;
          if (event.data?.type === "frame-done") workerBusy = false;
          if (event.data?.type === "init-error" && worker === activeWorker) activateMainThreadFallback();
        };
        activeWorker.onerror = () => {
          if (worker === activeWorker) activateMainThreadFallback();
        };
        activeWorker.onmessageerror = () => {
          if (worker === activeWorker) activateMainThreadFallback();
        };
        const offscreen = canvas.transferControlToOffscreen();
        const rect = stage!.getBoundingClientRect();
        activeWorker.postMessage({
          type: "init",
          canvas: offscreen,
          width: rect.width,
          height: rect.height,
          dpr: Math.min(window.devicePixelRatio || 1, weakDevice ? 1 : touch ? 1.5 : 2),
          gridStep: weakDevice ? 16 : 12,
        }, [offscreen]);
        return;
      } catch {
        activateMainThreadFallback();
        return;
      }
    }
    if (!canvas) return;
    engine = createTerrainEngine(canvas);
    const rect = stage!.getBoundingClientRect();
    engine.resize(rect.width, rect.height);
  }

  function updateScene(time: number, now: number) {
    const index = scenes.findIndex((scene, sceneIndex) =>
      time >= scene.start && (time < scene.end || sceneIndex === scenes.length - 1),
    );
    if (index !== lastSceneIndex) {
      if (index === 0 && lastSceneIndex === -1 && heroMark) {
        heroMark.classList.add("frame-active");
        if (!reduced) triggerGlitch(heroMark);
      }
      if (index === scenes.length - 1 && lastSceneIndex !== -1 && finalMark) {
        finalMark.classList.add("frame-active");
        if (!reduced) triggerGlitch(finalMark);
      }
      const nextScene = scenes[index];
      if (nextScene) trackEvent("scene_view", { scene: nextScene.kind });
      lastSceneIndex = index;
    }
    sceneElements.forEach((element, elementIndex) => {
      const scene = scenes[elementIndex];
      if (!scene) return;
      // Reduced motion retains gentle opacity crossfades, but removes vertical
      // scene movement and scroll-follow easing.
      const alpha = envelope(scene, time, elementIndex, scenes.length);
      const shift = reduced ? 0 : leaveShiftU(scene, time);
      setStyleIfChanged(element, "opacity", alpha.toFixed(4), cache);
      setStyleIfChanged(element, "transform", `translate3d(0,${shift * Math.min(window.innerWidth, window.innerHeight) / 1080}px,0)`, cache);
      setStyleIfChanged(element, "visibility", alpha > 0.001 ? "visible" : "hidden", cache);
      element.setAttribute("aria-hidden", alpha > 0.01 ? "false" : "true");
    });

    decodeElements.forEach((element) => {
      const source = decodeSource.get(element) ?? "";
      const owner = element.closest<HTMLElement>("[data-scene]");
      const sceneIndex = owner ? sceneElements.indexOf(owner) : -1;
      const scene = sceneIndex >= 0 ? scenes[sceneIndex] : undefined;
      const local = scene ? time - scene.start : 0;
      const progress = reduced ? 1 : Math.max(0, Math.min(1, (local - 0.12) / 0.72));
      const frame = Math.floor(now / 42);
      if (decodeFrames.get(element) !== frame || progress >= 1) {
        decodeText(element, source, progress, frame);
        decodeFrames.set(element, frame);
      }
    });

    const active = index >= 0 ? scenes[index] : scenes[scenes.length - 1];
    // The sticky mobile CTA is reserved for scenes that do not contain their
    // own primary action. HERO, OFFER and FINAL already have an in-scene CTA.
    root.classList.toggle("mobile-cta-visible", active?.kind === "faq");
    if (hudScene && active) hudScene.textContent = `SCN ${String(Math.max(1, index + 1)).padStart(2, "0")}/${String(scenes.length).padStart(2, "0")} · ${active.kind.toUpperCase()}`;
    const progress = Math.max(0, Math.min(1, time / scenes[scenes.length - 1].end));
    if (hudProgress) hudProgress.style.transform = `scaleX(${progress})`;
    if (hudProgressBar) hudProgressBar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    navItems.forEach((item, navIndex) => {
      if (navIndex === index) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    if (hudTime) hudTime.textContent = `T+${time.toFixed(2).padStart(5, "0")} / ${scenes[scenes.length - 1].end.toFixed(2)}`;
    const telemetry = terrainTelemetry(time, performance.now() / 1000, reduced);
    if (hudCoords) hudCoords.textContent = `X ${telemetry.x >= 0 ? "+" : ""}${telemetry.x.toFixed(1)}  Y ${telemetry.y >= 0 ? "+" : ""}${telemetry.y.toFixed(1)}  Z ${telemetry.zoom.toFixed(2)}`;
    if (hudElev) hudElev.textContent = `ELEV ${String(telemetry.elevation).padStart(4, "0")} M`;
    if (hudNodes) hudNodes.textContent = `NODES ${String(telemetry.activeNodes).padStart(3, "0")}`;
  }

  function frame(now: number) {
    if (!pageVisible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const scrollVh = (window.scrollY / Math.max(1, window.innerHeight)) * 100;
    if (userInteracted) {
      targetStory = storyFromScroll(scrollVh);
      if (reduced) story = targetStory;
      else {
        const tau = touch ? TIMING.tauTouch : TIMING.tauWheel;
        story += (targetStory - story) * (1 - Math.exp(-dt / tau));
      }
    } else if (!reduced) {
      story = Math.min(TIMING.heroRest, (now - introStart) / 1000);
    }

    // Give the cursor a short spring-follow so the terrain mound has a little mass.
    if (pointerTarget.active) {
      if (!pointer.active) pointer = { ...pointerTarget };
      else {
        const follow = 1 - Math.exp(-dt / 0.075);
        pointer.x += (pointerTarget.x - pointer.x) * follow;
        pointer.y += (pointerTarget.y - pointer.y) * follow;
      }
      pointer.active = true;
    } else if (pointer.active) {
      pointer.active = false;
    }

    updateScene(story, now);
    const idleTerrain = now - lastActivity > 2000 && !pointer.active;
    const frameInterval = idleTerrain ? 1000 / 12 : 1000 / terrainFps;
    if (now - lastTerrainFrame >= frameInterval) {
      lastTerrainFrame = now;
      const elapsed = now / (reduced ? 4000 : 1000);
      if (worker && workerReady && !workerBusy) {
        workerBusy = true;
        try {
          worker.postMessage({ type: "frame", elapsed, storyTime: story, pointer, reducedMotion: reduced });
        } catch {
          activateMainThreadFallback();
        }
      } else if (!worker) engine?.frame({ storyTime: story, elapsed, pointer, reducedMotion: reduced });
    }
    raf = window.requestAnimationFrame(frame);
  }

  function onScroll() {
    userInteracted = true;
    lastActivity = performance.now();
    root.classList.add("has-scrolled");
  }
  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const rect = stage!.getBoundingClientRect();
    pointerTarget = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true };
    lastActivity = performance.now();
  }
  function onPointerLeave() { pointerTarget.active = false; }
  function goToScene(index: number) {
    const scene = scenes[Math.max(0, Math.min(scenes.length - 1, index))];
    if (!scene) return;
    userInteracted = true;
    window.scrollTo({ top: restScrollPixels(scene, window.innerHeight), behavior: reduced ? "auto" : "smooth" });
  }
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target;
    const isControl = target instanceof HTMLElement && Boolean(target.closest('a, button, input, textarea, select, [contenteditable="true"], [role="textbox"]'));
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isControl) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const found = scenes.findIndex((scene) => story >= scene.start && story < scene.end);
      const current = found < 0 ? (story >= scenes[scenes.length - 1].end ? scenes.length - 1 : 0) : found;
      goToScene(current + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key.toLowerCase() === "h") {
      hiddenHud = !hiddenHud;
      root.classList.toggle("hud-hidden", hiddenHud);
    } else if (event.key.toLowerCase() === "g") {
      hiddenGrain = !hiddenGrain;
      root.classList.toggle("grain-hidden", hiddenGrain);
    }
  }

  root.querySelectorAll<HTMLElement>("[data-glitch]").forEach((item) => {
    item.addEventListener("pointerenter", () => {
      if (!reduced && item.matches(".main-button")) triggerGlitch(item);
    }, { signal: listeners.signal });
    item.addEventListener("click", () => {
      if (!reduced && item.matches(".main-button")) triggerGlitch(item);
    }, { signal: listeners.signal });
  });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-track]") : null;
    if (!target) return;
    trackEvent(target.dataset.track ?? "interaction", { place: target.dataset.place ?? "unknown" });
  }, { signal: listeners.signal });

  const grainUrl = createNoiseTile();
  if (grain && grainUrl) grain.style.backgroundImage = grainUrl;
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  stage.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("keydown", onKeyDown);
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches;
    if (reduced) {
      pointer = { x: -1000, y: -1000, active: false };
      pointerTarget = { x: -1000, y: -1000, active: false };
      // Snap immediately to the current scroll position when motion is disabled.
      if (userInteracted) story = targetStory = storyFromScroll((window.scrollY / Math.max(1, window.innerHeight)) * 100);
    }
  };
  const onVisibilityChange = () => {
    pageVisible = !document.hidden;
    if (!pageVisible) {
      window.cancelAnimationFrame(raf);
      return;
    }
    last = performance.now();
    lastActivity = last;
    if (mounted && !engineStarted) initEngine();
    if (mounted) raf = window.requestAnimationFrame(frame);
  };
  motionQuery.addEventListener("change", onMotionChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  resize();
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void });
  if (idle.requestIdleCallback) idleHandle = idle.requestIdleCallback(initEngine);
  else initTimer = window.setTimeout(initEngine, 120);
  if (pageVisible) raf = window.requestAnimationFrame(frame);

  return () => {
    mounted = false;
    window.cancelAnimationFrame(raf);
    if (idleHandle !== null) idle.cancelIdleCallback?.(idleHandle);
    if (initTimer) window.clearTimeout(initTimer);
    motionQuery.removeEventListener("change", onMotionChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    resizeObserver.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onPointerMove);
    stage?.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("keydown", onKeyDown);
    listeners.abort();
    worker?.terminate();
    engine?.destroy();
  };
}
