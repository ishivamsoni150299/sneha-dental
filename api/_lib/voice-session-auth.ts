import { createHmac, timingSafeEqual } from 'crypto';

export interface VoiceSessionCapability {
  clinicId: string;
  sessionId: string;
  expiresAt: number;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createVoiceSessionToken(
  capability: VoiceSessionCapability,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(capability), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyVoiceSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): VoiceSessionCapability | null {
  const [payload, providedSignature, extra] = token.split('.');
  if (!payload || !providedSignature || extra || !secret) return null;

  const expected = Buffer.from(signature(payload, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<VoiceSessionCapability>;
    if (typeof value.clinicId !== 'string' || !value.clinicId || value.clinicId.length > 100) return null;
    if (typeof value.sessionId !== 'string' || !/^[a-f\d-]{36}$/i.test(value.sessionId)) return null;
    if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
    return value as VoiceSessionCapability;
  } catch {
    return null;
  }
}