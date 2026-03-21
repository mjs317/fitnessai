import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = await createServiceRoleClient();

    // Get Garmin credentials from user_settings (server-side only)
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('garmin_email, garmin_password_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.garmin_email || !settings?.garmin_password_encrypted) {
      return NextResponse.json({
        success: false,
        error: 'Garmin credentials not configured',
        lastSync: null,
      });
    }

    // Import Garmin client (dynamic to avoid bundling issues)
    let gc: any;
    try {
      const { createGarminClient } = await import('@/lib/garmin/client');
      gc = await createGarminClient(settings.garmin_email, settings.garmin_password_encrypted);
    } catch (loginErr: any) {
      return NextResponse.json({
        success: false,
        error: 'Garmin login failed: ' + loginErr.message,
        lastSync: null,
      });
    }

    const today = new Date();
    const dateStr = format(today, 'yyyy-MM-dd');
    const userId = user.id;

    // Fetch all metrics in parallel (with graceful failures)
    const [sleepData, stressData, stepsData, weightData] = await Promise.allSettled([
      (gc.getSleepData ? gc.getSleepData(userId, today) : Promise.resolve(null)).catch(() => null),
      (gc.getDailyStress ? gc.getDailyStress(userId, today) : Promise.resolve(null)).catch(() => null),
      (gc.getDailySteps ? gc.getDailySteps(userId, today) : Promise.resolve(null)).catch(() => null),
      (gc.getBodyComposition ? gc.getBodyComposition(userId, today) : Promise.resolve(null)).catch(() => null),
    ]);

    // Map Garmin data to our schema
    const metrics: Record<string, any> = {
      user_id: userId,
      date: dateStr,
      source: 'garmin',
    };

    // Sleep
    if (sleepData.status === 'fulfilled' && sleepData.value) {
      const s = sleepData.value as any;
      metrics.sleep_hours = s.sleepTimeSeconds ? Math.round((s.sleepTimeSeconds / 3600) * 10) / 10 : null;
      metrics.sleep_score = s.sleepScores?.overall?.value ?? s.overallSleepScore ?? null;
      // HRV — typically in sleep data
      metrics.hrv = s.avgSleepStress ? Math.round(100 - s.avgSleepStress) : s.hrvValue ?? null;
      metrics.resting_hr = s.restingHeartRate ?? null;
    }

    // Stress (includes body battery)
    if (stressData.status === 'fulfilled' && stressData.value) {
      const s = stressData.value as any;
      metrics.stress_avg = s.overallStressLevel ?? s.avgStressLevel ?? null;
    }

    // Steps
    if (stepsData.status === 'fulfilled' && stepsData.value) {
      const s = stepsData.value as any;
      metrics.steps = s.totalSteps ?? s.steps ?? null;
      metrics.active_calories = s.activeKilocalories ?? null;
    }

    // Weight
    if (weightData.status === 'fulfilled' && weightData.value) {
      const w = weightData.value as any;
      if (w?.weightInGrams) {
        metrics.weight_lbs = Math.round((w.weightInGrams / 453.592) * 10) / 10;
      }
    }

    // Upsert into health_metrics
    const { error: upsertError } = await serviceSupabase
      .from('health_metrics')
      .upsert(metrics, { onConflict: 'user_id,date' });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
    }

    // Update last sync timestamp
    await serviceSupabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        garmin_last_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      metrics: Object.keys(metrics).filter(k => k !== 'user_id' && k !== 'date' && k !== 'source'),
      duration_ms: duration,
      lastSync: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Garmin sync error:', err.message);
    return NextResponse.json({
      success: false,
      error: err.message,
      lastSync: null,
    });
  }
}
