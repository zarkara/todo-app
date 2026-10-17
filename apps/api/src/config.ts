import { z } from 'zod';

const DEFAULT_PORT = 4000;
const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const DEFAULT_DB_POOL_MAX = 10;

// Secrets published in this repository (compose defaults, .env.example); never valid in production.
export const KNOWN_DEVELOPMENT_SECRETS = ['dev-only-secret-replace-me-in-production'] as const;
const isKnownDevelopmentSecret = (secret: string) =>
  (KNOWN_DEVELOPMENT_SECRETS as readonly string[]).includes(secret);

// "email:password" pairs separated by commas; the password may itself contain colons.
const toDemoUserEntries = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email = '', ...passwordParts] = entry.split(':');
      return { email, password: passwordParts.join(':') };
    });

const demoUsersSchema = z
  .string()
  .default('')
  .transform(toDemoUserEntries)
  .pipe(z.array(z.object({ email: z.string().email(), password: z.string().min(1) })));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    DATABASE_URL: z.string().url(),
    DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(DEFAULT_DB_POOL_MAX),
    // Off in production deployments that run `migrate` as a separate step before rollout.
    MIGRATE_ON_START: z.enum(['true', 'false']).default('true'),
    JWT_SECRET: z.string().min(MIN_SECRET_LENGTH),
    TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_TOKEN_TTL_SECONDS),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    DEMO_USERS: demoUsersSchema,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    const violation = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (isKnownDevelopmentSecret(env.JWT_SECRET)) {
      violation('JWT_SECRET', 'is a published development secret; set a unique secret');
    }
    if (env.DEMO_USERS.length > 0) {
      violation('DEMO_USERS', 'demo accounts are not allowed in production');
    }
    if (env.DATABASE_SSL === 'disable') {
      violation('DATABASE_SSL', 'must be require or verify-full in production');
    }
  })
  .transform((env) => ({
    environment: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    databaseSsl: env.DATABASE_SSL,
    databaseSslCaFile: env.DATABASE_SSL_CA_FILE ?? null,
    dbPoolMax: env.DB_POOL_MAX,
    migrateOnStart: env.MIGRATE_ON_START === 'true',
    jwtSecret: env.JWT_SECRET,
    tokenTtlSeconds: env.TOKEN_TTL_SECONDS,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    demoUsers: env.DEMO_USERS,
  }));

export type Config = z.infer<typeof envSchema>;
export type DemoUser = Config['demoUsers'][number];

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const result = envSchema.safeParse(env);
  if (result.success) return result.data;

  const problems = result.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);
  throw new Error(`Invalid configuration: ${problems.join('; ')}`);
};
