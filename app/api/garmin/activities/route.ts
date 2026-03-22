import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCronUser } from '@/lib/cron-auth';
import { format, subDays } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const user = await getCronUser(request, 'garmin_email');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = await createServiceRoleClient();

    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('garmin_email, garmin_password_encrypted, garmin_session_cookies')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.garmin_email || !settings?.garmin_password_encrypted) {
      return NextResponse.json({ success: false, error: 'Garmin credentials not configured' });
    }

    const { createGarminClient, mapActivityType, mapToScheduledType } = await import('@/lib/garmin/client');
    const gc = await createGarminClient(
      settings.garmin_email,
      settings.garmin_password_encrypted,
      (settings as any).garmin_session_cookies,
    );

    const startDate = subDays(new Date(), 7);
    const activities = await (gc as any).getActivities(0, 25); // Get last 25 activities

    let synced = 0;
    let autoCompleted = 0;

    for (const activity of activities) {
      // Skip if activity is older than 7 days
      const actDate = new Date(activity.startTimeGMT || activity.startTimeLocal);
      if (actDate < startDate) continue;

      const garminId = activity.activityId;
      const actType = mapActivityType(activity.activityType?.typeKey || '');
      const actDateStr = format(actDate, 'yyyy-MM-dd');

      // Upsert into garmin_activities
      const { error: actErr } = await serviceSupabase
        .from('garmin_activities')
        .upsert({
          user_id: user.id,
          garmin_activity_id: garminId,
          activity_date: actDateStr,
          activity_type: actType,
          title: activity.activityName || activity.activityType?.typeKey || 'Activity',
          duration_sec: activity.duration ? Math.round(activity.duration) : null,
          distance_meters: activity.distance ?? null,
          avg_hr: activity.averageHR ?? null,
          max_hr: activity.maxHR ?? null,
          calories: activity.calories ?? null,
          avg_pace_sec_per_km: activity.averageSpeed ? (1000 / activity.averageSpeed) : null,
          elevation_gain_m: activity.elevationGain ?? null,
          raw_json: activity,
        }, { onConflict: 'garmin_activity_id' });

      if (!actErr) synced++;

      // Try to auto-complete a matching scheduled workout
      const matchingTypes = mapToScheduledType(activity.activityType?.typeKey || '');
      const { data: pending } = await (serviceSupabase as any)
        .from('scheduled_workouts')
        .select('*')
        .eq('user_id', user.id)
        .eq('scheduled_date', actDateStr)
        .eq('status', 'pending')
        .limit(3);

      if (pending && pending.length > 0) {
        // Filter by workout type
        const filtered = pending.filter((p: any) =>
          matchingTypes.length === 0 || matchingTypes.includes(p.external_type)
        );

        if (filtered.length > 0) {
          const actDurationMin = activity.duration ? Math.round(activity.duration / 60) : null;
          const best = filtered[0];

          // Update scheduled workout to auto-completed
          await (serviceSupabase as any)
            .from('scheduled_workouts')
            .update({ status: 'auto-completed', garmin_activity_id: garminId })
            .eq('id', best.id);

          // Create workout log
          await (serviceSupabase as any).from('workout_logs').insert({
            user_id: user.id,
            scheduled_workout_id: best.id,
            workout_id: best.workout_id || null,
            garmin_activity_id: garminId,
            duration_min: actDurationMin,
            auto_completed: true,
            completed_at: actDate.toISOString(),
          });

          autoCompleted++;
        }
      }
    }

    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_last_activity_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, synced, autoCompleted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
