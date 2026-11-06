/**
 * The print catalog: every folder in public/prints with an index.html is a print, named by the folder;
 * its other files are whatever the page loads. Shared by the plugin that lists them (plugins/prints.ts)
 * and the page; no DOM.
 */

export interface PrintEntry {
  /** The folder's name: the print's name in the menu. */
  id: string;
  /** Where the page is served. */
  url: string;
}

/** Menu order: by id, numbers compared as numbers (prefix 01-, 02- to order them); the first is shown at start. */
export function comparePrints(a: PrintEntry, b: PrintEntry): number {
  return a.id.localeCompare(b.id, 'en', { numeric: true, sensitivity: 'base' });
}
