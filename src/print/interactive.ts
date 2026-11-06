import type { PagePoint } from '../shared/messages';
import type { PrintMount } from './bridge';

/**
 * Interactive mode: the page printed on the cloth takes the mouse and keyboard, and the cloth takes
 * none. The browser delivers the input itself (hover, cursors, focus, typing, selection, scrolling, form
 * controls): the page's iframe is made hit testable with a transform that puts, at the pointer, the
 * page point the cloth shows there.
 *
 * One transform maps the page as a plane, and the cloth is draped and may be torn, so the transform is
 * re-aligned to the cloth under the pointer whenever it moves: a GPU pick (pickPage, through folds and
 * tears as they are now) gives that page point and the page's local slope on screen there. Picks run
 * one at a time, the latest pointer position next; until one returns, the previous alignment carries
 * the pointer to first order (exact at its own point). While the cloth itself moves, the alignment
 * under a still pointer is renewed every frame. Over no page (an opening, a strand, off the page) the
 * page takes no input.
 */
export class PageInput {
  private on = false;
  /** Last pointer position, canvas CSS px. */
  private pointer: { x: number; y: number } | null = null;
  private inFlight = false;
  private queued = false;
  private moving = false;
  /** The alignment in use: canvas point (x, y) shows page point (px, py), slope j (PrintMount.setHit). */
  private hit: { x: number; y: number; px: number; py: number; j: [number, number, number, number] } | null = null;
  private readonly mount: PrintMount;
  private readonly pickPage: (x: number, y: number) => Promise<PagePoint | null>;
  private readonly changed: (on: boolean) => void;

  constructor(mount: PrintMount, pickPage: (x: number, y: number) => Promise<PagePoint | null>, changed: (on: boolean) => void) {
    this.mount = mount;
    this.pickPage = pickPage;
    this.changed = changed;
    // a newly shown page: aligned under the pointer and given the keyboard, if the mode is on
    mount.onShown = (win) => {
      this.hit = null;
      win.addEventListener('pointermove', (e) => this.fromPage(e), { capture: true, passive: true });
      win.addEventListener('pointerdown', (e) => this.fromPage(e), { capture: true, passive: true });
      if (!this.on) return;
      mount.focusPage(true);
      this.request();
    };
  }

  get active(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    if (!this.mount.supported || on === this.on) return;
    this.on = on;
    if (on) {
      this.mount.focusPage(true);
      this.request();
    } else {
      this.hit = null;
      this.mount.setHit(null);
      this.mount.focusPage(false);
    }
    this.changed(on);
  }

  /** The pointer moved over the window (canvas CSS px; the canvas fills the window). */
  pointerAt(x: number, y: number): void {
    this.pointer = { x, y };
    if (this.on) this.request();
  }

  /** The cloth started moving or came to rest. */
  setMoving(moving: boolean): void {
    this.moving = moving;
    if (this.on && moving) this.request();
  }

  /** A pointer event inside the page: its page point is where the current alignment put it on screen. */
  private fromPage(e: PointerEvent): void {
    const h = this.hit;
    if (!this.on || !h) return;
    const dx = e.clientX - h.px;
    const dy = e.clientY - h.py;
    this.pointerAt(h.x + h.j[0] * dx + h.j[2] * dy, h.y + h.j[1] * dx + h.j[3] * dy);
  }

  private request(): void {
    if (!this.pointer) return;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.inFlight = true;
    this.queued = false;
    const at = this.pointer;
    void this.pickPage(at.x, at.y).then((p) => {
      this.inFlight = false;
      if (this.on) {
        this.hit = p ? { x: at.x, y: at.y, px: p.x, py: p.y, j: p.j } : null;
        this.mount.setHit(this.hit);
      }
      if (!this.on) return;
      if (this.queued) this.request();
      // a moving cloth carries the page under a still pointer: follow it frame by frame
      else if (this.moving) requestAnimationFrame(() => this.on && this.moving && !this.inFlight && this.request());
    });
  }
}
