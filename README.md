# Denim HTML

HTML printed on a simulated denim you can tear.

```bash
npm install
npm run dev
```

Needs a desktop Chrome with WebGPU and HTML-in-Canvas (`chrome://flags/#canvas-draw-element`). Without the flag the denim is drawn unprinted.

```bash
npm run check      # lint, typecheck, tests
npm run test:gpu   # headless GPU suites
```

## Prints

Each print is a folder in `public/prints/`, named as it appears in the menu, with an `index.html` and whatever scripts, styles and images it loads beside it. Drop a folder in and it appears in the menu of the open page; edit any of its files and the cloth reprints.

- Prints sort by folder name (numbers in order, so `01-`, `02-` sets the order), and the first one is printed at start.
- The page is the cloth's dye: every yarn takes the page's colour where it lies, threads and frayed fibre included. Where the page is transparent the cotton is undyed.
- It covers the whole window, laid out at the window's size and scale, as if it were open in a browser window. It is laid out again when the window is resized.

Press **I** to hand the mouse and keyboard to the page (the icon at the top right shows it), and **I** again to give them back to the cloth. While a text field of the page has the keyboard, I types; click outside the field first.

Licensed under GPL-3.0-only. See [LICENSE](./LICENSE).
