import type { ElementImage, PrintSource } from '../rendering/print';

/**
 * Puts a print on the cloth. A print is an HTML page (public/prints) shown in a same-origin iframe that
 * is a laid-out child of the cloth canvas (WICG html-in-canvas: `<canvas content="drawable">`, the
 * `paint` event, `captureElementImage`): the page keeps its own document, styles and scripts, and every
 * paint that changes it hands the engine worker a fresh ElementImage, drawn straight into a WebGPU
 * texture (GPUQueue.drawElementImageToTexture). The page is laid out at the size the printed cloth has
 * on screen (setFrame, from the engine), as if it were open in a window that size. Without the API (it
 * is behind a flag) there is no faithful way to rasterise the page, so no print is loaded and the cloth
 * is drawn unprinted.
 *
 * Canvas descendants are not hit testable until given a canvas transform (updateElementGeometry): by
 * default the page takes no input; setHit makes it take the pointer where the cloth shows it.
 */

/** Longest wait for a print's web fonts before it is shown anyway (ms). */
const FONT_WAIT = 3000;

interface DrawableCanvas extends HTMLCanvasElement {
  captureElementImage(element: Element): ElementImage;
  requestPaint?(): void;
  getElementImageDefaultSize?(element: Element): { width: number; height: number };
  updateElementGeometry(element: Element, options: { canvasTransform?: DOMMatrixInit }): void;
  clearElementGeometry(element: Element): void;
}

const supportsElementImages = (c: HTMLCanvasElement): c is DrawableCanvas => 'captureElementImage' in c && 'GPUQueue' in window && ('drawElementImageToTexture' in GPUQueue.prototype || 'copyElementImageToTexture' in GPUQueue.prototype);

/**
 * The page's alignment under the pointer: canvas CSS point (x, y) shows page CSS point (px, py), and
 * around it the screen moves j = [dx/dpx, dy/dpx, dx/dpy, dy/dpy] canvas px per page px.
 */
export interface PageHit {
  x: number;
  y: number;
  px: number;
  py: number;
  j: [number, number, number, number];
}

export interface PrintMount {
  /** Prints can reach the cloth in this browser. */
  readonly supported: boolean;
  /** Load the page at `url` and print it, replacing the current print once it has loaded. */
  show(url: string, title: string): void;
  /** Remove the print from the cloth. */
  clear(): void;
  /** The page's size (CSS px) and its snapshots' width (texels). */
  setFrame(width: number, height: number, texels: number): void;
  /** Make the page take the pointer, aligned as `hit` (affine about it), or none of it (null). */
  setHit(hit: PageHit | null): void;
  /** Give the page the keyboard, or take it back. */
  focusPage(on: boolean): void;
  /** A page was shown (its window): it may need the pointer or the keyboard. */
  onShown: ((win: Window) => void) | null;
}

/** `onKey` also receives the page's key presses, before the page does (capture). */
export function mountPrint(canvas: HTMLCanvasElement, send: (source: PrintSource | null, transfer: Transferable[]) => void, onKey: (e: KeyboardEvent) => void): PrintMount {
  // the new attribute and the one earlier builds of the proposal read
  canvas.setAttribute('content', 'drawable');
  canvas.setAttribute('layoutsubtree', '');
  const live = supportsElementImages(canvas) ? canvas : null;
  if (live) console.info('print: HTML-in-Canvas (ElementImage → drawElementImageToTexture)');
  else console.info('print: this browser has no HTML-in-Canvas (Chrome: enable chrome://flags/#canvas-draw-element); the denim is drawn without its print');

  /** The page's size until the engine has placed the print: the window's. */
  const frame = { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight), texels: 2048 };
  let shown: { frame: HTMLIFrameElement; win: Window } | null = null;
  let pending: HTMLIFrameElement | null = null;
  /** Bumped by every show / clear: a slower load never replaces a later one. */
  let token = 0;
  // CSS px to snapshot texels: the snapshot follows the canvas grid's scale, measured, then corrected (a
  // few times per print or frame) so the texture is frame.texels across whatever that scale is
  let zoom = 1;
  let corrections = 0;
  let hit: PageHit | null = null;

  const size = (f: HTMLIFrameElement) => {
    f.style.width = `${frame.width}px`;
    f.style.height = `${frame.height}px`;
  };
  // Chrome applies the canvas transform to the element's own (unzoomed) CSS px, then scales the result
  // by the element's zoom: the page's affine about the hit, divided by the zoom
  const applyHit = () => {
    if (!live || !shown) return;
    if (!hit) {
      live.clearElementGeometry(shown.frame);
      return;
    }
    const [a, b, c, d] = hit.j;
    const e = hit.x - (a * hit.px + c * hit.py);
    const f = hit.y - (b * hit.px + d * hit.py);
    live.updateElementGeometry(shown.frame, { canvasTransform: { a: a / zoom, b: b / zoom, c: c / zoom, d: d / zoom, e: e / zoom, f: f / zoom } });
  };
  const setZoom = (z: number) => {
    zoom = z;
    shown!.frame.style.zoom = String(zoom);
    if (hit) applyHit();
  };
  const rescale = () => {
    if (!shown) return;
    corrections = 0;
    setZoom(frame.texels / (frame.width * window.devicePixelRatio));
    live?.requestPaint?.();
  };

  // a press on the cloth leaves keyboard focus where it is (in the page, while it is interactive)
  canvas.addEventListener('mousedown', (e) => e.preventDefault());

  async function open(f: HTMLIFrameElement, mine: number): Promise<void> {
    const doc = f.contentDocument;
    const win = f.contentWindow;
    if (!doc || !win || doc.URL === 'about:blank') throw new Error('the page could not be opened (it must be served from this site)');
    // shown once its fonts are in (no fallback text on the cloth)
    await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, FONT_WAIT))]);
    if (mine !== token) return;
    win.addEventListener('keydown', onKey, true);
    shown?.frame.remove();
    shown = { frame: f, win };
    pending = null;
    hit = null;
    f.style.visibility = 'visible';
    rescale();
    mount.onShown?.(win);
  }

  if (live) {
    const sizeOf = (f: HTMLIFrameElement) => {
      const s = live.getElementImageDefaultSize?.(f);
      if (s && s.width > 0 && s.height > 0) return { width: Math.round(s.width), height: Math.round(s.height) };
      const r = f.getBoundingClientRect();
      return { width: Math.round(r.width * window.devicePixelRatio), height: Math.round(r.height * window.devicePixelRatio) };
    };
    live.addEventListener('paint', () => {
      if (!shown) return;
      const f = shown.frame;
      const { width, height } = sizeOf(f);
      if (width < 1 || height < 1) return;
      const off = frame.texels / width;
      if (Math.abs(off - 1) > 0.05 && corrections < 3) {
        corrections++;
        // re-laid out at the corrected size; the next paint carries it
        setZoom(zoom * off);
        return;
      }
      let image: ElementImage;
      try {
        image = live.captureElementImage(f);
      } catch (e) {
        console.warn('print: no snapshot yet', e);
        return;
      }
      send({ kind: 'element', image, width, height }, [image as unknown as Transferable]);
    });
  }

  const mount: PrintMount = {
    supported: live !== null,
    onShown: null,
    show(url, title) {
      if (!live) return;
      const mine = ++token;
      pending?.remove();
      const f = document.createElement('iframe');
      pending = f;
      f.setAttribute('drawable', '');
      f.title = title;
      // loads hidden beside the current print, which stays on the cloth until this one is ready
      f.style.cssText = 'position: absolute; left: 0; top: 0; border: 0; visibility: hidden';
      size(f);
      f.addEventListener(
        'load',
        () => {
          if (mine !== token) return;
          open(f, mine).catch((e: unknown) => {
            console.warn(`print: ${url} could not be shown`, e);
            if (mine !== token) return;
            f.remove();
            pending = null;
          });
        },
        { once: true },
      );
      f.src = url;
      canvas.append(f);
    },
    clear() {
      token++;
      pending?.remove();
      pending = null;
      shown?.frame.remove();
      shown = null;
      hit = null;
      send(null, []);
    },
    setFrame(width, height, texels) {
      if (width === frame.width && height === frame.height && texels === frame.texels) return;
      Object.assign(frame, { width, height, texels });
      if (pending) size(pending);
      if (shown) size(shown.frame);
      rescale();
    },
    setHit(h) {
      hit = h;
      applyHit();
    },
    focusPage(on) {
      if (!shown) return;
      if (on) shown.win.focus();
      else if (document.activeElement === shown.frame) shown.frame.blur();
    },
  };
  return mount;
}
