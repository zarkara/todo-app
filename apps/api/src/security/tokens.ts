import jwt from 'jsonwebtoken';
import type { Clock } from '../clock';
import { UnauthorizedError } from '../domain/errors';

const ALGORITHM = 'HS256';
// Scope tokens to this API and its web client, so a token minted elsewhere with a shared
// secret is still rejected.
export const TOKEN_ISSUER = 'todo-api';
export const TOKEN_AUDIENCE = 'todo-web';
const INVALID_TOKEN = 'Invalid or expired token';

export interface TokenService {
  issue(userId: string): string;
  verify(token: string): { userId: string };
}

interface TokenServiceOptions {
  secret: string;
  ttlSeconds: number;
  clock: Clock;
}

export const createTokenService = ({
  secret,
  ttlSeconds,
  clock,
}: TokenServiceOptions): TokenService => {
  const nowInSeconds = () => Math.floor(clock().getTime() / 1000);

  const decode = (token: string) => {
    try {
      return jwt.verify(token, secret, {
        algorithms: [ALGORITHM],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        clockTimestamp: nowInSeconds(),
      });
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) throw new UnauthorizedError(INVALID_TOKEN);
      throw error;
    }
  };

  return {
    issue: (userId) =>
      jwt.sign({ iat: nowInSeconds() }, secret, {
        algorithm: ALGORITHM,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        subject: userId,
        expiresIn: ttlSeconds,
      }),
    verify: (token) => {
      const payload = decode(token);
      if (typeof payload === 'string' || !payload.sub) throw new UnauthorizedError(INVALID_TOKEN);
      return { userId: payload.sub };
    },
  };
};
