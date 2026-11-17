const GLYPHS = "01#%&*+-/<>=_[]{}$@~^:;";

export function decodeText(element: HTMLElement, text: string, progress: number, frame: number) {
  const visible = Math.max(0, Math.min(text.length, Math.floor(text.length * progress)));
  let output = "";
  for (let i = 0; i < text.length; i++) {
    if (i < visible) output += text[i];
    else if (i < visible + Math.max(2, Math.ceil(text.length * 0.08))) {
      const hash = (i * 31 + frame * 17) % GLYPHS.length;
      output += GLYPHS[hash];
    } else output += " ";
  }
  element.textContent = output;
}

export function setStyleIfChanged(
  element: HTMLElement,
  property: "opacity" | "transform" | "visibility",
  value: string,
  cache: WeakMap<HTMLElement, Map<string, string>>,
) {
  let styles = cache.get(element);
  if (!styles) {
    styles = new Map();
    cache.set(element, styles);
  }
  if (styles.get(property) === value) return;
  styles.set(property, value);
  element.style[property] = value;
}

export function triggerGlitch(element: HTMLElement) {
  const now = performance.now();
  const last = Number(element.dataset.glitchAt ?? 0);
  if (now - last < 334) return;
  element.dataset.glitchAt = String(now);
  const next = element.classList.contains("g1") ? "g2" : "g1";
  element.classList.remove("g1", "g2");
  element.classList.add(next);
  window.setTimeout(() => element.classList.remove(next), 110);
}

export function createNoiseTile(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(160, 160);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(Math.random() * 255);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return `url(${canvas.toDataURL("image/png")})`;
}
