import { describe, expect, it } from 'vitest';
import {
  createTaskSchema,
  listTasksQuerySchema,
  loginSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_PASSWORD_LENGTH,
  registerSchema,
  reorderTasksSchema,
  updateTaskSchema,
} from './schemas';

describe('loginSchema', () => {
  it('normalises the email address', () => {
    expect(loginSchema.parse({ email: '  Ada@Example.COM ', password: 'secret' })).toEqual({
      email: 'ada@example.com',
      password: 'secret',
    });
  });

  it.each([
    ['a malformed email', { email: 'not-an-email', password: 'secret' }],
    ['an empty password', { email: 'ada@example.com', password: '' }],
    ['missing fields', {}],
  ])('rejects %s', (_label, input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const password = (length: number) => 'p'.repeat(length);

  it('normalises the email address and keeps a + suffix', () => {
    expect(
      registerSchema.parse({
        email: ' You+1@Example.COM ',
        password: password(MIN_PASSWORD_LENGTH),
      }),
    ).toEqual({ email: 'you+1@example.com', password: password(MIN_PASSWORD_LENGTH) });
  });

  it('accepts passwords of 8 to 64 characters (NIST SP 800-63B)', () => {
    expect([MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]).toEqual([8, 64]);
    for (const length of [MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]) {
      expect(
        registerSchema.safeParse({ email: 'ada@example.com', password: password(length) }).success,
      ).toBe(true);
    }
  });

  it.each([
    [
      'a password that is too short',
      { email: 'ada@example.com', password: password(MIN_PASSWORD_LENGTH - 1) },
    ],
    [
      'a password that is too long',
      { email: 'ada@example.com', password: password(MAX_PASSWORD_LENGTH + 1) },
    ],
    ['a malformed email', { email: 'not-an-email', password: password(MIN_PASSWORD_LENGTH) }],
    ['missing fields', {}],
  ])('rejects %s', (_label, input) => {
    expect(registerSchema.safeParse(input).success).toBe(false);
  });

  it('explains the password rule', () => {
    const result = registerSchema.safeParse({ email: 'ada@example.com', password: 'short' });

    expect(result.error?.issues[0]?.message).toBe('Use 8 to 64 characters');
  });

  it('refuses a password bcrypt would truncate (over 72 bytes), rather than ignoring the rest', () => {
    const accented = 'é'.repeat(40); // 40 characters, 80 bytes

    const result = registerSchema.safeParse({ email: 'ada@example.com', password: accented });

    expect(result.error?.issues[0]?.message).toBe(
      'Too long: use fewer accented letters, symbols or emoji',
    );
  });
});

describe('createTaskSchema', () => {
  it('trims text and strips unknown fields', () => {
    expect(
      createTaskSchema.parse({ title: '  Buy milk ', description: ' 2 litres ', userId: 'x' }),
    ).toEqual({ title: 'Buy milk', description: '2 litres' });
  });

  it('allows the description to be omitted', () => {
    expect(createTaskSchema.parse({ title: 'Buy milk' })).toEqual({ title: 'Buy milk' });
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['a missing title', { description: 'orphan' }],
    ['an over-long title', { title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }],
    [
      'an over-long description',
      { title: 'ok', description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) },
    ],
  ])('rejects %s', (_label, input) => {
    expect(createTaskSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('accepts any subset of editable fields', () => {
    expect(updateTaskSchema.parse({ completed: true })).toEqual({ completed: true });
  });

  it.each([
    ['an empty patch', {}],
    ['a patch with only unknown fields', { position: 3 }],
    ['a blank title', { title: '' }],
    ['a non-boolean completed flag', { completed: 'yes' }],
  ])('rejects %s', (_label, input) => {
    expect(updateTaskSchema.safeParse(input).success).toBe(false);
  });
});

describe('reorderTasksSchema', () => {
  it('accepts a list of task ids', () => {
    expect(reorderTasksSchema.parse({ ids: ['b', 'a'] })).toEqual({ ids: ['b', 'a'] });
  });

  it.each([
    ['a missing list', {}],
    ['a list containing a blank id', { ids: ['a', ''] }],
    ['a list of non-strings', { ids: [1, 2] }],
  ])('rejects %s', (_label, input) => {
    expect(reorderTasksSchema.safeParse(input).success).toBe(false);
  });
});

describe('listTasksQuerySchema', () => {
  it('defaults the search query to an empty string', () => {
    expect(listTasksQuerySchema.parse({})).toEqual({ q: '' });
  });

  it('trims the search query', () => {
    expect(listTasksQuerySchema.parse({ q: '  milk ' })).toEqual({ q: 'milk' });
  });
});
