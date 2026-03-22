import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { parseProgramFile, ParsedProgram, ParsedDay } from '@/lib/programParser';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/octet-stream', // some browsers send this for .xlsx
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const action = request.nextUrl.searchParams.get('action');

    // ── Confirm action: save to DB ──────────────────────────────────────────
    if (action === 'confirm') {
      const body = await request.json();
      const programData: ParsedProgram = body.programData;
      if (!programData) return NextResponse.json({ error: 'Missing programData' }, { status: 400 });

      return await saveProgramToDb(user.id, programData);
    }

    // ── Default: parse & preview ────────────────────────────────────────────
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 });

    const fileName = file.name.toLowerCase();
    const isXlsx = fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');
    if (!isXlsx && !isCsv) {
      return NextResponse.json({ error: 'Only .xlsx and .csv files are accepted' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let programData: ParsedProgram;
    try {
      programData = parseProgramFile(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { days } = programData;
    const totalWorkouts = days.filter(d => d.workout.type !== 'rest').length;
    const totalRestDays = days.filter(d => d.workout.type === 'rest').length;

    const workoutsByType: Record<string, number> = {};
    for (const d of days) {
      const t = d.workout.type;
      workoutsByType[t] = (workoutsByType[t] || 0) + 1;
    }

    const firstWeekPreview = days.filter(d => d.week === 1).slice(0, 7);

    return NextResponse.json({
      success: true,
      preview: {
        name: programData.name,
        sport: programData.sport,
        weeks: programData.weeks,
        startDate: programData.startDate,
        description: programData.description,
        totalWorkouts,
        totalRestDays,
        workoutsByType,
        firstWeekPreview,
      },
      programData,
    });
  } catch (err) {
    console.error('[programs/import] Unexpected error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function saveProgramToDb(userId: string, programData: ParsedProgram) {
  const supabase = await createServiceRoleClient();

  // Deactivate existing active plans
  await supabase
    .from('training_plans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  // Insert training plan
  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      name: programData.name,
      sport: programData.sport,
      weeks: programData.weeks,
      race_date: null,
      race_distance: null,
      fitness_level: null,
      is_active: true,
      plan_data: {
        source: 'program_import',
        startDate: programData.startDate,
        description: programData.description,
        totalDays: programData.days.length,
      },
    })
    .select('id')
    .single();

  if (planError || !plan) {
    return NextResponse.json({ success: false, error: planError?.message || 'Failed to create plan' }, { status: 500 });
  }

  const planId = plan.id;

  // Deduplicate workouts by name
  const uniqueWorkouts = new Map<string, { name: string; type: string; duration_min: number | null; blocks: unknown[] }>();
  for (const day of programData.days) {
    const w = day.workout;
    if (!uniqueWorkouts.has(w.name)) {
      uniqueWorkouts.set(w.name, {
        name: w.name,
        type: w.type,
        duration_min: w.duration_min,
        blocks: w.blocks,
      });
    }
  }

  // Insert workouts
  const workoutRows = Array.from(uniqueWorkouts.values()).map(w => ({
    user_id: userId,
    name: w.name,
    type: w.type,
    estimated_duration_min: w.duration_min,
    blocks: w.blocks,
    description: null,
    source: 'program_import',
  }));

  const { data: insertedWorkouts, error: workoutsError } = await supabase
    .from('workouts')
    .insert(workoutRows)
    .select('id, name');

  if (workoutsError || !insertedWorkouts) {
    return NextResponse.json({ success: false, error: workoutsError?.message || 'Failed to create workouts' }, { status: 500 });
  }

  const workoutIdMap = new Map<string, string>();
  for (const w of insertedWorkouts) {
    workoutIdMap.set(w.name, w.id);
  }

  // Insert scheduled workouts
  const schedRows = programData.days.map((day: ParsedDay) => ({
    user_id: userId,
    workout_id: workoutIdMap.get(day.workout.name) || null,
    training_plan_id: planId,
    scheduled_date: day.scheduledDate,
    source: 'program_import',
    status: 'pending',
    external_title: day.workout.name,
    external_type: day.workout.type,
    external_notes: day.workout.notes || null,
  }));

  const { error: schedError } = await supabase.from('scheduled_workouts').insert(schedRows);

  if (schedError) {
    return NextResponse.json({ success: false, error: schedError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    planId,
    workoutsCreated: insertedWorkouts.length,
    daysScheduled: schedRows.length,
  });
}
