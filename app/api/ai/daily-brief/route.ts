import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAnthropicClient } from '@/lib/ai/client';
import { DAILY_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { buildCoachingSnapshot } from '@/lib/ai/dataSnapshot';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const today = format(new Date(), 'yyyy-MM-dd');
    const serviceSupabase = await createServiceRoleClient();

    // Check cache
    const { data: cached } = await serviceSupabase
      .from('ai_recommendations')
      .select('verdict, content, created_at')
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('recommendation_type', 'daily_brief')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      const ageHours = (Date.now() - new Date(cached.created_at).getTime()) / 3600000;
      if (ageHours < 6) {
        return NextResponse.json({ verdict: cached.verdict, content: cached.content, cached: true });
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        verdict: 'MAINTAIN',
        content: '🟡 MAINTAIN — ANTHROPIC_API_KEY not configured.',
        cached: false,
      });
    }

    const snapshot = await buildCoachingSnapshot(user.id, today);
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: DAILY_BRIEF_SYSTEM,
      messages: [{
        role: 'user',
        content: `Today is ${today}. Here is my data:\n${JSON.stringify(snapshot, null, 2)}\n\nGive me my daily coaching brief.`,
      }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('\n')
      .trim();

    let verdict: 'PUSH' | 'MAINTAIN' | 'RECOVER' = 'MAINTAIN';
    if (/PUSH/i.test(text.slice(0, 50))) verdict = 'PUSH';
    else if (/RECOVER/i.test(text.slice(0, 50))) verdict = 'RECOVER';

    await serviceSupabase.from('ai_recommendations').insert({
      user_id: user.id,
      date: today,
      recommendation_type: 'daily_brief',
      verdict,
      content: text,
      data_snapshot: snapshot as any,
    });

    return NextResponse.json({ verdict, content: text, cached: false });
  } catch (err: any) {
    console.error('AI daily brief error:', err.message);
    return NextResponse.json({
      verdict: 'MAINTAIN',
      content: '🟡 MAINTAIN — Could not generate AI brief. Check your data and proceed with scheduled training if you feel good.',
      cached: false,
    });
  }
}
