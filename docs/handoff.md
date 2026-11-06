# Handoff (rolling)

Latest (2026-11-06, split from "Break That Denim"): this repo is only HTML printed on the denim. Removed:
the staged "Beneath" experience (src/stage, its body collider and claw holds, pickNear, camera light, post
film/glitch, staged camera eye/up, renderer extras), its tools, model and sounds, and the wordmark,
SEO/OG and deploy assets. Records that mention the staged scene are kept as history;
`tools/studies/foldedfall.ts` (needed the staged dump) is gone, so the folded-fragment defect in
`2026-10-11-folded-fragment-contact.md` is open without its repro.
- Prints are standalone pages, one folder each in public/prints (the folder is its name; index.html plus its own files; README), not code. Each is shown in a same-origin
  `<iframe drawable>` in the cloth canvas: html-in-canvas paints iframe content and fires `paint` on its
  changes, and `zoom` on the iframe scales its content (the page sees devicePixelRatio x zoom), so pages
  keep their own document, `html`/`body` styles and scripts. A shadow root or injected markup would not:
  scripts querying `document` break. Prints must be same-origin (layout height and fonts are read from
  the page). The next print loads hidden and replaces the current one only once loaded with its fonts.
- plugins/prints.ts lists them as `virtual:prints`; in dev it pushes 'prints:list' / 'prints:change' so
  adding or editing a print never reloads the app (Vite reloads only a page at a changed .html's own
  path, so public prints do not trigger it).
- Without html-in-canvas no print is loaded and the menu is hidden.
- The page is the yarns' dye (render_common dyeOf/yarnLook): no indigo or undyed weft any more; both
  families ring-dyed with the page colour at their rest point, the rest of the yarn model (depth
  variation, mottle, wear exposing the undyed core) unchanged. Threads (thread.wgsl threadDye) and edge
  fibre (fuzz.wgsl, fibre albedo from the dye by R = (1 - s) / (1 + s)) carry the colour of where they
  came from. The screen-print ink film model (crown ink, cracks, front face only) is gone: dyed through.
  Transparent page = undyed cotton; beyond the page's rectangle the texture's clamped edge continues it.
- Framing (printPlacement.ts fitDistance): the camera stands no farther than keeps every screen corner
  on the coupon, for any window aspect; wheel zoom-out stops there (was 1.15). The page covers the bbox
  of the screen corners at that framing (zoom never moves it; a resize re-places it) and is laid out at
  the screen's CSS scale. Texture: 1.5 texels per drawing-buffer pixel covered, at most 4096 on the long
  side (0.1 mm over the visible cloth would be ~5500 wide).
- Interactive mode (print/interactive.ts, I): canvas children are not hit testable until given a canvas
  transform (updateElementGeometry; Chrome 157 applies it in the element's unzoomed CSS px, then scales
  by the element's zoom). One affine per element, re-aligned at the pointer from a GPU pick
  (interact.wgsl pickFace: the intact face of the ray's nearest hit, lattice coords and screen slope;
  strands and torn per-crossing cells are not page). Real browser input as a result; the alignment is
  exact at the picked point and trails a moving pointer by the pick round trip (~31 ms median, 61 ms
  p90 headless), extrapolated to first order meanwhile. Re-picked per frame only while the cloth moves
  ('motion').

Latest (2026-10-11, floor contact): `docs/decisions/2026-10-11-floor-contact.md` (uncommitted). Free play
collides with the floor 12 cm below (FLOOR_Z, src/simulation/floor.ts): self-contact cubic + friction in
assemble, quadratic model in the line search, hard/trust bound in step.wgsl. Loose
tails rest on it. Found and fixed: spinning detached pieces barely felt friction (chord-velocity start
iterate rigid_spin.wgsl, rotation-exact update path energy.wgsl steps/curveApply). Verified headless:
`npm run check` 67 unit, `npm run test:gpu` 26/26 + 19/19 + 7/7 + 5/5 (new tests/gpu/floor.ts); substep
cost unchanged; sessions fall/trail added. Not seen in a browser.

Latest (2026-10-11, floating torn pieces): `docs/decisions/2026-10-11-detached-rigid-modes.md`
(uncommitted). Detached pieces hovered because PCG resolved ~4 % of their rigid motion (lace-like
pieces lose coarse support). Topology now labels pieces; assembly writes their rigid blocks (rigidK);
rigid_frame.wgsl builds E = Z^T A Z per piece; PCG starts from each piece's rigid response
(rigid_apply.wgsl). Verified headless: `npm run check` 67 unit, `npm run test:gpu` 26/26 + 19/19 + 7/7
(new comb / serpentine cut-outs). Not seen in a browser.

Latest (2026-10-11, line-search stalls): `docs/decisions/2026-10-11-pinch-slip.md` (uncommitted).
The stalls were a grip defect, not a solver one: rim entries torn away from the pinch stayed sprung to
the hand from any distance. Pinch entries now slip out beyond a pad radius of the patch's own motion.
Rejections 0 in every gesture (haul 80, hold 82, haul@0.006,-0.004 26 before); tear-outs
tear less and settle after release. setTarget's entry count fixed (it included
the strip between the pads). Verified headless: `npm run check` 67 unit, `npm run test:gpu` 26/26 +
19/19 + 5/5. Not seen in a browser.
- The previous handoff's "g.d > 0" lead was a probe artifact (PCG overwrites the rhs it read); LSPROBE
  now captures the rhs before PCG, and LSCHECK=1 adds the operator check.

Before (2026-10-11, open items of the assessment round): `docs/decisions/2026-10-11-parted-crossings-and-swept-body.md`.
A ruptured or slipped-out span's yarns are pulled out of the other side's crossings (both backends;
couple split into coupleU / coupleV; SEG_SLIPPED defers the slip case one substep). maul thread ends > 5 mm off 41 -> 0 (worst 24.5 -> 2.3 mm). With the pinch
fix, parting does not change how much tears (the increase first measured was the grip defect).
Shipped drape still kept.

Latest (2026-10-11, assessment round): `docs/decisions/2026-10-11-detached-coherence.md` (acting on
artifacts/assessment; uncommitted). Detached pieces stay in the cloth solve (no more ballistic
nodes); active contact bounds in the Newton operator; cubic contact penalty with a per-iteration
depth trust region (free light bodies chattered forever); objective bending viscosity (both backends).
Verified headless: `npm run check` 65 unit, `npm run test:gpu` 26/26 + 13/13 + 5/5 (new
tests/gpu/detached.ts). maul: worst detached span 1.075x rest (was 84.6x), 0 stretched detached runs
(were 147). Not seen in a browser.
- Open: attached thread ends drawn 13-26 mm off their chain where a parted span's yarn field stays
  intact (decision record; `tools/studies/runends.ts <state>`). Shipped drape kept (re-settling with
  the new viscosity gives another wrinkle state; it is still an exact rest state).
- Tools: `tools/studies/restcontact.ts <state>` (does a dumped state come to rest),
  `releasepiece.ts`, session `FASTEST=n` (fastest nodes with state and contact bounds).

Latest round: `docs/decisions/2026-10-10-stability-round.md` (acting on artifacts/assessment: neutral grab,
visible picking, connected patch, shared hand on the simulation clock, release refinement against the
numerical bounce, relative/swept contact bounds, contact across tears, deterministic contact; uncommitted).
Before: `docs/decisions/2026-10-10-floor-and-room-light.md` (render-only floor 12 cm below, mount board,
dim overhead lamp, 8K base/normal cropped to the visible floor).
Before: `docs/decisions/2026-10-10-tear-sound-sample.md` (tear sound: the recording's tearing passages
played back; the mechanics control only tearing on/off, loudness and place; fall-off on stop/release; uncommitted).
Before: `docs/decisions/2026-10-10-tear-sound-structure.md` (the procedural voice it replaced).
Before: `docs/decisions/2026-10-10-tear-sound.md` (records, transport, multi-touch, page UI).
Before: `docs/decisions/2026-10-10-folds-and-free-tails.md`, `docs/decisions/2026-10-10-edge-fibre-population.md`,
`docs/decisions/2026-10-10-interaction-round.md`.

## State

- Mechanics: unequal-span bending, gradient-consistent line search with rounding-bounded step choice,
  cancellation-free bending energy changes, force-derived free-end pull-out, wear-independent cohesive
  opening, debris bounded against the cloth, contact query culling.
- Scene: coupon stretched 0.2 % along the warp (user decision); `MECHANICS_VERSION` 10.
- Grip: two-pad pinch (fingertips close along the warp; the strip between folds freely; user decision,
  replaces the radial contraction), drag lift, bounded force; holds until release; torn-out pieces stay
  held. Pinch is the only loading (user decision): slit and eye openings are the correct result for it. Grabs pick
  only visible material, start exactly on it, never push behind the grab plane (src/simulation/hand.ts);
  4 Newton iterations for 0.1 s after a release (RELEASE_REFINEMENT). Releasing frees what only that
  grip held before the fingers open (Interaction.letGo; a crushed held piece was flung apart).
- Contact: relative (node and face corners) directional bounds against the first face a path crosses
  or the nearest start face; lips across tears collide inside the lattice exclusion window.
- Rendering: threads from the strand chains, split where the mechanics ruptured their bundle; flat clumps
  of freed yarns; free tails solved as heavy elastic rods resting on the cloth (`thread_tail.wgsl`); edge
  fibre from the fibre population (fans and rim hair, per fibre or closed form);
  rim/halo, footprint-filtered albedo, top key light. Colour, exposure and fill were measured against the
  reference and match; no shading change is justified.

## Verified

- Stability round: `npm run check` 53 unit, `npm run test:gpu` 26/26 + 12/12 (tests/gpu/interaction.ts).
  Release on intact cloth: no rebound (was 11 %, 2 rings). Sessions deterministic again; 0 post-release
  ruptures; maul 5 rejections. Substep +1.8 %. Not yet felt in the browser by the user.

- Tear sound: renders of haul / pluck / drag / rip sessions keep the recording's texture (fine texture
  distance 2.8, the recording's own tears 3.0-7.6); silent unless yarns part; falls off 60 dB in 0.3 s on
  stop or release (unit tests). Not yet confirmed by the user by ear.
- Multi-touch: `twohand.ts` apart/shear/overlap/adjacent/three clean; `npm run check` 45 unit.

- `npm run check` (33 unit), `npm run test:gpu` (26/26).
- Session `settle`: 0 line-search rejections (was 164), settles 0.73 s after release.
- `haul` (fast long drag, AUTOLIFT=1): grip held on worn and intact cloth; worn scrap stays in the hand.
- `maul` (four hard drags, AUTOLIFT=1): no non-finite values, 2 rejections in 6.5 s, no bridging threads,
  21 of 40k sheet spans through a cell. Without the slip release a 19 cm drag at full force tears out a
  large worn piece (freed 368 nodes), which falls when released.

## Reproduce

- Stability: `tools/studies/release.ts` (GRAB, PULL, SOLVER, ITERS/WINDOW/MAXITERS, TRACE, STRAIN),
  `tools/studies/stabilityAssessment.ts` (assessment probe; GRIP override), `tools/studies/benchmoving.ts`,
  `session.ts peel` (folded flap grabbed and lifted), `HAND` env override in session.ts; session `ASYNC=1`
  (connectivity analysis alongside the substeps, as the worker) with `FREED=1` (pieces freed since the
  release / per frame and their speeds); `tools/studies/freepiece.ts` (unanchored / hinged piece).

- Sound: `AUDIO=f.json node tools/gpu/run.mjs tools/gpu/scripts/session.ts rip` (or `twohand.ts`), then
  `tools/audio/render.ts f.json out.wav` (`VOICE` overrides TEAR_SAMPLE); compare with
  `tools/audio/spectrograms.mjs`, `texture.mjs`, `events.mjs`, `compare.mjs`, `analyze.mjs`.

- `node tools/gpu/run.mjs tools/gpu/scripts/session.ts <script> NAME 30` (`DUMP=1`, `SNAPS=t,...`,
  `FRAMES=dir`, `STATS=1`, `TRACK=n`, `LSPROBE=t`); `haul` with `GRAB`, `PULL`, `HOLD`, `AUTOLIFT=1`.
- `tools/studies/crossings.ts <state>`: spans through intact cells; `tools/studies/straightruns.ts <state>`:
  thread runs drawn without a carrying chain.
- `still.ts` with `CAMERA`, `LIGHT` (incl. `background`), `RENDERCOST=1`; `tools/compare/sbs.zsh`;
  `SCENE` / `DRAPE` overrides; `bench.ts`.
- `session.ts hold` (held pull, `GRAB`, `PULL`, `HOLD`; `DUMP=1`) + `tools/studies/folds.ts <state> <grab x,y>`:
  wrinkles and in-plane vs buckled gathering around a grip. `tools/studies/tails.ts <state>`: free tails
  through the cloth (solved vs the old procedural hang).
- `tools/compare/coverage.mjs`: fringe coverage by distance from the edge, from two stills over different
  backgrounds. `tools/compare/fuzzband.mjs`: loose-material band vs a reference frame (its edge length
  grows with fuzz, so compare coverage for our own changes).

## Open

- Stability round leftovers (decision record "Open"): grip force above 120 N at the iterate; no
  edge-edge/strand contact; torn cells have no collision face; rare crack-tip line-search rejections.
  Pad pinch not yet seen by the user in the browser.

0. Sound: verify by ear in the browser (reload: the worklet loads once per page). Loudness follows the
   mechanics' release rate (swells within a tear are the simulated cloth's); the slices come from 2 s of
   recording, so a long tear repeats material at random places. Mouse wheel depth applies to all grips.

1. Shape plan: measurement, rim volume (edge fibre) and fold diagnosis done. Folds buckle correctly and
   are converged in resolution; their depth follows the mount (taut along the warp) and the pull. Thread
   hairiness not pursued (reference single threads are as thin as ours).
2. Real time: ~0.93x on the M5. Edge fibre adds 1.2-3.6 ms to the render at default framing and ~12 ms at
   max zoom on heavily torn cloth (on-screen fringe fragments; explicit-geometry and culling alternatives
   measured/estimated as no better). Free tails add ~0.26 ms.
3. Threads inside openings are often single yarns in shadow (physically consistent, faint).
4. The reference framing camera sees past the coupon's top edge (product framing does not).
5. The surface rim band is still painted pale (`rimFibres`), in addition to the rim hair now drawn as
   fibre; the halo adds wear over 1 cm around openings (no measurable effect; not a tear mechanism).
6. Free tails are quasi-static (no swing of their own); they collide with intact cells only (not with
   threads or other tails), and not at all in a layered scene (no self-contact face hash).
