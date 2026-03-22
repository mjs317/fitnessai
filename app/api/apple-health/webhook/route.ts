import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from a date string like "2024-01-15 08:30:00 -0500" */
function toDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/** Values in sleep_analysis that count as actual sleep (not InBed / Awake) */
const SLEEP_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleep',
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
]);

interface MetricEntry {
  date: string;
  qty?: number;
  value?: string;
  units?: string;
}

interface Metric {
  name: string;
  units?: string;
  data: MetricEntry[];
}

/**
 * Parse a Health Auto Export payload into a map of date → partial health_metrics row.
 *
 * Health Auto Export sends one JSON body per sync with a `data.metrics` array.
 * Each metric has a name and an array of timestamped readings.
 */
function parsePayload(body: { data?: { metrics?: Metric[] } }) {
  const metrics: Metric[] = body?.data?.metrics ?? [];
  const byDate: Record<string, {
    hrv?: number; resting_hr?: number;
    sleep_hours?: number; sleep_score?: number;
    steps?: number; active_calories?: number;
    weight_lbs?: number;
  }> = {};

  function ensureDate(d: string) {
    if (!byDate[d]) byDate[d] = {};
    return byDate[d];
  }

  for (const metric of metrics) {
    const { name, data } = metric;

    // ── HRV ───────────────────────────────────────────────────────────────────
    if (name === 'heart_rate_variability') {
      // Group by date, take mean of all readings that day
      const sums: Record<string, { sum: number; count: number }> = {};
      for (const entry of data) {
        if (entry.qty == null) continue;
        const d = toDate(entry.date);
        if (!sums[d]) sums[d] = { sum: 0, count: 0 };
        sums[d].sum += entry.qty;
        sums[d].count++;
      }
      for (const [d, { sum, count }] of Object.entries(sums)) {
        ensureDate(d).hrv = Math.round(sum / count);
      }
    }

    // ── Resting Heart Rate ────────────────────────────────────────────────────
    else if (name === 'resting_heart_rate') {
      for (const entry of data) {
        if (entry.qty == null) continue;
        const d = toDate(entry.date);
        const row = ensureDate(d);
        // Apple Health sends one resting HR per day; keep lowest if multiple
        if (row.resting_hr == null || entry.qty < row.resting_hr) {
          row.resting_hr = Math.round(entry.qty);
        }
      }
    }

    // ── Sleep ─────────────────────────────────────────────────────────────────
    // Sleep entries span overnight; attribute them to the morning date (end date).
    // qty is in hours per Health Auto Export convention.
    else if (name === 'sleep_analysis') {
      const sleepByDate: Record<string, number> = {};
      for (const entry of data) {
        if (entry.qty == null) continue;
        if (!SLEEP_VALUES.has(entry.value ?? '')) continue;
        // The date field is the START of the interval; sleep night ends the
        // next calendar day. We use the date of the entry as a proxy —
        // Health Auto Export typically groups entries under the "wake date".
        const d = toDate(entry.date);
        sleepByDate[d] = (sleepByDate[d] ?? 0) + entry.qty;
      }
      for (const [d, hours] of Object.entries(sleepByDate)) {
        const row = ensureDate(d);
        const h = Math.round(hours * 10) / 10; // one decimal
        row.sleep_hours = h;
        // Simple score: percentage of 8-hour target, capped at 100
        row.sleep_score = Math.min(100, Math.round((h / 8) * 100));
      }
    }

    // ── Steps ─────────────────────────────────────────────────────────────────
    else if (name === 'step_count') {
      const sums: Record<string, number> = {};
      for (const entry of data) {
        if (entry.qty == null) continue;
        const d = toDate(entry.date);
        sums[d] = (sums[d] ?? 0) + entry.qty;
      }
      for (const [d, total] of Object.entries(sums)) {
        ensureDate(d).steps = Math.round(total);
      }
    }

    // ── Active Calories ───────────────────────────────────────────────────────
    else if (name === 'active_energy_burned') {
      const sums: Record<string, number> = {};
      for (const entry of data) {
        if (entry.qty == null) continue;
        const d = toDate(entry.date);
        sums[d] = (sums[d] ?? 0) + entry.qty;
      }
      for (const [d, total] of Object.entries(sums)) {
        ensureDate(d).active_calories = Math.round(total);
      }
    }

    // ── Weight ────────────────────────────────────────────────────────────────
    else if (name === 'body_mass') {
      for (const entry of data) {
        if (entry.qty == null) continue;
        const d = toDate(entry.date);
        const row = ensureDate(d);
        // Health Auto Export sends in the units configured in the app (kg or lb)
        const lbs = (metric.units === 'kg' || metric.units === 'kg/m²')
          ? entry.qty * 2.20462
          : entry.qty;
        row.weight_lbs = Math.round(lbs * 10) / 10;
      }
    }
  }

  return byDate;
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const serviceSupabase = await createServiceRoleClient();

  // Identify user by webhook token
  const { data: settings } = await serviceSupabase
    .from('user_settings')
    .select('user_id')
    .eq('apple_health_webhook_token', token)
    .maybeSingle();

  if (!settings?.user_id) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const userId = settings.user_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawBody = body as { data?: { metrics?: Metric[] } };
  const metricNames = rawBody?.data?.metrics?.map(m => m.name) ?? [];
  console.log(`[apple-health/webhook] Received metrics: ${metricNames.join(', ')}`);
  console.log(`[apple-health/webhook] Raw payload sample:`, JSON.stringify(rawBody?.data?.metrics?.slice(0, 2)));

  const byDate = parsePayload(rawBody);
  const dates = Object.keys(byDate);
  console.log(`[apple-health/webhook] Parsed dates: ${dates.join(', ')}`, JSON.stringify(byDate));
  if (dates.length === 0) return NextResponse.json({ imported: 0 });

  const rows = dates.map(date => ({
    user_id: userId,
    date,
    source: 'apple_health',
    ...byDate[date],
  }));

  // Upsert — prefer apple_health values over old garmin values for the same day
  const { error } = await serviceSupabase
    .from('health_metrics')
    .upsert(rows, { onConflict: 'user_id,date', ignoreDuplicates: false });

  if (error) {
    console.error('[apple-health/webhook] Upsert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update last sync timestamp
  await serviceSupabase.from('user_settings').upsert(
    { user_id: userId, apple_health_last_sync: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  console.log(`[apple-health/webhook] Imported ${rows.length} day(s) for user ${userId}`);
  return NextResponse.json({ imported: rows.length, dates });
}
