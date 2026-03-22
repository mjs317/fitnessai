// Server-side only — never import in client components
import { GarminConnect } from 'garmin-connect';

/**
 * Serialize the cookie jar from an authenticated GarminConnect instance.
 * Uses tough-cookie's toJSON() which is available via garmin-connect's dependency.
 */
export async function getGarminSessionCookies(gc: GarminConnect): Promise<string> {
  try {
    const jar = (gc as any).client?.client?.defaults?.jar;
    if (!jar?.toJSON) return '';
    return JSON.stringify(jar.toJSON());
  } catch {
    return '';
  }
}

/**
 * Try to restore a previous session by rehydrating the cookie jar.
 * Returns true if the restored session passes a lightweight connectivity test.
 */
async function tryRestoreSession(gc: GarminConnect, cookiesJson: string): Promise<boolean> {
  try {
    const { CookieJar } = await import('tough-cookie');
    const jar = CookieJar.fromJSON(JSON.parse(cookiesJson));
    const axiosInst = (gc as any).client?.client;
    if (!axiosInst) return false;
    axiosInst.defaults.jar = jar;
    // Lightweight connectivity test — getUserInfo is a cheap authenticated call
    await (gc as any).getUserInfo();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an authenticated Garmin client.
 * If encryptedSessionCookies is provided, attempts session restore before
 * falling back to a fresh login (avoiding repeated credential prompts).
 */
export async function createGarminClient(
  email: string,
  encryptedPassword: string,
  encryptedSessionCookies?: string | null,
): Promise<GarminConnect> {
  const { decrypt } = await import('@/lib/crypto');
  const password = decrypt(encryptedPassword);
  const gc = new GarminConnect({ username: email, password });

  if (encryptedSessionCookies) {
    const cookiesJson = decrypt(encryptedSessionCookies);
    if (await tryRestoreSession(gc, cookiesJson)) {
      return gc;
    }
  }

  await gc.login();
  return gc;
}

/**
 * Create a Garmin client when 2FA/MFA is required.
 * Patches the handleMFA stub in HttpClient to automatically submit the
 * provided verification code to Garmin's SSO form.
 */
export async function createGarminClientWithMFA(
  email: string,
  encryptedPassword: string,
  mfaCode: string,
): Promise<GarminConnect> {
  const { decrypt } = await import('@/lib/crypto');
  const password = decrypt(encryptedPassword);
  const gc = new GarminConnect({ username: email, password });

  // Monkey-patch the empty handleMFA stub in HttpClient
  (gc as any).client.handleMFA = async function (htmlStr: string) {
    // Extract the form action URL from the MFA page HTML
    const actionMatch =
      htmlStr.match(/action="([^"]*verif[^"]*)"/i) ||
      htmlStr.match(/action="([^"]*mfa[^"]*)"/i) ||
      htmlStr.match(/<form[^>]+action="([^"]+)"/i);

    if (!actionMatch) {
      throw new Error('MFA form action URL not found in Garmin SSO response');
    }

    let actionUrl = actionMatch[1];
    if (!actionUrl.startsWith('http')) {
      actionUrl = 'https://sso.garmin.com' + actionUrl;
    }

    const body = new URLSearchParams({ verificationCode: mfaCode });
    const csrfMatch = htmlStr.match(/name="_csrf"\s+value="([^"]+)"/i);
    if (csrfMatch) body.set('_csrf', csrfMatch[1]);

    const res = await (this.client as any).post(actionUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res.data as string;
  };

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
  switch (mapActivityType(garminType)) {
    case 'running': return ['run', 'mixed'];
    case 'cycling': return ['bike', 'mixed'];
    case 'strength_training': return ['strength', 'crossfit', 'hyrox', 'mixed'];
    default: return ['mixed'];
  }
}
