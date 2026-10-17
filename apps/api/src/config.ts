import { z } from 'zod';

const DEFAULT_PORT = 4000;
const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

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
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(MIN_SECRET_LENGTH),
    TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_TOKEN_TTL_SECONDS),
    DEMO_USERS: demoUsersSchema,
  })
  .transform((env) => ({
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    tokenTtlSeconds: env.TOKEN_TTL_SECONDS,
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
