import { describe, expect, it } from 'vitest';
import { dragMove } from './dragMove';

describe('dragMove', () => {
  const ids = ['a', 'b', 'c'];

  it('converts a drag from one item onto another into list indexes', () => {
    expect(dragMove(ids, 'a', 'c')).toEqual({ from: 0, to: 2 });
  });

  it.each([
    ['dropped outside the list', 'a', null],
    ['dropped on itself', 'b', 'b'],
    ['an unknown item', 'zzz', 'a'],
  ])('ignores an item %s', (_label, activeId, overId) => {
    expect(dragMove(ids, activeId, overId)).toBeNull();
  });
});
