import { describe, expect, it } from 'vitest';
import {
  createTaskSchema,
  listTasksQuerySchema,
  loginSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
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
