import jwt from 'jsonwebtoken';
import type { Clock } from '../clock';
import { UnauthorizedError } from '../domain/errors';

const ALGORITHM = 'HS256';
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
