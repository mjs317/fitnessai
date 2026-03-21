import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Redirect root to today
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  // Refresh Supabase session cookies so server components always get a valid session
  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session — required for SSR auth to work
    const { data: { user } } = await supabase.auth.getUser();

    // Protect app routes — redirect to /login if not authenticated
    const protectedPaths = ['/today', '/nutrition', '/workouts', '/training', '/settings'];
    const isProtected = protectedPaths.some(p => pathname.startsWith(p));

    if (!user && isProtected) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect logged-in users away from /login
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/today', request.url));
    }
  } catch {
    // If env vars are missing, let the request through —
    // the layout auth check will handle it
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js|workbox-).*)',
  ],
};
