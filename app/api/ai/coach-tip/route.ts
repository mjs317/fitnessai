import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAnthropicClient, CLAUDE_MODEL } from '@/lib/ai/client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { workoutName, workoutType } = await request.json();

  // Fetch recent workout logs to give context
  const { data: recentLogs } = await supabase
    .from('workout_logs')
    .select('completed_at, rpe_score, notes')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(5);

  const recentSummary = recentLogs && recentLogs.length > 0
    ? recentLogs.map(l => `- RPE ${l.rpe_score ?? '?'} on ${l.completed_at?.slice(0, 10) ?? 'unknown'}${l.notes ? `: ${l.notes}` : ''}`).join('\n')
    : 'No recent sessions logged.';

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a strength and conditioning coach. Give a single focused coaching tip for today's ${workoutType} session: "${workoutName}".

Recent training history:
${recentSummary}

Keep it to 2-3 sentences. Be specific, practical, and motivating. No bullet points, just plain text.`,
      }],
    });

    const tip = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ tip });
  } catch {
    return NextResponse.json({ tip: 'Focus on quality over quantity today. Keep your rest periods consistent and track your weights — small PRs add up over time.' });
  }
}
