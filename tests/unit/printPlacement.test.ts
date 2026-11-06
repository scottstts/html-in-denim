import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA } from '../../src/rendering/camera';
import { fitDistance, visibleRect } from '../../src/rendering/printPlacement';
import { compileLayer, defaultSceneSpecs } from '../../src/simulation/scene';

describe('print placement', () => {
  const spec = defaultSceneSpecs()[0];
  const { info } = compileLayer(spec, 0, 0);
  const maxU = (info.nx - 1) * info.material.pitchU;
  // view height on the mount plane at the default framing (m)
  const viewH = 2 * DEFAULT_CAMERA.distance * Math.tan(DEFAULT_CAMERA.fovY / 2);

  it('covers the cloth a 16:10 view shows, on the whole screen', () => {
    const r = visibleRect(info, DEFAULT_CAMERA, 16 / 10)!;
    // the screen's corners are inside it: a little more than the screen itself
    expect(r.width).toBeGreaterThan(r.span[0]);
    expect(r.height).toBeGreaterThan(r.span[1]);
    expect(r.width).toBeLessThan(1.15 * r.span[0]);
    expect(r.height).toBeLessThan(1.15 * r.span[1]);
    // the mount maps material to world nearly 1:1 (a few percent of compression and shear)
    expect(r.span[1]).toBeGreaterThan(0.9 * viewH);
    expect(r.span[1]).toBeLessThan(1.15 * viewH);
    expect(r.span[0] / r.span[1]).toBeGreaterThan(1.45);
    expect(r.span[0] / r.span[1]).toBeLessThan(1.75);
    expect(r.center[0] - r.width / 2).toBeGreaterThanOrEqual(0);
    expect(r.center[0] + r.width / 2).toBeLessThanOrEqual(maxU);
  });

  it('stops at the cloth where a wide view sees past it', () => {
    const r = visibleRect(info, DEFAULT_CAMERA, 3)!;
    expect(r.width).toBeCloseTo(maxU, 9);
    expect(r.width).toBeLessThan(r.span[0]);
    expect(r.height).toBeGreaterThan(r.span[1]);
  });


  it('frames the cloth so the whole screen is on it, at any aspect', () => {
    for (const aspect of [0.5, 1, 16 / 10, 2, 3]) {
      const d = fitDistance(info, DEFAULT_CAMERA, aspect);
      expect(d).toBeLessThanOrEqual(DEFAULT_CAMERA.distance);
      const r = visibleRect(info, { ...DEFAULT_CAMERA, distance: d }, aspect)!;
      // nothing clamped: the screen's whole extent lies inside the cloth
      expect(r.width).toBeGreaterThanOrEqual(r.span[0]);
      expect(r.height).toBeGreaterThanOrEqual(r.span[1]);
      expect(r.center[0] - r.width / 2).toBeGreaterThan(0);
      expect(r.center[0] + r.width / 2).toBeLessThan(maxU);
    }
    // the product's framing is kept where it already fits; a wide window is framed closer
    expect(fitDistance(info, DEFAULT_CAMERA, 16 / 10)).toBe(DEFAULT_CAMERA.distance);
    expect(fitDistance(info, DEFAULT_CAMERA, 3)).toBeLessThan(0.6 * DEFAULT_CAMERA.distance);
  });
});
