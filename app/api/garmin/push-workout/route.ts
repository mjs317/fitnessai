import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { workout_id, scheduled_workout_id } = await request.json();
    const serviceSupabase = await createServiceRoleClient();

    const [settingsRes, workoutRes] = await Promise.allSettled([
      serviceSupabase.from('user_settings').select('garmin_email, garmin_password_encrypted').eq('user_id', user.id).maybeSingle(),
      serviceSupabase.from('workouts').select('*').eq('id', workout_id).eq('user_id', user.id).single(),
    ]);

    const settings = settingsRes.status === 'fulfilled' ? settingsRes.value.data : null;
    const workout = workoutRes.status === 'fulfilled' ? workoutRes.value.data : null;

    if (!settings?.garmin_email || !settings?.garmin_password_encrypted) {
      return NextResponse.json({ success: false, error: 'Garmin credentials not configured' });
    }
    if (!workout) return NextResponse.json({ success: false, error: 'Workout not found' });

    const { createGarminClient } = await import('@/lib/garmin/client');
    const gc = await createGarminClient(settings.garmin_email, settings.garmin_password_encrypted);

    // Map workout blocks to Garmin workout steps (simplified)
    const blocks = (workout.blocks as any[]) || [];
    const steps = blocks.map((block: any) => ({
      type: 'ExecutableStepDTO',
      stepOrder: 1,
      stepType: { stepTypeId: 3, stepTypeKey: 'interval' },
      childStepId: null,
      description: block.label || block.type,
      endCondition: block.config?.duration_min
        ? { conditionTypeId: 2, conditionTypeKey: 'time', conditionValue: block.config.duration_min * 60 }
        : { conditionTypeId: 3, conditionTypeKey: 'lap.button' },
      preferredEndConditionUnit: null,
      targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' },
    }));

    try {
      const result = await (gc as any).createWorkout({
        workoutName: workout.name,
        description: workout.notes || '',
        sportType: { sportTypeId: 4, sportTypeKey: 'strength_training' },
        estimatedDurationInSecs: (workout.estimated_duration_min || 60) * 60,
        workoutSegments: [{
          segmentOrder: 1,
          sportType: { sportTypeId: 4, sportTypeKey: 'strength_training' },
          workoutSteps: steps,
        }],
      });

      if (scheduled_workout_id && result?.workoutId) {
        await serviceSupabase
          .from('scheduled_workouts')
          .update({ garmin_workout_id: String(result.workoutId) })
          .eq('id', scheduled_workout_id);
      }

      return NextResponse.json({ success: true, garmin_workout_id: result?.workoutId });
    } catch (pushErr: any) {
      return NextResponse.json({ success: false, error: 'Push failed: ' + pushErr.message });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
