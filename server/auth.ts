import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import { getUserById, DbUser } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'aura_music_jwt_secret_key_2026_super_secure';
const TOKEN_EXPIRY = '7d';

export interface TokenPayload {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export function generateToken(user: { id: number; username: string; role: 'admin' | 'user' }): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract and authenticate user from HTTP Request headers
 */
export function authenticateRequest(req: IncomingMessage): DbUser | null {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token);
  if (!payload || !payload.id) {
    return null;
  }

  const user = getUserById(payload.id);
  return user || null;
}
