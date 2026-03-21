import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WITHINGS_CLIENT_ID!,
    redirect_uri: process.env.WITHINGS_CALLBACK_URL!,
    scope: 'user.metrics',
    state: user.id,
  });

  const authUrl = `https://account.withings.com/oauth2_user/authorize2?${params}`;
  return NextResponse.redirect(authUrl);
}
