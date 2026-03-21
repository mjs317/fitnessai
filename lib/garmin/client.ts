// Server-side only — never import in client components
import { GarminConnect } from 'garmin-connect';

export async function createGarminClient(email: string, encryptedPassword: string): Promise<GarminConnect> {
  const { decrypt } = await import('@/lib/crypto');
  const password = decrypt(encryptedPassword);
  const gc = new GarminConnect({ username: email, password });
  await gc.login();
  return gc;
}

export function mapActivityType(garminType: string): string {
  const lower = garminType.toLowerCase();
  if (lower.includes('run')) return 'running';
  if (lower.includes('cycl') || lower.includes('bike') || lower.includes('ride')) return 'cycling';
  if (lower.includes('strength') || lower.includes('weight') || lower.includes('gym')) return 'strength_training';
  if (lower.includes('swim')) return 'swimming';
  if (lower.includes('hike')) return 'hiking';
  return 'other';
}

export function mapToScheduledType(garminType: string): string[] {
  // Returns workout types that this garmin activity could match
  switch (mapActivityType(garminType)) {
    case 'running': return ['run', 'mixed'];
    case 'cycling': return ['bike', 'mixed'];
    case 'strength_training': return ['strength', 'crossfit', 'hyrox', 'mixed'];
    default: return ['mixed'];
  }
}
