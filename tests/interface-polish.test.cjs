const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");
function load(file, mocks = {}) {
  const filename = path.resolve(file),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  const normal = m.require.bind(m);
  m.require = (name) => name === '@/lib/research/clarify' ? require('./helpers/load-ts.cjs').loadTs('src/lib/research/clarify.ts') :
    Object.hasOwn(mocks, name) ? mocks[name] : normal(name);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const { describeActivity } = load("src/lib/ui/activity-details.ts");
const { sourceIconUrl } = load("src/lib/ui/source-icon.ts");
const { mergeDictation, dictationError } = load("src/lib/ui/dictation.ts");
const { buildPaint } = load("src/components/originkit/paperline-engine.ts");
const { libraryHarness, nodes: libraryNodes, words: libraryWords } = require("./helpers/library-harness.cjs");
const event = (type, payload, run = "offline") => ({
  type,
  payload,
  research_run_id: run,
  sequence: 1,
  timestamp: "2026-11-16T12:00:00Z",
});

test("Library search resets pagination and saved entries keep their original routes", () => {
  const h = libraryHarness();
  const rows = () => libraryNodes(h.render()).filter(n => n.props.href?.startsWith('/chat/') && n.props.title);
  assert.equal(rows().length, 8);
  assert.equal(rows()[0].props.href, '/chat/fixture-0');
  libraryNodes(h.render()).find(n => n.type === 'button' && libraryWords(n).includes('Next')).props.onClick();
  assert.equal(rows()[0].props.href, '/chat/fixture-8');
  libraryNodes(h.render()).find(n => n.type === 'input').props.onChange({target:{value:'question 13'}});
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].props.href, '/chat/fixture-13');
  h.state.query='no matching question';
  assert.match(libraryWords(h.render()), /No matching research/);
  libraryNodes(h.render()).find(n => n.type === 'button' && libraryWords(n)==='Clear search').props.onClick();
  assert.equal(h.state.query,'');
});

test("Library deletion still requires confirmation and New research resets the workspace", async () => {
  const h=libraryHarness();
  const remove=()=>libraryNodes(h.render()).find(n=>n.props['aria-label']==='Delete Research question 0');
  remove().props.onClick();
  assert.equal(h.state.remove,'fixture-0');
  assert.deepEqual(h.calls.removed,[]);
  libraryNodes(h.render()).find(n=>n.type==='button'&&libraryWords(n)==='Keep research').props.onClick();
  assert.equal(h.state.remove,null);
  remove().props.onClick();
  await libraryNodes(h.render()).find(n=>n.type==='button'&&libraryWords(n)==='Delete research').props.onClick();
  assert.deepEqual(h.calls.removed,['fixture-0']);
  const fresh=libraryNodes(h.render()).find(n=>n.props.href==='/workspace'&&libraryWords(n).includes('New research'));
  fresh.props.onClick(); assert.equal(h.calls.resets,1);
});

test("Library signed-out, empty and error states remain actionable", () => {
  const signedOut=libraryHarness({user:false});
  assert.equal(libraryNodes(signedOut.render()).find(n=>n.type==='input').props.disabled,true);
  assert.ok(libraryNodes(signedOut.render()).some(n=>n.props.href==='/login'));
  const empty=libraryHarness({saved:[]});
  assert.match(libraryWords(empty.render()),/No saved research yet/);
  assert.ok(libraryNodes(empty.render()).some(n=>n.props.href==='/workspace'));
  empty.state.error='Could not load saved research';
  assert.match(libraryWords(libraryNodes(empty.render()).find(n=>n.props.role==='alert')),/Could not load/);
});

test("Library fits compact rows to the available height without page scrolling", () => {
  const h = libraryHarness();
  const tree = h.render();
  const table = libraryNodes(tree).find(n => n.props.className === 'library-table');
  const box = {clientHeight:450,clientWidth:1100,querySelector:()=>({offsetHeight:30})};
  table.props.ref.current = box;
  const keys = ['ResizeObserver','addEventListener','removeEventListener','getComputedStyle'];
  const previous = Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(global,k)]));
  let resize;
  global.ResizeObserver = class {observe(){} disconnect(){}};
  global.addEventListener = (_,callback)=>{resize=callback};
  global.removeEventListener = ()=>{};
  global.getComputedStyle = ()=>({getPropertyValue:()=> '58px'});
  try {
    const cleanup=h.effects[0]();
    assert.equal(libraryNodes(h.render()).filter(n=>n.props.title&&n.props.href?.startsWith('/chat/')).length,7);
    box.clientWidth=340; box.clientHeight=250;
    resize();
    assert.equal(libraryNodes(h.render()).filter(n=>n.props.title&&n.props.href?.startsWith('/chat/')).length,3);
    cleanup();
  } finally {
    for(const key of keys) if(previous[key]) Object.defineProperty(global,key,previous[key]); else delete global[key];
  }
});

test("Library searches across pages with multiple words and accent-insensitive matching", () => {
  const h = libraryHarness({capacity:1,saved:[
    {id:'a',title:'Research on urban heat',updated_at:'2026-11-18T10:00:00Z'},
    {id:'b',title:'Café transport evidence',updated_at:'2026-11-17T10:00:00Z'},
  ]});
  const input=()=>libraryNodes(h.render()).find(n=>n.type==='input');
  input().props.onChange({target:{value:'  EVIDENCE cafe  '}});
  assert.equal(libraryNodes(h.render()).find(n=>n.props.title).props.href,'/chat/b');
  assert.match(libraryWords(h.render()),/1 matching conversation/);
  input().props.onKeyDown({key:'Escape'});
  assert.equal(h.state.query,'');
});

test("Library jumps directly to older pages, sorts and resets to the first result", () => {
  const h = libraryHarness({capacity:1,saved:[
    {id:'b',title:'Beta',updated_at:'2026-11-17T10:00:00Z'},
    {id:'a',title:'Alpha',updated_at:'2026-11-18T10:00:00Z'},
    {id:'c',title:'Charlie',updated_at:'2026-11-16T10:00:00Z'},
  ]});
  const first=()=>libraryNodes(h.render()).find(n=>n.props.title).props.href;
  assert.equal(first(),'/chat/a');
  libraryNodes(h.render()).find(n=>n.props['aria-label']==='Go to page').props.onChange({target:{value:'2'}});
  assert.equal(first(),'/chat/c');
  const sort=()=>libraryNodes(h.render()).find(n=>n.type==='select'&&!n.props['aria-label']);
  sort().props.onChange({target:{value:'oldest'}});
  assert.equal(first(),'/chat/c');
  sort().props.onChange({target:{value:'title'}});
  assert.equal(first(),'/chat/a');
  libraryNodes(h.render()).find(n=>n.props['aria-label']==='Go to page').props.onChange({target:{value:'2'}});
  h.state.saved=h.state.saved.slice(0,1);
  assert.equal(first(),'/chat/b');
  assert.equal(libraryNodes(h.render()).find(n=>n.props['aria-label']==='Next page').props.disabled,true);
});
test("Activity expands searches into actual result counts, including zero", () => {
  const detail = describeActivity(
    event("search_completed", { searches_count: 2, raw_results_count: 17 }),
  );
  assert.match(detail, /Successful searches\n2/);
  assert.match(detail, /Results before filtering\n17/);
  assert.match(
    describeActivity(
      event("search_completed", { searches_count: 0, raw_results_count: 0 }),
    ),
    /Results before filtering\n0/,
  );
});
test("Activity exposes the selected pages and supporting excerpts", () => {
  const detail = describeActivity(
    event("evidence_selected", {
      selected_sources_count: 1,
      sources: [
        {
          title: "Original study",
          domain: "example.org",
          original_url: "https://example.org/study",
          snippet_preview: "Recorded supporting excerpt.",
        },
      ],
    }),
  );
  for (const value of [
    "Original study",
    "example.org",
    "https://example.org/study",
    "Recorded supporting excerpt.",
  ])
    assert.ok(detail.includes(value));
});
test("verification details use completion from the same run only", () => {
  const check = event("verification_started", {
      message: "Checking excerpts.",
    }),
    done = event("answer_completed", {
      answer: {
        evidence_status: "limited",
        blocks: [
          { claim_type: "fact", source_refs: ["S1"] },
          { claim_type: "inference", source_refs: ["S1", "S2"] },
        ],
      },
    });
  const detail = describeActivity(check, [done]);
  assert.match(detail, /Factual paragraphs\n1/);
  assert.match(detail, /Distinct cited sources\n2/);
  assert.match(detail, /Evidence status\nlimited/);
  assert.match(
    describeActivity(check, [{ ...done, research_run_id: "another-run" }]),
    /No completed review result/,
  );
});
test("completed Activity shows real usage and elapsed time without dumping unknown fields", () => {
  const detail = describeActivity(
    event("answer_completed", {
      elapsed_ms: 12340,
      tavily_credits: 2,
      tokens: { input: 450, output: 180 },
      internal_debug: "SHOULD_NOT_APPEAR",
    }),
  );
  assert.match(detail, /12\.3 seconds/);
  assert.match(detail, /Search credits used\n2/);
  assert.match(detail, /Model input tokens\n450/);
  assert.ok(!detail.includes("SHOULD_NOT_APPEAR"));
});
test("refinement details and sparse legacy events stay informative and honest", () => {
  const detail = describeActivity(
    event("refinement_started", {
      refinement_query: "A focused missing-evidence query",
      reason: "Two source pages were available.",
    }),
  );
  assert.ok(detail.includes("A focused missing-evidence query"));
  assert.ok(detail.includes("Two source pages were available."));
  const old = describeActivity(event("search_completed", {}));
  assert.ok(!old.includes("undefined"));
  assert.ok(!old.includes("NaN"));
  assert.ok(!old.includes("Successful searches"));
});
test("favicon URLs contain only a public origin, never the research path or query", () => {
  assert.equal(
    sourceIconUrl("https://example.org/private/path?question=private"),
    "https://example.org/favicon.ico",
  );
  assert.equal(
    sourceIconUrl("http://example.org/article"),
    "https://example.org/favicon.ico",
  );
  for (const value of [
    "javascript:alert(1)",
    "file:///local",
    "http://localhost:3011/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "https://name:password@example.org/",
    "https://printer.local/",
    "invalid",
  ])
    assert.equal(sourceIconUrl(value), null);
});
const results = (...texts) =>
  texts.map((transcript, index) => ({
    isFinal: index === 0,
    0: { transcript },
  }));
test("dictation replaces interim hypotheses instead of duplicating them", () => {
  assert.equal(
    mergeDictation("Existing draft", results("hello")),
    "Existing draft hello",
  );
  assert.equal(
    mergeDictation("Existing draft", results("hello world")),
    "Existing draft hello world",
  );
  assert.equal(
    mergeDictation("", results("A final sentence.", "Another partial")),
    "A final sentence. Another partial",
  );
});
test("dictation respects the question limit and explains permission failures", () => {
  assert.equal(
    mergeDictation("x".repeat(990), results("a longer spoken question")).length,
    1000,
  );
  assert.match(dictationError("not-allowed"), /permission was denied/);
  assert.match(dictationError("network"), /speech service could not connect/);
});
test("Dynamic Weight receives nine measured painted glyphs at desktop and phone sizes", () => {
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
    [320, 568],
  ]) {
    const paint = buildPaint(w, h);
    assert.equal(paint.glyphs.length, 9);
    for (const g of paint.glyphs) {
      assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y));
      assert.ok(g.x > 0 && g.x < w);
      assert.ok(g.y > 0 && g.y < h);
      assert.ok(g.halfWidth > 0);
    }
    assert.ok(paint.end > 0);
  }
});
test("voice capture starts only on explicit action and stale speech cannot overwrite an edit", () => {
  const React = require("react"),
    slots = [],
    effects = [];
  let index = 0,
    mounted = false,
    starts = 0,
    aborts = 0,
    instance;
  const output = [];
  const mockReact = {
    ...React,
    useCallback: (fn) => fn,
    useEffect: (fn) => {
      if (!mounted) effects.push(fn);
    },
    useState: (initial) => {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [
        slots[slot],
        (v) => (slots[slot] = typeof v === "function" ? v(slots[slot]) : v),
      ];
    },
    useRef: (initial) => {
      const slot = index++;
      return slots[slot] ?? (slots[slot] = { current: initial });
    },
  };
  class Recognition {
    constructor() {
      instance = this;
    }
    start() {
      starts++;
      this.onstart?.();
    }
    stop() {
      this.onend?.();
    }
    abort() {
      aborts++;
    }
  }
  const oldWindow = global.window,
    oldDocument = global.document,
    oldNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
  global.window = { SpeechRecognition: Recognition };
  global.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
  try {
    const { useDictation } = load("src/components/useDictation.ts", {
      react: mockReact,
      "@/lib/ui/dictation": { mergeDictation, dictationError },
    });
    const render = () => {
      index = 0;
      return useDictation((text) => output.push(text));
    };
    render();
    const cleanups = effects.map((fn) => fn());
    mounted = true;
    assert.equal(starts, 0);
    render().toggle("Draft");
    assert.equal(starts, 1);
    assert.equal(render().listening, true);
    instance.onresult({ results: results("spoken question") });
    assert.equal(output.at(-1), "Draft spoken question");
    const lateResult = instance.onresult;
    render().cancel();
    lateResult({ results: results("must not overwrite the edited question") });
    assert.equal(output.length, 1);
    assert.equal(aborts, 1);
    assert.equal(render().listening, false);
    cleanups.forEach((fn) => fn?.());
  } finally {
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
    if (oldDocument === undefined) delete global.document;
    else global.document = oldDocument;
    if (oldNavigator) Object.defineProperty(global, "navigator", oldNavigator);
    else delete global.navigator;
  }
});
