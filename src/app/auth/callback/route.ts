import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorCode } from '@/lib/auth-errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const pendingCookies = new Map<string, { name: string; value: string; options?: CookieOptions }>();
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  const fail = (code: string) => redirect('/login?error=' + code);

  if (searchParams.has('error')) {
    return fail(authErrorCode({
      code: searchParams.get('error_code') || searchParams.get('error') || '',
      message: searchParams.get('error_description') || '',
    }));
  }
  const code = searchParams.get('code');
  if (!code) return fail('session_expired');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return fail('auth_not_configured');

  let next = '/workspace';
  const requestedNext = searchParams.get('next');
  if (requestedNext?.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')) {
    try {
      const destination = new URL(requestedNext, origin);
      if (destination.origin === origin) next = destination.pathname + destination.search + destination.hash;
    } catch { /* Keep the workspace destination for malformed redirects. */ }
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach((cookie) => {
            request.cookies.set(cookie.name, cookie.value);
            pendingCookies.set(cookie.name, cookie);
          });
        },
      },
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user || !data.session) return fail(authErrorCode(error));

    // Optional profile metadata must not turn a successful sign-in into an error.
    const user = data.user;
    try {
      await supabase.from('profiles').upsert({
        user_id: user.id,
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Researcher',
        avatar_url: user.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).abortSignal(AbortSignal.timeout(5000));
    } catch { /* The verified session still supplies the account metadata. */ }
    return redirect(next);
  } catch (error) {
    return fail(authErrorCode(error));
  }
}

