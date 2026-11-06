import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { comparePrints, type PrintEntry } from '../src/print/catalog.ts';

/**
 * Lists the prints in public/prints (served and copied as they are, never bundled) as the module
 * `virtual:prints`. In dev, prints added or removed update the open page's menu ('prints:list'), and an
 * edit to any file there reloads the print on the cloth ('prints:change'); the app itself never reloads.
 */

const ID = 'virtual:prints';
const RESOLVED = '\0' + ID;

/** The prints in `dir`: one folder each, named by it, with its index.html and whatever files that loads. */
export function scanPrints(dir: string, base: string): PrintEntry[] {
  if (!existsSync(dir)) return [];
  const out: PrintEntry[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const path = join(dir, name);
    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory() || !existsSync(join(path, 'index.html'))) continue;
    out.push({ id: name, url: `${base}prints/${encodeURIComponent(name)}/index.html` });
  }
  return out.sort(comparePrints);
}

export function prints(): Plugin {
  let dir = '';
  let base = '/';
  return {
    name: 'prints',
    configResolved(config) {
      dir = resolve(config.publicDir || resolve(config.root, 'public'), 'prints');
      base = config.base;
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      return id === RESOLVED ? `export const PRINTS = ${JSON.stringify(scanPrints(dir, base))};` : undefined;
    },
    configureServer(server) {
      let listed = JSON.stringify(scanPrints(dir, base));
      const inside = (file: string) => resolve(file).startsWith(dir + sep);
      const rescan = () => {
        const next = JSON.stringify(scanPrints(dir, base));
        if (next === listed) return;
        listed = next;
        // a page loaded later imports the new list
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'custom', event: 'prints:list', data: JSON.parse(next) });
      };
      for (const event of ['add', 'unlink', 'addDir', 'unlinkDir'] as const) server.watcher.on(event, (file: string) => inside(file) && rescan());
      server.watcher.on('change', (file: string) => {
        if (!inside(file)) return;
        server.ws.send({ type: 'custom', event: 'prints:change', data: null });
      });
    },
  };
}
