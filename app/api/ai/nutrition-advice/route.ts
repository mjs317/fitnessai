import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAnthropicClient, CLAUDE_MODEL } from '@/lib/ai/client';
import { NUTRITION_ADVICE_SYSTEM } from '@/lib/ai/prompts';
import { buildCoachingSnapshot } from '@/lib/ai/dataSnapshot';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const today = format(new Date(), 'yyyy-MM-dd');
    const snapshot = await buildCoachingSnapshot(user.id, today);
    const anthropic = getAnthropicClient();

    const workouts = snapshot.today.scheduledWorkouts
      .map((w: any) => w.workouts?.name || w.external_title || w.external_type || 'workout')
      .join(', ');

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: NUTRITION_ADVICE_SYSTEM,
      messages: [{
        role: 'user',
        content: `Today's training: ${workouts || 'Rest day or no workouts scheduled'}.
Logged so far: ${snapshot.today.nutritionLogged.calories} kcal / ${snapshot.today.nutritionLogged.protein_g}g protein.
Goals: ${snapshot.goals.dailyCalories} kcal / ${snapshot.goals.dailyProteinG}g protein.
Yesterday total: ${snapshot.nutritionYesterday.calories} kcal / ${snapshot.nutritionYesterday.protein_g}g protein.
Give specific advice for today.`,
      }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('')
      .trim();

    return NextResponse.json({ content: text });
  } catch (err: any) {
    return NextResponse.json({ content: 'Nutrition advice unavailable right now.' });
  }
}
