import './style.css';
import { TearAudio } from './audio/audio';
import { computeDrawingBufferSize } from './shared/drawingBuffer';
import { mountPrint } from './print/bridge';
import type { PrintEntry } from './print/catalog';
import { PageInput } from './print/interactive';
import { PRINTS } from 'virtual:prints';
import { ALL_POINTERS, type FromEngine, type PagePoint, type ToEngine } from './shared/messages';

const canvas = document.createElement('canvas');
canvas.className = 'fabric';
document.body.prepend(canvas);

const status = document.querySelector<HTMLElement>('.status')!;
const reset = document.querySelector<HTMLButtonElement>('.reset')!;
const loader = document.querySelector<HTMLElement>('.loader')!;
const menu = document.querySelector<HTMLButtonElement>('.menu')!;
const list = document.querySelector<HTMLElement>('.prints')!;
const badge = document.querySelector<HTMLElement>('.interactive')!;

function fail(message: string): void {
  status.textContent = message;
  status.classList.add('visible');
  document.body.classList.add('failed');
}

if (!('transferControlToOffscreen' in canvas) || !navigator.gpu) {
  fail('This needs a browser with WebGPU.');
  throw new Error('WebGPU or OffscreenCanvas unavailable');
}

const worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
const post = (m: ToEngine, transfer: Transferable[] = []) => worker.postMessage(m, transfer);

// tear sound: the engine sends its acoustic records straight to the audio thread
const audio = new TearAudio((port) => post({ type: 'audio', port }, [port]));

function size() {
  const cssWidth = Math.max(1, window.innerWidth);
  const cssHeight = Math.max(1, window.innerHeight);
  const { width, height } = computeDrawingBufferSize(cssWidth, cssHeight, window.devicePixelRatio);
  return { width, height, cssWidth, cssHeight };
}

// the prints: HTML pages (public/prints) laid out inside the cloth canvas, their renderings sent to
// the engine; the menu lists them, the first is printed at start
const print = mountPrint(canvas, (source, transfer) => post({ type: 'print', source }, transfer), onKey);

// interactive mode (I toggles it): the page takes the mouse and keyboard, the cloth none of it; where
// the pointer is on the page comes from the engine (the cloth under it, as it is now)
const picks = new Map<number, (p: PagePoint | null) => void>();
let pickSeq = 0;
const pickPage = (x: number, y: number) =>
  new Promise<PagePoint | null>((resolve) => {
    const s = pickSeq++;
    picks.set(s, resolve);
    post({ type: 'pagePick', seq: s, x, y });
  });
/** The cursor the engine asks for over the cloth (grab, grabbing). */
let clothCursor = 'grab';
const input = new PageInput(print, pickPage, (on) => {
  badge.hidden = !on;
  canvas.style.cursor = on ? 'default' : clothCursor;
  // the cloth lets go of whatever it held
  if (on) cancelAll(performance.now());
});
window.addEventListener('pointermove', (e) => input.pointerAt(e.clientX, e.clientY), { capture: true, passive: true });
let prints: readonly PrintEntry[] = PRINTS;
/** Id of the print on the cloth (null: none). */
let shown: string | null = null;
renderMenu();
showPrint(prints[0]);
if (import.meta.hot) {
  // dev: prints dropped in or removed appear in the menu; an edited print is printed again
  import.meta.hot.on('prints:list', (next: PrintEntry[]) => {
    prints = next;
    renderMenu();
    if (!prints.some((p) => p.id === shown)) showPrint(prints[0]);
  });
  import.meta.hot.on('prints:change', () => {
    const entry = prints.find((p) => p.id === shown);
    if (entry) print.show(entry.url, entry.id);
  });
}

const offscreen = canvas.transferControlToOffscreen();
post({ type: 'init', canvas: offscreen, ...size() }, [offscreen]);

let resizeQueued = false;
function onResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    post({ type: 'resize', ...size() });
  });
}
window.addEventListener('resize', onResize);
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', onResize);

// every pointer (mouse, pen, each finger) drives its own grip; event times go on the clock both
// threads share (performance.timeOrigin + their own performance.now())
let seq = 0;
const clock = (t: number) => performance.timeOrigin + t;
function pointer(phase: 'down' | 'move' | 'up' | 'cancel', e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  post({ type: 'pointer', phase, id: e.pointerId, seq: seq++, time: clock(e.timeStamp), x: e.clientX - r.left, y: e.clientY - r.top });
}
function cancelAll(time: number) {
  post({ type: 'pointer', phase: 'cancel', id: ALL_POINTERS, seq: seq++, time: clock(time), x: 0, y: 0 });
}
// in interactive mode the cloth takes no input (where the page is under the pointer, the page has it)
canvas.addEventListener('pointerdown', (e) => {
  if (input.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
  audio.unlock();
  canvas.setPointerCapture(e.pointerId);
  pointer('down', e);
});
canvas.addEventListener('pointermove', (e) => {
  if (input.active) return;
  // the engine follows the pointer's path at substep resolution: coalesced samples carry it
  const samples = e.getCoalescedEvents?.() ?? [];
  if (samples.length === 0) pointer('move', e);
  for (const s of samples) pointer('move', s);
});
canvas.addEventListener('pointerup', (e) => {
  // iOS counts the end of a touch, not its start, as the gesture that may start audio
  audio.unlock();
  if (!input.active) pointer('up', e);
});
canvas.addEventListener('pointercancel', (e) => pointer('cancel', e));
canvas.addEventListener('lostpointercapture', (e) => pointer('cancel', e));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (!input.active) post({ type: 'wheel', seq: seq++, deltaY: e.deltaY, time: clock(e.timeStamp) });
  },
  { passive: false },
);
// also the print page's keys, before the page has them (the keyboard is in the page in interactive mode)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (menuOpen()) {
      openMenu(false);
      menu.focus();
    }
    // a print page's event times are on its own clock
    cancelAll(e.view === window ? e.timeStamp : performance.now());
    return;
  }
  // I toggles interactive mode, except where it is being typed into a field of the page
  if ((e.key === 'i' || e.key === 'I') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    input.set(!input.active);
  }
}
/** A text field has the keyboard (of the app or of the page: elements of another realm, so no instanceof). */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes((el as HTMLInputElement).type);
}
window.addEventListener('keydown', onKey);
window.addEventListener('blur', () => cancelAll(performance.now()));
document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState === 'visible';
  post({ type: 'visibility', visible });
  audio.setVisible(visible);
});
// the prints menu: one item per print; choosing one prints it on the cloth as it is (no reset)
function menuOpen() {
  return !list.hasAttribute('hidden');
}
function openMenu(open: boolean) {
  list.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
}
function renderMenu() {
  list.replaceChildren(
    ...prints.map((entry) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const item = document.createElement('button');
      item.className = 'print';
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.dataset.print = entry.id;
      item.textContent = entry.id;
      item.addEventListener('click', () => {
        if (entry.id !== shown) showPrint(entry);
        openMenu(false);
      });
      li.append(item);
      return li;
    }),
  );
  // nothing to choose from where prints cannot reach the cloth
  menu.hidden = !print.supported || prints.length === 0;
  if (menu.hidden) openMenu(false);
  checkMenu();
}
function checkMenu() {
  for (const item of list.querySelectorAll<HTMLElement>('.print')) item.setAttribute('aria-checked', String(item.dataset.print === shown));
}
function showPrint(entry: PrintEntry | undefined) {
  shown = entry?.id ?? null;
  if (entry) print.show(entry.url, entry.id);
  else print.clear();
  checkMenu();
}
menu.addEventListener('click', () => openMenu(!menuOpen()));
document.addEventListener('pointerdown', (e) => {
  if (menuOpen() && !(e.target instanceof Node && (list.contains(e.target) || menu.contains(e.target)))) openMenu(false);
});
reset.addEventListener('click', () => {
  audio.unlock();
  openMenu(false);
  post({ type: 'reset' });
  reset.classList.remove('spin');
  void reset.offsetWidth;
  reset.classList.add('spin');
});

const pendingDev = new Map<number, (r: unknown) => void>();
let markReady: () => void = () => {};
const engineReady = new Promise<void>((r) => (markReady = r));
let devId = 1;
if (import.meta.env.DEV) {
  // Development driver (not part of the product): step physics, move the camera.
  const call = (cmd: Record<string, unknown>) =>
    new Promise((resolve) => {
      const id = devId++;
      pendingDev.set(id, resolve);
      post({ type: 'dev', id, ...cmd } as ToEngine);
    });
  (window as unknown as { __fabric: unknown }).__fabric = {
    ready: () => engineReady,
    step: (substeps: number) => call({ op: 'step', substeps }),
    camera: (c: Record<string, unknown>) => call({ op: 'camera', ...c }),
    pagePick: pickPage,
  };
}

worker.onmessage = (ev: MessageEvent<FromEngine>) => {
  const m = ev.data;
  if (m.type === 'devDone') {
    pendingDev.get(m.id)?.(m.result);
    pendingDev.delete(m.id);
  } else if (m.type === 'progress') {
    loader.style.setProperty('--p', String(m.value));
    loader.setAttribute('aria-valuenow', String(Math.round(100 * m.value)));
  } else if (m.type === 'status') {
    if (m.state === 'error') fail(m.message ?? '');
    else {
      status.textContent = m.state === 'paused' ? (m.message ?? '') : '';
      status.classList.toggle('visible', m.state === 'paused');
    }
    document.body.classList.toggle('loading', m.state === 'loading');
    if (m.state === 'running') markReady();
  } else if (m.type === 'printFrame') {
    print.setFrame(m.width, m.height, m.texels);
  } else if (m.type === 'pagePoint') {
    picks.get(m.seq)?.(m.point);
    picks.delete(m.seq);
  } else if (m.type === 'motion') {
    input.setMoving(m.moving);
  } else if (m.type === 'cursor') {
    clothCursor = m.cursor;
    if (!input.active) canvas.style.cursor = m.cursor;
  } else if (m.type === 'stats') {
    (window as unknown as { __fabricStats?: unknown }).__fabricStats = m.stats;
  }
};
worker.onerror = (e) => {
  fail('The fabric engine stopped unexpectedly.');
  console.error(e);
};
