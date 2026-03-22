import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAnthropicClient, CLAUDE_MODEL } from '@/lib/ai/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { goal, weeks, training_days, fitness_level, equipment } = body;

    if (!goal || !weeks) {
      return NextResponse.json({ error: 'Missing required fields: goal, weeks' }, { status: 400 });
    }

    const anthropic = getAnthropicClient();

    const prompt = `Generate a ${weeks}-week strength and conditioning program.

Athlete profile:
- Goal: ${goal} (e.g. strength, muscle building, CrossFit, general fitness)
- Available training days: ${training_days?.join(', ') || 'Mon, Tue, Thu, Fri'}
- Fitness level: ${fitness_level || 'intermediate'}
- Equipment: ${equipment || 'full gym (barbells, dumbbells, pullup bar, rower, ski erg, assault bike)'}
- Weeks: ${weeks}

Return ONLY valid JSON in this exact schema (no extra text, no markdown):
{
  "name": "string",
  "sport": "strength",
  "total_weeks": number,
  "plan_data": {
    "weeks": [{
      "week_number": number,
      "focus": "string",
      "days": [{
        "day_of_week": "monday",
        "type": "strength|crossfit|rest|active_recovery",
        "title": "string",
        "description": "string",
        "duration_min": number,
        "blocks": [{
          "type": "strength|emom|amrap|fortime|tabata|rest",
          "name": "string",
          "exercises": [{
            "name": "string",
            "sets": number,
            "reps": "string",
            "weight": "string",
            "notes": "string"
          }]
        }]
      }]
    }]
  }
}`;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: 'You are an expert strength and conditioning coach. Generate structured, progressive training programs. Always return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('')
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse plan JSON' }, { status: 500 });

    const plan = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    console.error('Plan generation error:', err.message);
    return NextResponse.json({ error: 'Plan generation failed: ' + err.message }, { status: 500 });
  }
}
