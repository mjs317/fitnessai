// Server-side only — never import in client components
import { GarminConnect } from 'garmin-connect';

// Regex mirrors what the garmin-connect library uses internally
const TICKET_RE = /ticket=([^"&\s]+)/;
const CSRF_RE = /name="_csrf"\s+value="([^"]+)"/i;

/** Extract all hidden input fields from an HTML form. */
function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<input\s[^>]+>/gi;
  let m;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/type\s*=\s*["']hidden["']/i.test(tag)) continue;
    const name = /name\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const raw = /value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    if (name) fields[name] = raw.replace(/&amp;/g, '&').replace(/&#x2F;/g, '/');
  }
  return fields;
}

// ─── Session persistence ───────────────────────────────────────────────────────
// The garmin-connect library authenticates with OAuth2 tokens (Bearer), NOT cookies.
// We serialise/restore the oauth1Token + oauth2Token objects for session reuse.

/** Serialise the OAuth tokens from an authenticated GarminConnect instance. */
export function getGarminSessionCookies(gc: GarminConnect): string {
  const client = (gc as any).client;
  return JSON.stringify({
    oauth1Token: client.oauth1Token ?? null,
    oauth2Token: client.oauth2Token ?? null,
  });
}

async function tryRestoreSession(gc: GarminConnect, savedJson: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(savedJson);
    if (parsed.__mfa) return false; // pending MFA — cannot restore
    const { oauth1Token, oauth2Token } = parsed;
    const client = (gc as any).client;
    if (oauth1Token) client.oauth1Token = oauth1Token;
    if (oauth2Token) client.oauth2Token = oauth2Token;
    await (gc as any).getUserInfo(); // lightweight auth check
    return true;
  } catch {
    return false;
  }
}

// ─── Login step replication ────────────────────────────────────────────────────
// We override HttpClient.getLoginTicket (which IS properly awaited by login())
// so we can intercept the MFA page HTML and handle it ourselves.
// handleMFA is called synchronously with its return ignored, so it cannot be used.

type MfaState = { formUrl: string; hiddenFields: Record<string, string> };

function patchGetLoginTicketForCapture(gc: GarminConnect): Promise<MfaState | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const qs = require('qs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FormData = require('form-data');
  const httpClient = (gc as any).client;
  let capturedMfa: MfaState | null = null;

  httpClient.getLoginTicket = async function (u: string, p: string) {
    const url = this.url;

    // Step 1 – initialise SSO session
    const step1Params = { clientId: 'GarminConnect', locale: 'en', service: url.GC_MODERN };
    await this.client.get(`${url.GARMIN_SSO_EMBED}?${qs.stringify(step1Params)}`);

    // Step 2 – get CSRF token from signin page
    const step2Params = { id: 'gauth-widget', embedWidget: true, locale: 'en', gauthHost: url.GARMIN_SSO_EMBED };
    const step2Html: string = await this.get(`${url.SIGNIN_URL}?${qs.stringify(step2Params)}`);
    const csrfMatch = CSRF_RE.exec(step2Html);
    if (!csrfMatch) throw new Error('CSRF token not found on Garmin signin page');

    // Step 3 – POST credentials
    const signinParams = {
      id: 'gauth-widget', embedWidget: true, clientId: 'GarminConnect', locale: 'en',
      gauthHost: url.GARMIN_SSO_EMBED, service: url.GARMIN_SSO_EMBED,
      source: url.GARMIN_SSO_EMBED,
      redirectAfterAccountLoginUrl: url.GARMIN_SSO_EMBED,
      redirectAfterAccountCreationUrl: url.GARMIN_SSO_EMBED,
    };
    const form = new FormData();
    form.append('username', u);
    form.append('password', p);
    form.append('embed', 'true');
    form.append('_csrf', csrfMatch[1]);

    const step3Html: string = await this.post(
      `${url.SIGNIN_URL}?${qs.stringify(signinParams)}`,
      form,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: url.GARMIN_SSO_ORIGIN,
          Referer: url.SIGNIN_URL,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    );

    // No MFA — login succeeded
    const ticketMatch = TICKET_RE.exec(step3Html);
    if (ticketMatch) return ticketMatch[1];

    // MFA required — log the HTML so we can see the exact form structure
    console.log('[garmin] MFA page HTML (first 800):', step3Html.slice(0, 800));

    // Match action with double or single quotes; try several known path patterns then fall back
    const actionMatch =
      step3Html.match(/action=["']([^"']*verif[^"']*)["']/i) ||
      step3Html.match(/action=["']([^"']*mfa[^"']*)["']/i) ||
      step3Html.match(/action=["']([^"']*2fa[^"']*)["']/i) ||
      step3Html.match(/<form[^>]+action=["']([^"']+)["']/i) ||
      step3Html.match(/action=["']([^"']+)["']/i);
    let formUrl = actionMatch?.[1] ?? '';
    // HTML attributes encode & as &amp; — decode before using the URL
    formUrl = formUrl.replace(/&amp;/g, '&').replace(/&#x2F;/g, '/').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (formUrl && !formUrl.startsWith('http')) formUrl = 'https://sso.garmin.com' + formUrl;

    const hiddenFields = extractHiddenFields(step3Html);
    console.log('[garmin] MFA form URL:', formUrl || '(not found)', '| hidden fields:', Object.keys(hiddenFields).join(','));
    capturedMfa = { formUrl, hiddenFields };
    throw new Error('__MFA_REQUIRED__');
  };

  return gc.login()
    .then(() => null) // no MFA needed
    .catch((err: Error) => {
      if (err.message === '__MFA_REQUIRED__' && capturedMfa) return capturedMfa;
      throw err;
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create an authenticated Garmin client.
 *
 * - If encryptedSessionData contains saved OAuth tokens, tries to restore
 *   the session before falling back to a full login.
 * - If encryptedSessionData contains a pending MFA state (__mfa: true),
 *   skips restore and performs a fresh login.
 * - Throws if the account requires MFA (caller must handle requires_mfa).
 */
export async function createGarminClient(
  email: string,
  encryptedPassword: string,
  encryptedSessionData?: string | null,
): Promise<GarminConnect> {
  const { decrypt } = await import('@/lib/crypto');
  const password = decrypt(encryptedPassword);
  const gc = new GarminConnect({ username: email, password });

  if (encryptedSessionData) {
    const savedJson = decrypt(encryptedSessionData);
    if (await tryRestoreSession(gc, savedJson)) return gc;
  }

  await gc.login();
  return gc;
}

/**
 * Attempt a Garmin login, capturing the MFA form state if 2FA is required.
 *
 * Returns:
 *   { type: 'success', gc }   — login succeeded, no MFA needed
 *   { type: 'mfa', formUrl, csrf } — MFA required; save these for verify-mfa
 *
 * Throws on bad credentials or unrecognised errors.
 */
export async function loginWithMFADetection(
  email: string,
  password: string,
): Promise<
  | { type: 'success'; gc: GarminConnect }
  | { type: 'mfa'; formUrl: string; hiddenFields: Record<string, string> }
> {
  const gc = new GarminConnect({ username: email, password });
  const mfaState = await patchGetLoginTicketForCapture(gc);
  if (mfaState) return { type: 'mfa', ...mfaState };
  return { type: 'success', gc };
}

/**
 * Complete a Garmin login using a pre-captured MFA form URL + CSRF + user code.
 *
 * Overrides getLoginTicket to skip the credential POST entirely and submit
 * the verification code directly to Garmin's already-issued MFA form.
 * This avoids starting a new Garmin session (which would send a new MFA email).
 */
export async function createGarminClientWithMFA(
  email: string,
  encryptedPassword: string,
  mfaFormUrl: string,
  mfaHiddenFields: Record<string, string>,
  mfaCode: string,
): Promise<GarminConnect> {
  const { decrypt } = await import('@/lib/crypto');
  const password = decrypt(encryptedPassword);
  const gc = new GarminConnect({ username: email, password });
  const httpClient = (gc as any).client;

  httpClient.getLoginTicket = async function (_u: string, _p: string) {
    // Start with all hidden fields from the original form, then add the code
    const params: Record<string, string> = { ...mfaHiddenFields, verificationCode: mfaCode.trim() };
    const bodyStr = new URLSearchParams(params).toString();

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://sso.garmin.com',
      Referer: 'https://sso.garmin.com/sso/signin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    console.log('[garmin/mfa] Posting to:', mfaFormUrl);
    console.log('[garmin/mfa] Form fields:', Object.keys(params).join(','));

    // First try: no redirect following — check the Location header for the ticket
    // (Garmin may redirect to the service URL which contains the ticket)
    let ticket: string | null = null;
    try {
      const rawRes = await this.client.post(mfaFormUrl, bodyStr, {
        headers,
        maxRedirects: 0,
        validateStatus: (s: number) => s >= 200 && s < 400,
      });
      const location: string = rawRes.headers?.location ?? '';
      const body: string = typeof rawRes.data === 'string' ? rawRes.data : '';
      console.log('[garmin/mfa] Direct response status:', rawRes.status, '| Location:', location.slice(0, 200));
      const ticketMatch = TICKET_RE.exec(location) || TICKET_RE.exec(body);
      if (ticketMatch) ticket = ticketMatch[1];
    } catch (e: any) {
      console.warn('[garmin/mfa] Direct POST failed:', e.message);
    }

    // Second try: follow redirects and scan the final HTML body
    if (!ticket) {
      const mfaHtml: string = await this.post(mfaFormUrl, bodyStr, { headers });
      const snippet = typeof mfaHtml === 'string' ? mfaHtml.slice(0, 800) : String(mfaHtml);
      console.log('[garmin/mfa] Followed-redirect body snippet:', snippet);
      const ticketMatch = TICKET_RE.exec(typeof mfaHtml === 'string' ? mfaHtml : '');
      if (ticketMatch) ticket = ticketMatch[1];
    }

    if (!ticket) {
      throw new Error('Invalid or expired verification code');
    }
    console.log('[garmin/mfa] Got ticket, completing OAuth…');
    return ticket;
  };

  await gc.login();
  return gc;
}

// ─── Activity helpers ─────────────────────────────────────────────────────────

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
