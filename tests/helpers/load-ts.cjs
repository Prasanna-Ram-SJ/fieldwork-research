const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loadTs(file, mocks = {}, append = '') {
  const filename = path.resolve(file), mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const normal = mod.require.bind(mod);
  mod.require = name => {
    if (name.endsWith('.css')) return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src/' + name.slice(2)) : path.resolve(path.dirname(filename), name);
      for (const extension of ['.ts', '.tsx']) if (fs.existsSync(base + extension)) return loadTs(base + extension, mocks);
    }
    return normal(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText + append, filename);
  return mod.exports;
}
module.exports = { loadTs };
