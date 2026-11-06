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

Licensed under GPL-3.0-only. See [LICENSE](./LICENSE).
