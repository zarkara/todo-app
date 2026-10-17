import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords';

// Low cost factor keeps the suite fast; production uses the default.
const TEST_COST = 4;

describe('passwords', () => {
  it('verifies the password that produced the hash', async () => {
    const hash = await hashPassword('correct horse', TEST_COST);

    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse', TEST_COST);

    expect(await verifyPassword('battery staple', hash)).toBe(false);
  });

  it('never stores the password in plain text', async () => {
    expect(await hashPassword('correct horse', TEST_COST)).not.toContain('correct horse');
  });
});
