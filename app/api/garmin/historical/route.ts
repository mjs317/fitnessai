import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = await createServiceRoleClient();

    // Check if already seeded
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('garmin_email, garmin_password_encrypted, garmin_historical_seeded')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settings?.garmin_historical_seeded) {
      return NextResponse.json({ success: true, message: 'Historical data already imported' });
    }

    if (!settings?.garmin_email || !settings?.garmin_password_encrypted) {
      return NextResponse.json({ success: false, error: 'Garmin credentials not configured' });
    }

    const { createGarminClient } = await import('@/lib/garmin/client');
    const gc = await createGarminClient(settings.garmin_email, settings.garmin_password_encrypted);

    const days = 90;
    let imported = 0;

    // Send streaming response with progress updates
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < days; i++) {
            const date = subDays(new Date(), i);
            const dateStr = format(date, 'yyyy-MM-dd');

            try {
              const [sleepData, stressData, stepsData] = await Promise.allSettled([
                (gc as any).getSleepData ? (gc as any).getSleepData(user.id, date).catch(() => null) : Promise.resolve(null),
                (gc as any).getDailyStress ? (gc as any).getDailyStress(user.id, date).catch(() => null) : Promise.resolve(null),
                (gc as any).getDailySteps ? (gc as any).getDailySteps(user.id, date).catch(() => null) : Promise.resolve(null),
              ]);

              const metrics: Record<string, any> = {
                user_id: user.id,
                date: dateStr,
                source: 'garmin',
              };

              if (sleepData.status === 'fulfilled' && sleepData.value) {
                const s = sleepData.value as any;
                metrics.sleep_hours = s.sleepTimeSeconds ? Math.round((s.sleepTimeSeconds / 3600) * 10) / 10 : null;
                metrics.sleep_score = s.sleepScores?.overall?.value ?? s.overallSleepScore ?? null;
                metrics.hrv = s.hrvValue ?? null;
                metrics.resting_hr = s.restingHeartRate ?? null;
              }

              if (stepsData.status === 'fulfilled' && stepsData.value) {
                metrics.steps = (stepsData.value as any)?.totalSteps ?? null;
                metrics.active_calories = (stepsData.value as any)?.activeKilocalories ?? null;
              }

              if (Object.keys(metrics).length > 3) {
                await serviceSupabase
                  .from('health_metrics')
                  .upsert(metrics, { onConflict: 'user_id,date' });
                imported++;
              }
            } catch (dayErr) {
              // Skip individual day failures
            }

            // Progress update
            const progress = Math.round(((i + 1) / days) * 100);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ day: i + 1, total: days, progress, imported })}\n\n`));

            // Rate limit: 500ms delay between requests
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Mark as seeded
          await serviceSupabase.from('user_settings').upsert({
            user_id: user.id,
            garmin_historical_seeded: true,
            updated_at: new Date().toISOString(),
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, imported })}\n\n`));
          controller.close();
        } catch (err: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
