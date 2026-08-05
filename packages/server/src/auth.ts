import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { childLogger } from './logger.js';

const log = childLogger('auth');

export interface JoinClaims {
  roomId: string;
  displayName: string;
  /** Whether this token grants host privileges on join. */
  host?: boolean;
}

/**
 * Short-lived join tokens.
 *
 * The passcode is checked once over HTTPS at `/api/rooms/:id/join`; the resulting
 * token is what the WebSocket presents. That keeps the secret out of the URL that
 * users paste into chats and lets tokens be revoked by rotating the signing key.
 */
export function issueJoinToken(claims: JoinClaims): string {
  return jwt.sign(claims, config.auth.jwtSecret, {
    expiresIn: config.auth.tokenTtlSeconds,
    issuer: 'meet',
    audience: 'meet-client',
  });
}

export function verifyJoinToken(token: string): JoinClaims | null {
  try {
    return jwt.verify(token, config.auth.jwtSecret, { issuer: 'meet', audience: 'meet-client' }) as JoinClaims;
  } catch (error) {
    log.debug({ err: error }, 'token verification failed');
    return null;
  }
}

export function assertProductionSecrets(): void {
  if (config.isProduction && config.auth.jwtSecret.startsWith('dev-only')) {
    throw new Error('JWT_SECRET must be set to a strong random value in production');
  }
}
