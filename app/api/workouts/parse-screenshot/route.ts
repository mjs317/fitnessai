import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

function genId() {
  return Math.random().toString(36).substring(2, 10);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('image') as File;
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

  try {
    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    // Upload to Supabase Storage
    const filename = `screenshots/${user.id}/${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
    await supabase.storage.from('workout-images').upload(filename, file, { contentType: file.type });

    // Parse with Claude Vision
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Extract this workout from the image. Return ONLY a valid JSON object with this exact schema:
{
  "name": "string",
  "type": "strength|crossfit|hyrox|run|bike|mixed",
  "blocks": [{
    "id": "uuid",
    "type": "strength|emom|amrap|fortime|tabata|rest",
    "label": "string",
    "config": {
      "duration_min": number,
      "interval_sec": number,
      "time_cap_min": number,
      "work_sec": number,
      "rest_sec": number,
      "rounds": number,
      "rest_between_sets_sec": number
    },
    "exercises": [{
      "id": "uuid",
      "name": "string",
      "sets": number,
      "reps": "string or number",
      "weight_lbs": number,
      "distance_miles": number,
      "notes": "string"
    }]
  }]
}
Infer workout type from context. Return no commentary, no markdown, only the JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Add UUIDs if missing
    parsed.blocks = (parsed.blocks || []).map((b: any) => ({
      ...b,
      id: b.id || genId(),
      exercises: (b.exercises || []).map((e: any) => ({ ...e, id: e.id || genId() })),
    }));

    return NextResponse.json({ success: true, workout: parsed, screenshot_url: filename });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse workout: ' + err.message }, { status: 500 });
  }
}
