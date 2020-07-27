/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import postcss from 'postcss';
import slug from 'unique-slug';

import ModuleMembers from './ModuleMembers';
import Scope from './Scope';
import { File, Module, ProcessingFile } from './types';

const sepRegex = /\\/g;

// Get a relative version of an absolute path w/ cross-platform/URL-friendly
// directory separators
const relative = (cwd: string, file: string) =>
  path.relative(cwd, file).replace(sepRegex, '/');

const normalizePath = (cwd: string, file: string) => {
  return path.normalize(!path.isAbsolute(file) ? path.join(cwd, file) : file);
};

let fs: typeof import('fs');
const defaultLoadFile = (id: string) => {
  if (!fs) {
    const name = 'fs';
    fs = require(name);
  }

  return fs.readFileSync(id, 'utf8');
};

const DEFAULTS = {
  cwd: process.cwd(),
  map: false,

  dupewarn: true,
  exportValues: true,
  loadFile: defaultLoadFile,
  postcss: {},
  resolvers: [],
  rewrite: true,
  verbose: false,
};

class Processor {
  private log: (...args: any[]) => void;

  private loadFile: any;

  resolve: (src: string, file: string) => string;

  normalize: (path: string) => string;

  options: any;

  readonly files = new Map<string, ProcessingFile>();

  readonly graph = new Graph<string>();

  private ids = new Map<any, any>();

  private before: postcss.Processor;

  private process: postcss.Processor;

  constructor(opts = {}) {
    /* eslint max-statements: [ "warn", 25 ] */
    const options: any = {
      ...DEFAULTS,
      ...opts,
    };

    this.options = options;

    if (!path.isAbsolute(options.cwd)) {
      options.cwd = path.resolve(options.cwd);
    }

    if (typeof options.namer !== 'function') {
      options.namer = (file: string, selector: string) =>
        `mc${slug(relative(options.cwd, file))}_${selector}`;
    }

    this.log = options.verbose
      ? // eslint-disable-next-line no-console
        console.log.bind(console, '[processor]')
      : // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {};

    this.loadFile = options.loadFile;

    this.resolve = (from: string, to: string) => {
      return path.join(path.dirname(from), to);
    };

    this.normalize = normalizePath.bind(null, options.cwd);

    this.before = postcss([require('./plugins/dependency-graph').default]);

    this.process = postcss([
      require('./plugins/at-from').default,
      require('./plugins/value-processing').default,
      // require('./plugins/at-export').default,
    ]);
  }

  private postcssOptions(args: any) {
    const { options, graph, resolve } = this;
    const modules = new Map<string, Module>();

    this.files.forEach((value, key) => {
      modules.set(key, value.module);
    });

    return {
      ...options,
      ...options.postcss,
      from: null,
      modules,
      graph,
      resolve,
      parser: require('./parsers/postcss').default,
      ...args,
    };
  }

  async file(file: string) {
    const id = this.normalize(file);

    this.log('file()', id);

    const text = await this.loadFile(id);

    return this._add(id, text);
  }

  // Add a file by name + contents to the dependency graph
  string(file: string, text: string) {
    const id = this.normalize(file);

    this.log('string()', id);

    return this._add(id, text);
  }

  // Add an existing postcss Root object by name
  root(file: string, root: postcss.Root) {
    const id = this.normalize(file);

    this.log('root()', id);

    return this._add(id, root);
  }

  // Check if a file exists in the currently-processed set
  has(input: string) {
    return this.files.has(this.normalize(input));
  }

  // Mark a file and everything that depends on it as invalid so
  // it can be overwritten
  invalidate(input: string) {
    if (!input) {
      throw new Error('invalidate() requires a file argument');
    }

    // Only want files actually in the array
    const source = this.normalize(input);

    if (!this.graph.hasNode(source)) {
      throw new Error(`Unknown file: ${input}`);
    }

    const deps = this.dependents(source);

    [...deps, source].forEach((file) => {
      this.log('invalidate()', file);

      this.files.get(file)!.valid = false;

      this.ids.delete(file.toLowerCase());
    });
  }

  // Get the dependency order for a file or the entire tree
  dependencies(file: string, options: { leavesOnly?: boolean } = {}) {
    const { leavesOnly } = options;

    if (file) {
      const id = this.normalize(file);

      return this.graph.dependenciesOf(id, leavesOnly);
    }

    return this.graph.overallOrder(leavesOnly);
  }

  // Get the dependant files for a file
  dependents(file: string, options: { leavesOnly?: boolean } = {}) {
    if (!file) {
      throw new Error('Must provide a file to processor.dependants()');
    }

    const id = this.normalize(file);
    const { leavesOnly } = options;

    return this.graph.dependantsOf(id, leavesOnly);
  }

  // Get the ultimate output for specific files or the entire tree
  // async output(args: { to?: string; files?: string[] } = {}) {
  //   let files = args.files ?? tiered(this.graph);

  //   // Throw normalize values into a Set to remove dupes
  //   files = Array.from(new Set(files.map(this.normalize)));

  //   // Verify that all requested files have been fully processed & succeeded
  //   // See
  //   //  - https://github.com/tivac/modular-css/issues/248
  //   //  - https://github.com/tivac/modular-css/issues/324
  //   await Promise.all(
  //     files.map((file) => {
  //       if (!this.files[file]) {
  //         throw new Error(`Unknown file requested: ${file}`);
  //       }

  //       return this.files[file].result;
  //     }),
  //   );

  //   // Rewrite relative URLs before adding
  //   // Have to do this every time because target file might be different!
  //   const results = [];

  //   for (const dep of files) {
  //     this.log('after()', dep);

  //     const result = await this.after.process(
  //       // NOTE: the call to .clone() is really important here, otherwise this call
  //       // modifies the .result root itself and you process URLs multiple times
  //       // See https://github.com/tivac/modular-css/issues/35
  //       this.files.get(dep)!.result.root.clone(),

  //       params(this, {
  //         from: dep,
  //         to: args.to,
  //       }),
  //     );

  //     results.push(result);
  //   }

  //   // Clone the first result if available to get valid source information
  //   const root = results.length ? results[0].root!.clone() : postcss.root();

  //   // Then destroy all its children before adding new ones
  //   root.removeAll();

  //   results.forEach((result) => {
  //     // Add file path comment
  //     const comment = postcss.comment({
  //       text: relative(this.options.cwd, result.opts!.from!),

  //       // Add a bogus-ish source property so postcss won't make weird-looking
  //       // source-maps that break the visualizer
  //       //
  //       // https://github.com/postcss/postcss/releases/tag/5.1.0
  //       // https://github.com/postcss/postcss/pull/761
  //       // https://github.com/tivac/modular-css/pull/157
  //       //
  //       // @ts-ignore
  //       source: {
  //         __proto__: null,

  //         ...result.root!.source,
  //         end: result.root!.source!.start,
  //       },
  //     });

  //     root.append([comment, ...result.root!.nodes!]);

  //     const idx = root.index(comment);

  //     // Need to manually insert a newline after the comment, but can only
  //     // do that via whatever comes after it for some reason?
  //     // I'm not clear why comment nodes lack a `.raws.after` property
  //     //
  //     // https://github.com/postcss/postcss/issues/44
  //     if (root.nodes![idx + 1]) {
  //       root.nodes![idx + 1].raws.before = '\n';
  //     }
  //   });

  //   const result = await this.done.process(root, params(this, args));

  //   // Object.defineProperty(result, 'compositions', {
  //   //   get: () => output.compositions(this),
  //   // });

  //   return result;
  // }

  // // Return all the compositions for the files loaded into the processor instance
  // get compositions() {
  //   // Ensure all files are fully-processed first
  //   return Promise.all(
  //     Object.values(this.files).map(({ result }) => result),
  //   ).then(() => output.compositions(this));
  // }

  // Take a file id and some text, walk it for dependencies, then
  // process and return details

  private async _add(id: string, src: string | postcss.Root): Promise<File> {
    const check = id.toLowerCase();

    // Warn about potential dupes if an ID goes past we've seen before
    if (this.options.dupewarn) {
      const other = this.ids.get(check);

      if (other && other !== id) {
        // eslint-disable-next-line no-console
        console.warn(
          `POTENTIAL DUPLICATE FILES:\n\t${relative(
            this.options.cwd,
            other,
          )}\n\t${relative(this.options.cwd, id)}`,
        );
      }
    }

    this.ids.set(check, id);

    this.log('_add()', id);

    await this._walk(id, src);

    const deps = [...this.graph.dependenciesOf(id), id];

    for (const dep of deps) {
      const file = this.files.get(dep)!;

      if (!file.processed) {
        this.log('process()', dep);

        file.processed = this.process.process(
          file.before,
          this.postcssOptions({
            from: dep,
            namer: this.options.namer,
          }),
        );
      }

      file.result = await file.processed;
    }

    const { module, text, result, valid } = this.files.get(id)!;

    const values: Record<string, string> = {};
    const selectors: Record<string, string[]> = {};

    module.exports.forEach((member, key) => {
      if (member.type === 'class')
        selectors[key] = [
          String(member.selector.name),
          ...member.composes.map((c) => String(c.name)),
        ];
      else if (member.type === 'variable') {
        values[key] = String(member.node);
      }
    });

    return {
      text,
      module,
      valid,
      values,
      selectors,
      result: result!,
    };
  }

  // Process files and walk their composition/value dependency tree to find
  // new files we need to process
  async _walk(name: string, src: string | postcss.Root) {
    // No need to re-process files unless they've been marked invalid
    if (this.files.get(name)?.valid) {
      // Do want to wait until they're done being processed though
      await this.files.get(name)!.walked;

      return;
    }

    this.graph.addNode(name, '');

    this.log('before()', name);

    let walked: () => void;

    const file: ProcessingFile = {
      // @ts-ignore
      text: typeof src === 'string' ? src : src.source!.input.css,
      valid: true,
      module: {
        scope: new Scope(),
        exports: new ModuleMembers(),
      },
      before: this.before.process(src, this.postcssOptions({ from: name })),
      walked: new Promise((done) => {
        walked = done;
      }),
    };

    this.files.set(name, file);

    await file.before;

    // Add all the found dependencies to the graph
    file.before.messages.forEach(({ plugin, dependency }) => {
      if (plugin !== 'modular-css-graph-nodes') {
        return;
      }

      const dep = this.normalize(dependency);

      this.graph.addNode(dep, '');
      this.graph.addDependency(name, dep);
    });

    // Walk this node's dependencies, reading new files from disk as necessary
    await Promise.all(
      this.graph.dependenciesOf(name).map(async (dependency) => {
        const dep = this.files.get(dependency);

        await (dep?.valid ? dep.walked : this.file(dependency));
      }),
    );

    // Mark the walk of this file & its dependencies complete
    walked!();
  }
}

export default Processor;
