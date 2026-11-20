import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isPublicPage = ['/', '/about', '/workspace', '/setup', '/login'].includes(pathname);
  const isAuthCallback = pathname.startsWith('/auth/');
  const isApiRoute = pathname === '/api' || pathname.startsWith('/api/');
  const isPublicAsset = pathname.startsWith('/_next/') || pathname === '/favicon.ico';

  // Public screens need no server-side session check. API handlers verify the
  // session and ownership themselves; checking here too adds a network round trip.
  // OAuth callbacks exchange their code in the route handler.
  if (isPublicPage || pathname === '/demo' || pathname.startsWith('/demo/') || isAuthCallback || isApiRoute || isPublicAsset) return supabaseResponse;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase credentials are not configured, allow request through to show configuration state
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthenticated user trying to access protected routes
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|fonts/|pdf/|csl/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|css)$).*)',
  ],
};
