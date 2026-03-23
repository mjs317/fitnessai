import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/programs/[id] — fetch plan + its workouts ───────────────────────
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, name, sport, weeks, is_active, plan_data, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (planError || !plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch scheduled workouts for this plan (with workout details)
  const { data: scheduledWorkouts } = await supabase
    .from('scheduled_workouts')
    .select('id, scheduled_date, status, external_title, external_type, external_notes, workout_id, workouts(id, name, type, estimated_duration_min)')
    .eq('training_plan_id', id)
    .eq('user_id', user.id)
    .order('scheduled_date');

  return NextResponse.json({ plan, scheduledWorkouts: scheduledWorkouts ?? [] });
}

// ── PATCH /api/programs/[id] — set_active | deactivate | reschedule ──────────
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  const serviceClient = await createServiceRoleClient();

  if (action === 'set_active') {
    // Deactivate all other plans for this user
    await serviceClient
      .from('training_plans')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    const { error } = await serviceClient
      .from('training_plans')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'deactivate') {
    const { error } = await serviceClient
      .from('training_plans')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'reschedule') {
    const { newStartDate } = body as { newStartDate: string };
    if (!newStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
      return NextResponse.json({ error: 'Invalid newStartDate' }, { status: 400 });
    }

    // Get current plan to find original start date
    const { data: plan } = await serviceClient
      .from('training_plans')
      .select('plan_data')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const originalStart: string = (plan.plan_data as any)?.startDate;
    if (!originalStart) return NextResponse.json({ error: 'No start date on plan' }, { status: 400 });

    const origMs = new Date(originalStart + 'T00:00:00Z').getTime();
    const newMs = new Date(newStartDate + 'T00:00:00Z').getTime();
    const shiftDays = Math.round((newMs - origMs) / 86400000);

    // Fetch all scheduled workouts for this plan
    const { data: sws } = await serviceClient
      .from('scheduled_workouts')
      .select('id, scheduled_date')
      .eq('training_plan_id', id)
      .eq('user_id', user.id);

    if (sws && sws.length > 0) {
      // Build batch updates
      const updates = sws.map(sw => {
        const oldMs = new Date(sw.scheduled_date + 'T00:00:00Z').getTime();
        const newDateMs = oldMs + shiftDays * 86400000;
        const newDate = new Date(newDateMs).toISOString().slice(0, 10);
        return { id: sw.id, scheduled_date: newDate };
      });

      for (const u of updates) {
        await serviceClient
          .from('scheduled_workouts')
          .update({ scheduled_date: u.scheduled_date })
          .eq('id', u.id);
      }
    }

    // Update plan_data.startDate
    await serviceClient
      .from('training_plans')
      .update({ plan_data: { ...(plan.plan_data as object), startDate: newStartDate } })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, shifted: shiftDays });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ── DELETE /api/programs/[id] — delete plan + its scheduled workouts ──────────
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceRoleClient();

  // Delete scheduled workouts first
  await serviceClient
    .from('scheduled_workouts')
    .delete()
    .eq('training_plan_id', id)
    .eq('user_id', user.id);

  // Delete the plan
  const { error } = await serviceClient
    .from('training_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
