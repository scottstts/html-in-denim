import type { PrintDesign } from './index';

/**
 * The default design: ordinary HTML and CSS (web fonts, inline SVG text on a path, gradients). It is
 * live: a clock ticks in it, and the name line is an editable text field (type to change it; its caret
 * shows on the cloth too). Two-ink vintage palette, sized in design pixels (DESIGN_WIDTH x DESIGN_HEIGHT).
 */

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 1160;
/** Longest name the field takes. */
const NAME_MAX = 14;

const CSS = `
.pr-root {
  box-sizing: border-box;
  width: ${DESIGN_WIDTH}px;
  height: ${DESIGN_HEIGHT}px;
  padding: 24px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #f1e7cf;
  font-family: Oswald, 'Arial Narrow', sans-serif;
  font-weight: 600;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  background: transparent;
  --cream: #f1e7cf;
  --mustard: #e3a339;
  --brick: #c4472d;
}
.pr-root * { box-sizing: border-box; }
.pr-emblem {
  position: relative;
  width: 640px;
  height: 640px;
  flex: none;
}
.pr-rays {
  position: absolute;
  inset: 70px;
  border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, var(--mustard) 0deg 5deg, transparent 5deg 12deg);
  -webkit-mask-image: radial-gradient(circle, #000 18%, rgba(0, 0, 0, 0.55) 48%, transparent 71%);
  mask-image: radial-gradient(circle, #000 18%, rgba(0, 0, 0, 0.55) 48%, transparent 71%);
}
.pr-ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.pr-ring text {
  font-family: Oswald, 'Arial Narrow', sans-serif;
  font-weight: 600;
  font-size: 46px;
  letter-spacing: 7px;
  fill: var(--cream);
}
.pr-stack {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: Anton, Impact, sans-serif;
  font-weight: 400;
  line-height: 0.86;
}
.pr-big {
  font-size: 148px;
  letter-spacing: 2px;
  color: var(--cream);
  text-shadow: 7px 7px 0 var(--brick);
}
.pr-ribbon {
  margin: 12px 0 16px;
  padding: 9px 30px 7px;
  font-family: Oswald, 'Arial Narrow', sans-serif;
  font-weight: 600;
  font-size: 38px;
  letter-spacing: 14px;
  line-height: 1;
  color: #1b1d2a;
  background: var(--mustard);
  clip-path: polygon(0 0, 100% 0, 94% 50%, 100% 100%, 0 100%, 6% 50%);
}
.pr-rule {
  width: 760px;
  margin: 28px 0 22px;
  border-top: 6px dashed var(--mustard);
}
.pr-owner {
  font-size: 40px;
  letter-spacing: 14px;
  color: var(--mustard);
}
.pr-name {
  display: block;
  min-width: 2ch;
  max-width: 920px;
  margin-top: 6px;
  padding: 0 12px 6px;
  font-family: Anton, Impact, sans-serif;
  font-weight: 400;
  font-size: calc(150px * var(--fit, 1));
  line-height: 1.05;
  letter-spacing: 3px;
  white-space: nowrap;
  color: var(--cream);
  text-shadow: 5px 5px 0 var(--brick);
  border-bottom: 8px solid var(--cream);
  outline: none;
  caret-color: var(--mustard);
}
.pr-foot {
  margin-top: 22px;
  font-size: 30px;
  letter-spacing: 9px;
  color: var(--cream);
  opacity: 0.92;
}
.pr-foot b { color: var(--mustard); font-weight: 600; }
`;

export function createLooseThread(): PrintDesign {
  const root = document.createElement('div');
  root.className = 'pr-root';
  root.innerHTML = `
<style>${CSS}</style>
<div class="pr-emblem" aria-hidden="true">
  <div class="pr-rays"></div>
  <svg class="pr-ring" viewBox="0 0 640 640">
    <defs><path id="pr-arc" d="M 320,320 m -262,0 a 262,262 0 1,1 524,0 a 262,262 0 1,1 -524,0" /></defs>
    <circle cx="320" cy="320" r="304" fill="none" stroke="#f1e7cf" stroke-width="7" />
    <circle cx="320" cy="320" r="222" fill="none" stroke="#f1e7cf" stroke-width="4" />
    <text><textPath href="#pr-arc" startOffset="0" textLength="1610">★ THE LOOSE THREAD SOCIETY ★ EST. MMXXVI</textPath></text>
  </svg>
  <div class="pr-stack">
    <div class="pr-big">BREAK</div>
    <div class="pr-ribbon">THAT</div>
    <div class="pr-big">DENIM</div>
  </div>
</div>
<div class="pr-rule" aria-hidden="true"></div>
<div class="pr-owner">Property of</div>
<div class="pr-name" contenteditable="plaintext-only" spellcheck="false" autocapitalize="characters" aria-label="Name printed on the denim">Anyone</div>
<div class="pr-foot" aria-hidden="true">Printed live · <b class="pr-clock">00:00:00</b> · HTML in canvas</div>`;
  const name = root.querySelector<HTMLElement>('.pr-name')!;
  const clock = root.querySelector<HTMLElement>('.pr-clock')!;

  // one line, at most NAME_MAX characters, scaled down to stay inside the print
  const fit = () => {
    const n = [...(name.textContent ?? '')].length;
    name.style.setProperty('--fit', String(Math.min(1, 7 / Math.max(n, 1))));
  };
  name.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      e.preventDefault();
      return;
    }
    if (!e.inputType.startsWith('insert')) return;
    const selected = window.getSelection()?.toString().length ?? 0;
    const add = [...(e.data ?? '')].length;
    if ([...(name.textContent ?? '')].length - selected + add > NAME_MAX) e.preventDefault();
  });
  name.addEventListener('input', fit);
  fit();
  // the first keystroke replaces the placeholder name
  name.addEventListener('focus', () => {
    const range = document.createRange();
    range.selectNodeContents(name);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });

  // only a changed text relays out (and repaints the print)
  let shown = '';
  const tick = () => {
    const now = new Date();
    const text = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
    if (text === shown) return;
    shown = text;
    clock.textContent = text;
  };
  tick();
  const timer = setInterval(tick, 250);
  return { root, width: DESIGN_WIDTH, focus: name, dispose: () => clearInterval(timer) };
}
