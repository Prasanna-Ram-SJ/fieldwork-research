const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");

function load(file, mocks = {}, extra = "") {
  const filename = path.resolve(file),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const normal = m.require.bind(m);
  m.require = (name) => name === '@/lib/research/response-events' ? require('./helpers/load-ts.cjs').loadTs('src/lib/research/response-events.ts') : name === '@/lib/research/clarify' ? require('./helpers/load-ts.cjs').loadTs('src/lib/research/clarify.ts') :
    Object.hasOwn(mocks, name) ? mocks[name] : normal(name);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  m._compile(code + extra, filename);
  return m.exports;
}
function hooks(ready=false) {
  const slots = [];
  let index = 0;
  return {
    begin() {
      index = 0;
    },
    react: {
      ...React,
      useEffect() {},
      useState(initial) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = ready && initial && typeof initial==='object' && 'research_enabled' in initial ? {supabase:true,nebius:true,tavily:true,model:true,research_enabled:true} : initial;
        return [
          slots[slot],
          (value) => {
            slots[slot] =
              typeof value === "function" ? value(slots[slot]) : value;
          },
        ];
      },
      useRef(initial) {
        const slot = index++;
        return slots[slot] ?? (slots[slot] = { current: initial });
      },
    },
  };
}
function controller(ready=false) {
  const h = hooks(ready),
    routes = [];
  const example = load("src/lib/example.ts");
  const mod = load(
    "src/components/ResearchProvider.tsx",
    {
      react: h.react,
      "next/navigation": {
        useRouter: () => ({
          push: (p) => routes.push(p),
          replace: (p) => routes.push(p),
        }),
      },
      "@/lib/supabase/browser": {
        createClient: () => {
          throw Error("External auth is forbidden in this offline test");
        },
      },
      "@/lib/example": example,
      "@/lib/auth-errors": load("src/lib/auth-errors.ts"),
    },
    "\nexports.testController=useResearchState;",
  );
  return {
    routes,
    render() {
      h.begin();
      return mod.testController();
    },
  };
}
function fixture(id) {
  return {
    ok: true,
    json: async () => ({
      messages: [
        {
          id: "message-" + id,
          role: "user",
          content: { text: "Saved question" },
          research_run_id: null,
        },
      ],
      sources: [],
      events: [],
    }),
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}
function offlineGlobals(fetcher) {
  const oldFetch = global.fetch,
    oldStorage = global.sessionStorage;
  global.fetch = (url) => {
    assert.match(url, /^\/api\/conversations\//);
    return fetcher(url);
  };
  global.sessionStorage = {
    getItem: () => null,
    removeItem() {},
    setItem() {},
  };
  return () => {
    global.fetch = oldFetch;
    if (oldStorage === undefined) delete global.sessionStorage;
    else global.sessionStorage = oldStorage;
  };
}

test("a fresh workspace clears the opened chat and prepared answer", async () => {
  const restore = offlineGlobals(async () => fixture("saved"));
  try {
    const c = controller();
    await c.render().openSaved("saved");
    assert.equal(c.render().id, "saved");
    c.render().reset();
    let state = c.render();
    assert.equal(state.id, null);
    assert.deepEqual(state.messages, []);
    assert.equal(c.routes.at(-1), "/workspace");
    state.showExample();
    assert.equal(c.render().example, true);
    c.render().reset();
    state = c.render();
    assert.equal(state.example, false);
    assert.deepEqual(state.sources, []);
  } finally {
    restore();
  }
});
test("opening the prepared report navigates to Workspace and ignores a late saved-chat response", async () => {
  const pending = deferred(), restore = offlineGlobals(() => pending.promise);
  try {
    const c = controller(), opening = c.render().openSaved("slow");
    c.render().setSelectedClaim({ run: "old", index: 4 });
    c.render().setClarification("Old clarification");
    c.render().showExample();
    const state = c.render();
    assert.equal(c.routes.at(-1), "/workspace");
    assert.equal(state.example, true);
    assert.equal(state.loading, false);
    assert.equal(state.selectedClaim, null);
    assert.equal(state.clarification, null);
    assert.ok(state.activeSources.length > 0);
    pending.resolve(fixture("slow"));
    await opening;
    assert.equal(c.render().example, true);
    assert.equal(c.render().id, null);
    assert.deepEqual(c.render().messages, []);
  } finally { restore(); }
});

test("a late Library response cannot reopen a chat after Workspace was chosen", async () => {
  const pending = deferred(),
    restore = offlineGlobals(() => pending.promise);
  try {
    const c = controller(),
      opening = c.render().openSaved("slow");
    assert.equal(c.render().loading, true);
    c.render().reset();
    pending.resolve(fixture("slow"));
    await opening;
    assert.equal(c.render().id, null);
    assert.deepEqual(c.render().messages, []);
    assert.equal(c.render().loading, false);
    assert.deepEqual(c.routes, ["/workspace"]);
  } finally {
    restore();
  }
});
test("opening two Library chats keeps the most recently requested one", async () => {
  const first = deferred(),
    second = deferred(),
    restore = offlineGlobals((url) =>
      url.endsWith("/first") ? first.promise : second.promise,
    );
  try {
    const c = controller(),
      a = c.render().openSaved("first"),
      b = c.render().openSaved("second");
    second.resolve(fixture("second"));
    await b;
    first.resolve(fixture("first"));
    await a;
    assert.equal(c.render().id, "second");
    assert.deepEqual(c.routes, ["/chat/second"]);
  } finally {
    restore();
  }
});
function workspaceLink(busy = false) {
  const h = hooks();
  let resets = 0;
  const { SiteNav } = load("src/components/SiteNav.tsx", {
    react: h.react,
    "lucide-react": { BookOpen: "i", LogOut: "i", Menu: "i", X: "i" },
    "next/link": { default: "a" },
    "next/navigation": { usePathname: () => "/chat/saved" },
    "./ResearchProvider": {
      useResearch: () => ({
        user: { email: "offline@example.test" },
        busy,
        reset: () => resets++,
      }),
    },
  });
  h.begin();
  const tree = SiteNav();
  function find(node) {
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (!node?.props) return;
    if (node.props.href === "/workspace") return node;
    return find(node.props.children);
  }
  return { link: find(tree), resets: () => resets };
}
test("the navbar Workspace action starts fresh while modified clicks remain links", () => {
  const { link, resets } = workspaceLink();
  let prevented = false;
  link.props.onClick({ preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
  assert.equal(resets(), 1);
  prevented = false;
  link.props.onClick({
    ctrlKey: true,
    preventDefault: () => (prevented = true),
  });
  assert.equal(prevented, false);
  assert.equal(resets(), 1);
});
test("the navbar remains available to resume a running research task", () => {
  const {link,resets}=workspaceLink(true);
  assert.equal(link.props['aria-disabled'],undefined);
  link.props.onClick({preventDefault(){}});
  assert.equal(resets(),1);
});

test('a signed-out user submits a real guest question without an OAuth redirect or account writes',async()=>{
 const originalFetch=global.fetch,originalStorage=global.sessionStorage;const calls=[];
 global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};
 global.fetch=async(url,init)=>{calls.push(url);if(url==='/api/guest/session')return new Response(JSON.stringify({enabled:true,remaining:3,daily_limit:3,pool_remaining:20}),{headers:{'Content-Type':'application/json'}});
 assert.equal(url,'/api/guest/research');const body=JSON.parse(init.body);assert.equal(body.question,'What did NASA DART demonstrate?');assert.ok(body.request_id);
 const event={research_run_id:'guest-run',sequence:1,timestamp:new Date().toISOString(),type:'answer_completed',payload:{assistant_message_id:'guest-answer',answer:{blocks:[{text:'An offline answer for UI verification.',claim_type:'background',source_refs:[]}],evidence_status:'limited'}}};
 return new Response('event: answer_completed\ndata: '+JSON.stringify(event)+'\n\n',{headers:{'Content-Type':'text/event-stream'}});};
 try {const c=controller(true);c.render().setDraft('What did NASA DART demonstrate?');await c.render().execute();const result=c.render();assert.equal(result.user,null);assert.equal(result.id,null);assert.equal(result.messages.filter(m=>m.role==='assistant').length,1);assert.equal(result.busy,false);assert.equal(result.error,'');assert.ok(!c.routes.some(p=>p.includes('login')||p.includes('/chat/')));assert.ok(calls.includes('/api/guest/research'));}
 finally{global.fetch=originalFetch;originalStorage===undefined?delete global.sessionStorage:global.sessionStorage=originalStorage;}
});
test('an infrastructure HTML error preserves the guest question and is never retried automatically',async()=>{
 const originalFetch=global.fetch,originalStorage=global.sessionStorage;let submits=0;
 global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};
 global.fetch=async(url)=>{if(url==='/api/guest/session')return new Response(JSON.stringify({enabled:true,remaining:3,daily_limit:3,pool_remaining:20}));assert.equal(url,'/api/guest/research');submits++;return new Response('<!DOCTYPE html><title>Service unavailable</title>',{status:503,headers:{'Content-Type':'text/html'}})};
 try {const c=controller(true);c.render().setDraft('What did NASA DART demonstrate?');await c.render().execute();const result=c.render();assert.match(result.error,/temporarily unavailable \(HTTP 503\)/);assert.equal(result.draft,'What did NASA DART demonstrate?');assert.equal(submits,1);assert.equal(result.busy,false);}
 finally{global.fetch=originalFetch;originalStorage===undefined?delete global.sessionStorage:global.sessionStorage=originalStorage;}
});

test('a hosted guest queued response reaches the same Workspace answer without creating an account',async()=>{
 const oldFetch=global.fetch,oldStorage=global.sessionStorage;let posts=0,reads=0;
 global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};
 global.fetch=async(url,init)=>{
  if(url==='/api/guest/session')return Response.json({enabled:true,remaining:10,daily_limit:10,pool_remaining:90});
  if(url==='/api/guest/research'){posts++;assert.equal(init.method,'POST');return Response.json({job_id:'a'.repeat(36),poll_url:'/api/guest/research/jobs/'+('a'.repeat(36))},{status:202});}
  assert.ok(url.startsWith('/api/guest/research/jobs/'));reads++;return Response.json({status:'completed',entries:[{cursor:1,event:{research_run_id:'guest-job',sequence:1,timestamp:new Date().toISOString(),type:'answer_completed',payload:{assistant_message_id:'offline-answer',answer:{blocks:[{text:'A queued offline answer.',claim_type:'background',source_refs:[]}],evidence_status:'limited'}}}}]});
 };
 try{const c=controller(true);c.render().setDraft('What did NASA DART demonstrate?');await c.render().execute();assert.equal(posts,1);assert.equal(reads,1);assert.equal(c.render().messages.filter(m=>m.role==='assistant').length,1);assert.equal(c.render().error,'');assert.equal(c.render().busy,false);assert.equal(c.render().user,null);}
 finally{global.fetch=oldFetch;oldStorage===undefined?delete global.sessionStorage:global.sessionStorage=oldStorage;}
});

test('configuration loading is not reported as an owner pause and cannot submit research',async()=>{const oldFetch=global.fetch,oldStorage=global.sessionStorage;let posts=0;global.fetch=async()=>{posts++;throw Error('No request allowed while status is loading')};global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};try{const c=controller();c.render().setDraft('What did NASA DART demonstrate?');await c.render().execute();assert.equal(posts,0);assert.match(c.render().error,/connection check is still loading/);assert.ok(!c.render().error.includes('protect your credits'));}finally{global.fetch=oldFetch;oldStorage===undefined?delete global.sessionStorage:global.sessionStorage=oldStorage;}});

test('running research resumes from Workspace while saved conversations stay isolated from its completion',async()=>{
 const oldFetch=global.fetch,oldStorage=global.sessionStorage,completion=deferred();let posts=0;
 global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};
 global.fetch=async(url)=>{
  if(url==='/api/guest/session')return Response.json({enabled:true,remaining:10});
  if(url==='/api/guest/research'){posts++;return completion.promise;}
  assert.equal(url,'/api/conversations/other');return fixture('other');
 };
 try{
  const c=controller(true);c.render().setDraft('What did NASA DART demonstrate?');const work=c.render().execute();
  await new Promise(r=>setImmediate(r));assert.equal(c.render().busy,true);
  await c.render().openSaved('other');assert.equal(c.render().busy,false);assert.equal(c.render().running,true);assert.equal(c.render().id,'other');
  c.render().reset();assert.equal(c.routes.at(-1),'/workspace');assert.equal(c.render().busy,true);assert.equal(c.render().messages[0].content.text,'What did NASA DART demonstrate?');assert.equal(posts,1);
  await c.render().openSaved('other');
  const event={research_run_id:'offline-run',sequence:1,timestamp:new Date().toISOString(),type:'answer_completed',payload:{assistant_message_id:'finished',answer:{blocks:[{text:'Finished active research',source_refs:[]}]}}};
  completion.resolve(new Response('data: '+JSON.stringify(event)+'\n\n',{headers:{'Content-Type':'text/event-stream'}}));await work;
  assert.equal(c.render().id,'other');assert.equal(c.render().messages[0].id,'message-other');assert.equal(c.render().messages.length,1);assert.equal(c.render().running,false);assert.equal(c.render().error,'');assert.equal(posts,1);
  c.render().reset();assert.equal(c.render().id,null);assert.deepEqual(c.render().messages,[]);
 }finally{global.fetch=oldFetch;oldStorage===undefined?delete global.sessionStorage:global.sessionStorage=oldStorage;}
});

test('resuming research invalidates an older in-flight saved conversation response',async()=>{
 const oldFetch=global.fetch,oldStorage=global.sessionStorage,completion=deferred(),saved=deferred();
 global.sessionStorage={removeItem(){},getItem(){return null},setItem(){}};
 global.fetch=async url=>url==='/api/guest/session'?Response.json({enabled:true,remaining:10}):url==='/api/guest/research'?completion.promise:saved.promise;
 try{
  const c=controller(true);c.render().setDraft('What did NASA DART demonstrate?');const work=c.render().execute();await new Promise(r=>setImmediate(r));
  const opening=c.render().openSaved('slow');c.render().reset();saved.resolve(fixture('slow'));await opening;
  assert.equal(c.render().id,null);assert.equal(c.render().busy,true);assert.equal(c.render().loading,false);assert.equal(c.render().messages[0].content.text,'What did NASA DART demonstrate?');
  completion.resolve(new Response('data: '+JSON.stringify({type:'provider_error',payload:{message:'Offline failure'}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}}));await work;assert.equal(c.render().error,'Offline failure');
 }finally{global.fetch=oldFetch;oldStorage===undefined?delete global.sessionStorage:global.sessionStorage=oldStorage;}
});
