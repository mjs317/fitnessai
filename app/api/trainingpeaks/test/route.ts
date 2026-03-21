import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { url } = await request.json();
  if (!url) return NextResponse.json({ success: false, error: 'No URL provided' });

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'FitnessCoach/1.0' } });
    if (!res.ok) return NextResponse.json({ success: false, error: `HTTP ${res.status}` });
    const text = await res.text();
    const isICS = text.includes('BEGIN:VCALENDAR');
    const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
    return NextResponse.json({ success: isICS, eventCount, message: isICS ? `Valid .ics — ${eventCount} events found` : 'Not a valid .ics file' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
