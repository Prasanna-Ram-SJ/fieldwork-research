declare module 'citeproc' {
  export class Engine {
    constructor(system: { retrieveLocale: () => string; retrieveItem: (id: string) => unknown }, style: string);
    setOutputFormat(format: string): void;
    updateItems(ids: string[]): void;
    makeBibliography(): [unknown, string[]] | false;
  }
  const commonjs: { Engine: typeof Engine };
  export default commonjs;
}
