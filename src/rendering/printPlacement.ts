import type { LayerInfo } from '../simulation/scene';
import { cameraMatrices, type CameraState } from './camera';
import { transformPoint } from './math';

/** Where the screen's points cast through a camera land on a layer: material (rest-chart) coordinates. */
function restMapper(info: LayerInfo, camera: CameraState, aspect: number): (x: number, y: number) => [number, number] | null {
  const inv = cameraMatrices(camera, aspect).invViewProj;
  const [a00, a01, a10, a11] = info.mapA;
  const det = a00 * a11 - a01 * a10;
  // material point under normalised device coordinates (x, y): the ray onto the mount plane, taken back
  // through the mount mapping (rotation, shear, compression)
  return (x, y) => {
    const p = transformPoint(inv, [x, y, 0]);
    const q = transformPoint(inv, [x, y, 1]);
    const o = [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
    const d = [q[0] / q[3] - o[0], q[1] / q[3] - o[1], q[2] / q[3] - o[2]];
    if (Math.abs(d[2]) < 1e-9) return null;
    const t = (info.mapOrigin[2] - o[2]) / d[2];
    if (!(t > 0)) return null;
    const wx = o[0] + t * d[0] - info.mapOrigin[0];
    const wy = o[1] + t * d[1] - info.mapOrigin[1];
    return [info.restCenter[0] + (a11 * wx - a01 * wy) / det, info.restCenter[1] + (a00 * wy - a10 * wx) / det];
  };
}

/** The screen's corners, edge midpoints and centre on the layer, row-major from the bottom left. */
function screenPoints(info: LayerInfo, camera: CameraState, aspect: number): [number, number][] | null {
  const at = restMapper(info, camera, aspect);
  const points: [number, number][] = [];
  for (const y of [-1, 0, 1]) {
    for (const x of [-1, 0, 1]) {
      const p = at(x, y);
      if (!p) return null;
      points.push(p);
    }
  }
  return points;
}

const insideLayer = (info: LayerInfo, points: [number, number][]) => {
  const maxU = (info.nx - 1) * info.material.pitchU;
  const maxV = (info.ny - 1) * info.material.pitchV;
  return points.every(([u, v]) => u >= 0 && u <= maxU && v >= 0 && v <= maxV);
};

/**
 * The farthest the camera may stand (along its own line of sight, at most `camera.distance`) with the
 * whole screen on the layer: every corner of the view on its mount plane inside the cloth, so nothing
 * past the cloth's edges is ever in view. Found by bisection (the view grows monotonically with
 * distance).
 */
export function fitDistance(info: LayerInfo, camera: CameraState, aspect: number): number {
  const fits = (distance: number) => {
    const p = screenPoints(info, { ...camera, distance }, aspect);
    return p !== null && insideLayer(info, p);
  };
  if (fits(camera.distance)) return camera.distance;
  let lo = 0.01;
  let hi = camera.distance;
  for (let k = 0; k < 40; k++) {
    const mid = 0.5 * (lo + hi);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The part of a layer the view shows, in its rest chart: the screen's corners and edge midpoints cast
 * through `camera` onto the layer's mount plane and taken back through the mount mapping; their bounding
 * box, clamped to the layer, so all the cloth on screen is inside it (the material's axes are not the
 * screen's). `width` / `height` (m) are its size, `span` the material extent between the screen's
 * opposite edge midpoints (the screen's own width and height on the cloth). Null if the view does not
 * reach the plane.
 */
export function visibleRect(info: LayerInfo, camera: CameraState, aspect: number): { center: [number, number]; width: number; height: number; span: [number, number] } | null {
  const points = screenPoints(info, camera, aspect);
  if (!points) return null;
  // 3 left middle, 5 right middle, 1 bottom middle, 7 top middle
  const span: [number, number] = [Math.abs(points[5][0] - points[3][0]), Math.abs(points[7][1] - points[1][1])];
  const us = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  const u0 = Math.max(0, Math.min(...us));
  const u1 = Math.min((info.nx - 1) * info.material.pitchU, Math.max(...us));
  const v0 = Math.max(0, Math.min(...vs));
  const v1 = Math.min((info.ny - 1) * info.material.pitchV, Math.max(...vs));
  if (u1 <= u0 || v1 <= v0 || span[0] <= 0 || span[1] <= 0) return null;
  return { center: [(u0 + u1) / 2, (v0 + v1) / 2], width: u1 - u0, height: v1 - v0, span };
}
