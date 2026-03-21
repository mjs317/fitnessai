import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ success: true, message: 'TrainingPeaks sync — Phase 7' });
}
