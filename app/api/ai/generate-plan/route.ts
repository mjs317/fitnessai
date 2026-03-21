import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAnthropicClient } from '@/lib/ai/client';
import { TRAINING_PLAN_SYSTEM } from '@/lib/ai/prompts';
import { format, differenceInWeeks, parseISO } from 'date-fns';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { sport, race_distance, race_date, current_weekly_miles, training_days, fitness_level } = body;

    if (!sport || !race_distance || !race_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const weeks = Math.max(4, Math.min(24, differenceInWeeks(parseISO(race_date), new Date())));

    const anthropic = getAnthropicClient();

    const prompt = `Generate a complete ${weeks}-week training plan for a ${race_distance} ${sport} race on ${race_date}.

Athlete profile:
- Current weekly mileage/volume: ${current_weekly_miles || 'unknown'} miles/week
- Available training days: ${training_days?.join(', ') || 'Mon, Wed, Fri, Sat, Sun'}
- Fitness level: ${fitness_level || 'intermediate'}
- Weeks until race: ${weeks}

Return ONLY valid JSON in this exact schema (no extra text, no markdown):
{
  "name": "string",
  "sport": "string",
  "race_distance": "string",
  "race_date": "YYYY-MM-DD",
  "total_weeks": number,
  "plan_data": {
    "weeks": [{
      "week_number": number,
      "focus": "string",
      "total_distance_miles": number,
      "days": [{
        "day_of_week": "monday",
        "type": "run|strength|bike|rest|cross-train",
        "title": "string",
        "description": "string",
        "duration_min": number,
        "distance_miles": number,
        "intensity_zone": 1
      }]
    }]
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: TRAINING_PLAN_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('')
      .trim();

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse plan JSON' }, { status: 500 });

    const plan = JSON.parse(jsonMatch[0]);
    plan.total_weeks = weeks;

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    console.error('Plan generation error:', err.message);
    return NextResponse.json({ error: 'Plan generation failed: ' + err.message }, { status: 500 });
  }
}
