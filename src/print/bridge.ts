import type { ElementImage, PrintSource } from '../rendering/print';
import type { DesignEntry, PrintDesign } from './designs';

/**
 * Puts the printed design on the cloth. With HTML-in-Canvas (WICG html-in-canvas: `<canvas
 * content="drawable">`, the `paint` event, `captureElementImage`), the design is a laid-out child of
 * the cloth canvas; every paint that changes it hands the engine worker a fresh ElementImage, which
 * the worker draws straight into a WebGPU texture (GPUQueue.drawElementImageToTexture). Without the
 * API (it is behind a flag) there is no faithful way to rasterise the element (an SVG foreignObject
 * image is not origin-clean, so it cannot reach the worker): the cloth is drawn unprinted.
 */

/** Texels across the print's texture: ~0.1 mm on the cloth, finer than the yarn pitch. */
const TARGET_WIDTH = 2048;

interface DrawableCanvas extends HTMLCanvasElement {
  captureElementImage(element: Element): ElementImage;
  requestPaint?(): void;
  getElementImageDefaultSize?(element: Element): { width: number; height: number };
}

const supportsElementImages = (c: HTMLCanvasElement): c is DrawableCanvas => 'captureElementImage' in c && 'GPUQueue' in window && ('drawElementImageToTexture' in GPUQueue.prototype || 'copyElementImageToTexture' in GPUQueue.prototype);

export interface PrintMount {
  /** Replace the design on the cloth. */
  show(entry: DesignEntry): void;
}

export function mountPrint(canvas: HTMLCanvasElement, send: (source: PrintSource, transfer: Transferable[]) => void): PrintMount {
  // the new attribute and the one earlier builds of the proposal read
  canvas.setAttribute('content', 'drawable');
  canvas.setAttribute('layoutsubtree', '');
  let design: PrintDesign | null = null;
  // an editable field in the design keeps the keyboard while the cloth is handled (a press on the canvas would blur it)
  canvas.addEventListener('mousedown', (e) => e.preventDefault());
  window.addEventListener('focus', () => design?.focus?.focus({ preventScroll: true }));

  const live = supportsElementImages(canvas) ? canvas : null;
  if (live) console.info('print: HTML-in-Canvas (ElementImage → drawElementImageToTexture)');
  else console.info('print: this browser has no HTML-in-Canvas (Chrome: enable chrome://flags/#canvas-draw-element); the denim is drawn without its print');

  // design pixels to snapshot texels: the snapshot follows the canvas grid's scale, measured, then
  // corrected (a few times per design) so the texture is TARGET_WIDTH across whatever that scale is
  let zoom = 1;
  let corrections = 0;

  if (live) {
    const sizeOf = (root: HTMLElement) => {
      const s = live.getElementImageDefaultSize?.(root);
      if (s && s.width > 0 && s.height > 0) return { width: Math.round(s.width), height: Math.round(s.height) };
      const r = root.getBoundingClientRect();
      return { width: Math.round(r.width * window.devicePixelRatio), height: Math.round(r.height * window.devicePixelRatio) };
    };
    live.addEventListener('paint', () => {
      if (!design) return;
      const root = design.root;
      const { width, height } = sizeOf(root);
      if (width < 1 || height < 1) return;
      const off = TARGET_WIDTH / width;
      if (Math.abs(off - 1) > 0.05 && corrections < 3) {
        corrections++;
        // re-laid out at the corrected size; the next paint carries it
        zoom *= off;
        root.style.zoom = String(zoom);
        return;
      }
      let image: ElementImage;
      try {
        image = live.captureElementImage(root);
      } catch (e) {
        console.warn('print: no snapshot yet', e);
        return;
      }
      send({ kind: 'element', image, width, height }, [image as unknown as Transferable]);
    });
  }

  return {
    show(entry) {
      if (design) {
        design.dispose?.();
        design.root.remove();
      }
      design = entry.create();
      const root = design.root;
      root.setAttribute('drawable', '');
      root.setAttribute('aria-label', entry.label);
      zoom = TARGET_WIDTH / (design.width * window.devicePixelRatio);
      corrections = 0;
      root.style.zoom = String(zoom);
      canvas.append(root);
      design.focus?.focus({ preventScroll: true });
      // the first paint after layout fires on its own; builds that have requestPaint are asked for it
      live?.requestPaint?.();
    },
  };
}
