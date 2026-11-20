const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function harness(user) {
  let checks = 0;
  const filename = path.resolve('src/middleware.ts');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const response = () => ({ kind: 'next', cookies: new Map() });
  const normal = mod.require.bind(mod);
  mod.require = (name) => {
    if (name === 'next/server') return { NextResponse: {
      next: response,
      redirect: (url) => ({ kind: 'redirect', pathname: url.pathname }),
    } };
    if (name === '@supabase/ssr') return {
      createServerClient: (_url, _key, options) => {
        return { auth: { getUser: async () => {
          checks++;
          if (user) options.cookies.setAll([{ name: 'test-session', value: 'renewed' }]);
          return { data: { user } };
        } } };
      },
    };
    return normal(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return {
    checks: () => checks,
    run: (pathname) => mod.exports.middleware({
      nextUrl: { pathname, clone: () => ({ pathname }) },
      cookies: { getAll: () => [], set() {} },
    }),
  };
}

// Dummy configuration only. No environment file, real key or network is loaded.
async function configured(run) {
  const previous = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://offline.invalid';
  process.env.SUPABASE_ANON_KEY = 'offline-test-key';
  try { await run(); }
  finally {
    if (previous === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous;
    if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousKey;
  }
}

test('public navigation and self-authenticating API routes never wait for middleware authentication', async () => {
  await configured(async () => {
    const h = harness(null);
    for (const route of ['/', '/about', '/workspace', '/setup', '/login', '/auth/callback', '/api/status', '/api/conversations', '/api/user/usage', '/api/research', '/_next/webpack-hmr', '/favicon.ico']) {
      assert.equal((await h.run(route)).kind, 'next', route);
    }
    assert.equal(h.checks(), 0);
  });
});

test('saved research and settings still reject signed-out visitors', async () => {
  await configured(async () => {
    const h = harness(null);
    for (const route of ['/library', '/chat/saved-id', '/settings']) {
      assert.deepEqual(await h.run(route), { kind: 'redirect', pathname: '/login' });
    }
    assert.equal(h.checks(), 3);
    assert.equal((await h.run('/login')).kind, 'next');
  });
});

test('signed-in protected navigation and refreshed session cookies remain intact', async () => {
  await configured(async () => {
    const h = harness({ id: 'offline-user' });
    const library = await h.run('/library');
    assert.equal(library.kind, 'next');
    assert.equal(library.cookies.get('test-session'), 'renewed');
    assert.equal((await h.run('/login')).kind, 'next');
    assert.equal((await h.run('/chat/saved-id')).kind, 'next');
  });
});

test('Sign up always opens the account page even when a server session already exists', async () => {
  await configured(async () => {
    for (const user of [null, { id: 'existing-session' }]) {
      const h = harness(user);
      assert.equal((await h.run('/login')).kind, 'next');
      assert.equal(h.checks(), 0, 'Account page must not await or redirect on a server auth check');
    }
  });
});

test('account screen offers Google sign-in or an explicit workspace link, without starting either automatically', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const user of [null, { email: 'student@example.test' }]) {
    const filename = path.resolve('src/app/login/page.tsx');
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = module.paths;
    const normal = mod.require.bind(mod);
    mod.require = (name) => {
      if (name === 'next/link') return { default: 'a' };
      if (name === '@/lib/auth-errors') return require('./helpers/load-ts.cjs').loadTs('src/lib/auth-errors.ts');
      if (name === 'lucide-react') return { ArrowUpRight: 'svg', Loader2: 'svg' };
      if (name === '@/components/ResearchProvider') return {
        useResearch: () => ({ user, error: '', signIn() { throw Error('Sign-in must require a click'); } }),
      };
      return normal(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, filename);
    const html = renderToStaticMarkup(React.createElement(mod.exports.default));
    assert.match(html, /class="login-page"/);
    if (user) {
      assert.match(html, /You’re signed in/);
      assert.match(html, /href="\/workspace"/);
      assert.doesNotMatch(html, /Continue with Google/);
    } else {
      assert.match(html, /Continue with Google/);
      assert.doesNotMatch(html, /Open workspace/);
    }
  }
});
