const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
// Lucide ships a CommonJS build with .js under a module-typed package.
// Compile that published build as CJS for this Node-only harness.
const iconPath = require.resolve('lucide-react');
const iconModule = new Module(iconPath, module);
iconModule.filename = iconPath; iconModule.paths = module.paths;
iconModule._compile(fs.readFileSync(iconPath,'utf8'), iconPath + '.cjs');

function load(file, mocks) {
  const filename = path.resolve(file), m = new Module(filename, module);
  m.filename = filename; m.paths = module.paths;
  const normal = m.require.bind(m);
  m.require = name => Object.hasOwn(mocks, name) ? mocks[name] : normal(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
  }).outputText, filename);
  return m.exports;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function words(tree) {
  if (Array.isArray(tree)) return tree.map(words).join('');
  if (React.isValidElement(tree)) return words(tree.props.children);
  return tree == null ? '' : String(tree);
}
function libraryHarness({user = true, saved, capacity = 8} = {}) {
  const slots = [], calls = {removed: [], resets: 0}, effects = []; let cursor = 0;
  const state = {
    user: user ? {email:'fixture@example.invalid'} : null,
    saved: saved || Array.from({length:14}, (_,i) => ({id:'fixture-'+i,title:'Research question '+i,updated_at:'2026-11-16T10:00:00Z'})),
    query:'', remove:null, busy:false, error:'',
    setQuery(value) {state.query=value}, setRemove(value) {state.remove=value},
    reset() {calls.resets++}, async deleteSaved(id) {calls.removed.push(id);state.saved=state.saved.filter(s=>s.id!==id);state.remove=null},
  };
  function Dialog({children,open,title}) {return React.createElement('div',{hidden:!open,'aria-label':title},children)}
  const mocks = {
    'lucide-react': iconModule.exports,
    react: {...React, useEffect(effect){effects.push(effect)}, useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial})},
      useState(initial){const i=cursor++;if(!(i in slots))slots[i]=i===1?capacity:initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},
    },
    'next/link': {default:({children,...props})=>React.createElement('a',props,children)},
    './ResearchProvider': {useResearch:()=>state}, './PanelDialog': {PanelDialog:Dialog},
    'next/navigation': {usePathname:()=>'/library'},
  };
  const {LibraryPage}=load('src/components/LibraryPage.tsx',mocks);
  return {state,calls,effects,render(){cursor=0;effects.length=0;return LibraryPage()},nodes,words};
}
module.exports={libraryHarness,nodes,words};
