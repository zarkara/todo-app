import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only publishes the latest value once input pauses for the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'b' },
    });

    rerender({ value: 'bu' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'buy' });
    act(() => vi.advanceTimersByTime(200));

    expect(result.current).toBe('b');

    act(() => vi.advanceTimersByTime(50));

    expect(result.current).toBe('buy');
  });
});
