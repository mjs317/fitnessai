import { NextResponse } from 'next/server';

export async function GET() {
  // Place the template file at: public/templates/FitnessCoach_WorkoutProgram_Template.xlsx
  // If not present, return instructions.
  return NextResponse.redirect(
    new URL(
      '/templates/FitnessCoach_WorkoutProgram_Template.xlsx',
      process.env.NEXT_PUBLIC_APP_URL || 'https://fitnessai-sand-eta.vercel.app'
    )
  );
}
