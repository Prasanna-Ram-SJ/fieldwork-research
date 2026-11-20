const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const errors = loadTs('src/lib/auth-errors.ts');

function callback(options = {}) {
  let exchanges = 0, profiles = 0;
  const mod = loadTs('src/app/auth/callback/route.ts', {
    'next/server': { NextResponse: { redirect(url) {
      return { url: String(url), cookies: new Map(), headers: new Map() };
    } } },
    '@supabase/ssr': { createServerClient(_url, _key, { cookies }) {
      return {
        auth: { async exchangeCodeForSession() {
          exchanges++;
          if (options.throwExchange) throw new TypeError('fetch failed with private-provider-detail');
          cookies.setAll([
            { name: 'test-verifier', value: '', options: { maxAge: 0 } },
            { name: 'test-session', value: 'offline-session' },
          ]);
          return options.exchange || { data: { user: { id: 'student', email: 'offline@example.test' }, session: {} }, error: null };
        } },
        from(table) {
          assert.equal(table, 'profiles');
          return { upsert(profile) {
            profiles++;
            assert.equal(profile.user_id, 'student');
            return { async abortSignal(signal) {
              assert.ok(signal instanceof AbortSignal);
              if (options.profileFails) throw Error('profile unavailable');
              return { error: null };
            } };
          } };
        },
      };
    } },
  });
  return {
    exchanges: () => exchanges,
    profiles: () => profiles,
    run(query = '') {
      return mod.GET({ url: 'http://localhost:3011/auth/callback' + query,
        cookies: { getAll: () => [{ name: 'test-verifier', value: 'offline-verifier' }], set() {} },
      });
    },
  };
}
async function configured(run) {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const old = names.map(name => process.env[name]);
  process.env.SUPABASE_URL = 'https://offline.invalid';
  process.env.SUPABASE_ANON_KEY = 'offline-key';
  try { await run(); } finally {
    names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; });
  }
}

test('OAuth callback persists exchanged session cookies on its uncached workspace redirect', async () => {
  await configured(async () => {
    const h = callback(), response = await h.run('?code=offline-code');
    assert.equal(response.url, 'http://localhost:3011/workspace');
    assert.equal(response.cookies.get('test-session'), 'offline-session');
    assert.equal(response.cookies.get('test-verifier'), '');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(h.exchanges(), 1);
  });
});
test('optional profile write failure cannot discard a successful Google session', async () => {
  await configured(async () => {
    const h = callback({ profileFails: true }), response = await h.run('?code=offline-code');
    assert.equal(response.url, 'http://localhost:3011/workspace');
    assert.equal(response.cookies.get('test-session'), 'offline-session');
    assert.equal(h.profiles(), 1);
  });
});
test('OAuth redirects stay on this site, including control-character and slash variants', async () => {
  await configured(async () => {
    for (const destination of ['//evil.invalid', '/\\evil.invalid', '/\n/evil.invalid', 'https://evil.invalid']) {
      const response = await callback().run('?code=offline&next=' + encodeURIComponent(destination));
      assert.equal(response.url, 'http://localhost:3011/workspace');
    }
    assert.equal((await callback().run('?code=offline&next=%2Flibrary')).url, 'http://localhost:3011/library');
  });
});
test('OAuth failures produce safe recoverable messages and do not synchronize a profile', async () => {
  await configured(async () => {
    const missing = callback();
    assert.match((await missing.run()).url, /error=session_expired$/);
    assert.equal(missing.exchanges(), 0);
    const denied = callback();
    assert.match((await denied.run('?error=access_denied&error_description=private-detail')).url, /error=oauth_denied$/);
    assert.equal(denied.exchanges(), 0);
    const mismatch = callback({ exchange: { data: {}, error: { code: 'bad_code_verifier', message: 'private-detail' } } });
    const failure = await mismatch.run('?code=secret-must-not-be-reflected');
    assert.match(failure.url, /error=session_storage$/);
    assert.doesNotMatch(failure.url, /private-detail|secret-must/);
    assert.equal(mismatch.profiles(), 0);
    assert.match((await callback({ throwExchange: true }).run('?code=offline')).url, /error=auth_unavailable$/);
    assert.equal(typeof errors.authErrorMessage('constructor'), 'string');
    assert.equal(errors.authErrorCode({ message: 'Database error saving new user' }), 'account_creation_failed');
  });
});

test('navbar combines Sign in and Sign up, waits for restoration and shows Sign out for an account', () => {
  function html(state) {
    const { SiteNav } = loadTs('src/components/SiteNav.tsx', {
      'next/link': { default: ({ prefetch, ...props }) => React.createElement('a', props) },
      'next/navigation': { usePathname: () => '/' },
      'lucide-react': { BookOpen: 'svg', LogOut: 'svg', Menu: 'svg', X: 'svg' },
      './ResearchProvider': { useResearch: () => state },
    });
    return renderToStaticMarkup(React.createElement(SiteNav));
  }
  const signedOut = html({ user: null, authReady: true });
  assert.match(signedOut, />Sign in \/ Sign up<\/a>/);
  assert.equal((signedOut.match(/href="\/login"/g) || []).length, 1);
  assert.match(signedOut, /src="\/fieldwork-mark.svg"/);
  const restoring = html({ user: null, authReady: false });
  assert.match(restoring, /Checking account/);
  assert.doesNotMatch(restoring, /nav-signup/);
  const signedIn = html({ user: { email: 'offline@example.test' }, authReady: true });
  assert.match(signedIn, /Sign out/);
  assert.doesNotMatch(signedIn, /nav-signup|nav-signin/);
});

test('session changes update the navbar state and late restoration cannot undo sign-out', async () => {
  const old = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    fetch: global.fetch, storage: global.sessionStorage };
  const slots = [], effects = [];
  let cursor = 0, listener, resolveUser, resolveSaved, unsubscribed = false;
  const userPromise = new Promise(resolve => { resolveUser = resolve; });
  const savedPromise = new Promise(resolve => { resolveSaved = resolve; });
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    if (url === '/api/conversations') return savedPromise;
    return { ok: true, json: async () => ({ usage: {}, research_enabled: true }) };
  };
  global.sessionStorage = { getItem: () => null, removeItem() {} };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://offline.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-key';
  try {
    const hooks = { ...React,
      useEffect(effect) { effects.push(effect); },
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    };
    const provider = loadTs('src/components/ResearchProvider.tsx', {
      react: hooks,
      'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) },
      '@/lib/supabase/browser': { createClient: () => ({ auth: {
        onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
        getUser: () => userPromise,
      } }) },
    }, '\nexports.controller=useResearchState;');
    const render = () => { cursor = 0; effects.length = 0; return provider.controller(); };
    assert.equal(render().authReady, false);
    const cleanup = effects[0]();
    listener('SIGNED_IN', { user: { id: 'student', email: 'offline@example.test' } });
    let state = render();
    assert.equal(state.user.id, 'student');
    assert.equal(state.authReady, true);
    assert.deepEqual(calls, ['/api/status'], 'Auth callback must not await another auth or data request');
    effects[1]();
    listener('SIGNED_OUT', null);
    resolveUser({ data: { user: { id: 'stale-user' } } });
    resolveSaved({ ok: true, json: async () => ({ conversations: [{ id: 'private-old-chat' }] }) });
    await new Promise(resolve => setImmediate(resolve));
    state = render();
    assert.equal(state.user, null);
    assert.deepEqual(state.saved, []);
    cleanup();
    assert.equal(unsubscribed, true);
  } finally {
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', old.url], ['NEXT_PUBLIC_SUPABASE_ANON_KEY', old.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    global.fetch = old.fetch;
    global.sessionStorage = old.storage;
  }
});
