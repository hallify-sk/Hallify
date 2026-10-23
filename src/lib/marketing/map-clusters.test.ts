import { describe, expect, it } from 'vitest';
import { clusterPins } from './map-clusters';

const pin = (id: string, x: number, y: number) => ({ item: { id }, x, y });

describe('map pin clusters', () => {
  it('groups pins whose labels would overlap and leaves distant ones alone', () => {
    const groups = clusterPins([pin('a', 0, 0), pin('b', 50, 10), pin('c', 400, 0)]);
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['a', 'b'], ['c']]);
    expect(groups[0]).toMatchObject({ x: 25, y: 5 });
  });
  it('never hides the selected venue inside a group', () => {
    const groups = clusterPins([pin('a', 0, 0), pin('b', 5, 5), pin('c', 10, 0)], { keep: 'b' });
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['a', 'c'], ['b']]);
  });
  it('does not depend on the order the pins arrive in', () => {
    const forward = clusterPins([pin('a', 0, 0), pin('b', 60, 0), pin('c', 120, 0)]);
    const backward = clusterPins([pin('c', 120, 0), pin('b', 60, 0), pin('a', 0, 0)]);
    expect(backward).toEqual(forward);
  });
});
