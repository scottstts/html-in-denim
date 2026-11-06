import { createLooseThread } from './looseThread';

/**
 * A premade HTML design printed on the cloth. Its root is laid out as a child of the cloth canvas
 * (bridge.ts) and drawn onto the denim from its snapshots: any change to it (text, styles, animation)
 * reprints the cloth, so a design that changes nothing costs nothing after its first paint.
 */
export interface PrintDesign {
  /** The design's root element, `width` design pixels wide (its height sets the print's aspect). */
  root: HTMLElement;
  width: number;
  /** An editable field that keeps the keyboard while the design is shown. */
  focus?: HTMLElement;
  /** Stops whatever the design runs (timers, listeners outside its root) when it is replaced. */
  dispose?(): void;
}

export interface DesignEntry {
  id: string;
  /** Its name in the menu. */
  label: string;
  create(): PrintDesign;
}

/** The menu's designs, in order; the first is shown at start. */
export const DESIGNS: readonly DesignEntry[] = [{ id: 'loose-thread', label: 'Loose Thread', create: createLooseThread }];
