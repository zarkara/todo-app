import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiClient } from './ApiClientProvider';

describe('useApiClient', () => {
  it('explains the missing provider instead of failing obscurely', () => {
    // React logs the thrown error; silence it so the test output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useApiClient())).toThrow(
      'useApiClient must be used inside an ApiClientProvider',
    );
  });
});
