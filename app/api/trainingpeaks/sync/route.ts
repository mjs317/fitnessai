import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { format, addDays } from 'date-fns';

function parseICSDate(dtStr: string): Date | null {
  // Handle YYYYMMDD or YYYYMMDDTHHmmssZ formats
  try {
    if (dtStr.length === 8) {
      const y = dtStr.slice(0, 4), m = dtStr.slice(4, 6), d = dtStr.slice(6, 8);
      return new Date(`${y}-${m}-${d}`);
    }
    if (dtStr.includes('T')) {
      const clean = dtStr.replace(/[TZ]/g, ' ').trim();
      return new Date(dtStr.replace('Z', '+00:00'));
    }
    return null;
  } catch { return null; }
}

function parseICS(icsText: string): Array<{
  summary: string;
  description: string;
  dtstart: string;
  uid: string;
}> {
  const events: any[] = [];
  const lines = icsText.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
  let current: any = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
    } else if (line.startsWith('END:VEVENT') && current) {
      events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY:')) current.summary = line.slice(8).trim();
      else if (line.startsWith('DESCRIPTION:')) current.description = line.slice(12).trim().replace(/\\n/g, '\n');
      else if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1]?.trim();
        if (val) current.dtstart = val;
      }
      else if (line.startsWith('UID:')) current.uid = line.slice(4).trim();
    }
  }
  return events;
}

function inferWorkoutType(summary: string, description: string): string {
  const text = (summary + ' ' + description).toLowerCase();
  if (/run|jog|tempo|interval|5k|10k|half|marathon/.test(text)) return 'run';
  if (/bike|cycle|cycling|ride|zwift/.test(text)) return 'bike';
  if (/swim/.test(text)) return 'swim';
  if (/strength|lift|weight|gym|squat|deadlift/.test(text)) return 'strength';
  if (/hyrox|crossfit|wod|amrap|emom/.test(text)) return 'crossfit';
  return 'mixed';
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = await createServiceRoleClient();
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('trainingpeaks_ics_url')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.trainingpeaks_ics_url) {
      return NextResponse.json({ success: false, error: 'TrainingPeaks ICS URL not configured' });
    }

    const icsRes = await fetch(settings.trainingpeaks_ics_url, {
      headers: { 'User-Agent': 'FitnessCoach/1.0' },
    });

    if (!icsRes.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch ICS: ${icsRes.status}` });
    }

    const icsText = await icsRes.text();
    const events = parseICS(icsText);

    const today = new Date();
    const fourteenDaysOut = addDays(today, 14);
    let imported = 0;
    let skipped = 0;

    for (const event of events) {
      if (!event.dtstart || !event.summary) continue;

      const eventDate = parseICSDate(event.dtstart);
      if (!eventDate) continue;

      // Only import events in next 14 days
      if (eventDate < today || eventDate > fourteenDaysOut) continue;

      const dateStr = format(eventDate, 'yyyy-MM-dd');
      const workoutType = inferWorkoutType(event.summary, event.description || '');

      // Check if a completed/auto-completed workout exists for this day — don't overwrite
      const { data: existing } = await serviceSupabase
        .from('scheduled_workouts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('scheduled_date', dateStr)
        .eq('source', 'trainingpeaks')
        .maybeSingle();

      if (existing && (existing.status === 'completed' || existing.status === 'auto-completed')) {
        skipped++;
        continue;
      }

      const upsertData: any = {
        user_id: user.id,
        scheduled_date: dateStr,
        source: 'trainingpeaks',
        status: existing?.status || 'pending',
        external_title: event.summary,
        external_description: event.description || null,
        external_type: workoutType,
      };

      if (existing) {
        await serviceSupabase.from('scheduled_workouts').update(upsertData).eq('id', existing.id);
      } else {
        await serviceSupabase.from('scheduled_workouts').insert(upsertData);
      }
      imported++;
    }

    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      trainingpeaks_last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, imported, skipped, total: events.length });
  } catch (err: any) {
    console.error('TrainingPeaks sync error:', err.message);
    return NextResponse.json({ success: false, error: err.message });
  }
}
