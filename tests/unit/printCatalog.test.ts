import { describe, expect, it } from 'vitest';
import { comparePrints } from '../../src/print/catalog';

describe('print catalog', () => {
  it('orders prints by id, numbers as numbers', () => {
    const ids = ['b', '10-x', 'A', '2-y'].map((id) => ({ id, url: id }));
    expect(ids.sort(comparePrints).map((p) => p.id)).toEqual(['2-y', '10-x', 'A', 'b']);
  });
});
