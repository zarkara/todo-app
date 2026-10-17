import { describe, expect, it } from 'vitest';
import { moveItem } from './moveItem';

describe('moveItem', () => {
  it.each([
    ['down', 0, 2, ['b', 'c', 'a', 'd']],
    ['up', 3, 1, ['a', 'd', 'b', 'c']],
    ['nowhere', 1, 1, ['a', 'b', 'c', 'd']],
  ])('moves an item %s', (_label, from, to, expected) => {
    expect(moveItem(['a', 'b', 'c', 'd'], from, to)).toEqual(expected);
  });

  it.each([
    ['before the start', 0, -1],
    ['past the end', 3, 4],
    ['from a missing index', 7, 0],
  ])('leaves the list unchanged when moving %s', (_label, from, to) => {
    expect(moveItem(['a', 'b', 'c', 'd'], from, to)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the original list', () => {
    const list = ['a', 'b'];

    moveItem(list, 0, 1);

    expect(list).toEqual(['a', 'b']);
  });
});
