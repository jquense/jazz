/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import mapValues from 'lodash/mapValues';
import postcss from 'postcss';
import slug from 'unique-slug';

// import tiered from './graph-tiers';

// const tiered = require('./lib/graph-tiers.js');
// const message = require('./lib/message.js');
// const normalize = require('./lib/normalize.js');
// const output = require('./lib/output.js');
// const relative = require('./lib/relative.js');
// const { resolvers } = require('./lib/resolve.js');

const sepRegex = /\\/g;

// Get a relative version of an absolute path w/ cross-platform/URL-friendly
// directory separators
const relative = (cwd: string, file: string) =>
  path.relative(cwd, file).replace(sepRegex, '/');

const normalizePath = (cwd: string, file: string) => {
  return path.normalize(!path.isAbsolute(file) ? path.join(cwd, file) : file);
};

let fs: typeof import('fs');

const noop = () => true;

const defaultLoadFile = (id: string) => {
  if (!fs) {
    const name = 'fs';

    fs = require(name);
  }

  return fs.readFileSync(id, 'utf8');
};

const params = ({ options, files, graph, resolve }: Processor, args) => ({
  __proto__: null,
  ...options,
  ...options.postcss,
  from: null,
  files,
  graph,
  resolve,
  ...args,
});

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

interface File {
  text: string;
  exports: boolean;
  values: boolean;
  valid: boolean;
  before: postcss.LazyResult;
  processed?: postcss.LazyResult;
  result?: postcss.Result;
  walked: Promise<void>;
}

class Processor {
  private log: (...args: any[]) => void;

  private _options: any;

  private loadFile: any;

  resolve: (src: string, file: string) => string;

  _normalize: (path: string) => string;

  options: any;

  files: Map<string, File>;

  graph: Graph<string>;

  private ids: Map<any, any>;

  private before: postcss.Processor;

  private process: postcss.Processor;

  private after: postcss.Processor;

  private done: postcss.Processor;

  constructor(opts = {}) {
    /* eslint max-statements: [ "warn", 25 ] */
    const options: any = {
      __proto__: null,
      ...DEFAULTS,
      ...opts,
    };

    this.options = options;

    if (!path.isAbsolute(options.cwd)) {
      options.cwd = path.resolve(options.cwd);
    }

    if (typeof options.namer === 'string') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      options.namer = require(options.namer)();
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

    this.resolve = resolvers(options.resolvers);

    this._normalize = normalizePath.bind(null, this._options.cwd);

    this.files = Object.create(null);
    this.graph = new Graph<string>();
    this.ids = new Map();

    this.before = postcss([
      ...(options.before || []),
      require('./plugins/before/values-local.js'),
      require('./plugins/values-replace.js'),
      require('./plugins/before/graph-nodes.js'),
    ]);

    this.process = postcss([
      require('./plugins/at-composes.js'),
      require('./plugins/values-import.js'),
      require('./plugins/values-replace.js'),
      require('./plugins/scoping.js'),
      require('./plugins/externals.js'),
      require('./plugins/composition.js'),
      require('./plugins/keyframes.js'),
      ...(options.processing || []),
    ]);

    this.after = postcss(options.after || [noop]);

    // Add postcss-url to the afters if requested
    if (options.rewrite) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.after.use(require('postcss-url')(options.rewrite));
    }

    this.done = postcss(options.done || [noop]);
  }

  // Add a file on disk to the dependency graph
  async file(file: string) {
    const id = this._normalize(file);

    this.log('file()', id);

    const text = await this.loadFile(id);

    return this._add(id, text);
  }

  // Add a file by name + contents to the dependency graph
  string(file: string, text: string) {
    const id = this._normalize(file);

    this.log('string()', id);

    return this._add(id, text);
  }

  // Add an existing postcss Root object by name
  root(file: string, root: postcss.Root) {
    const id = this._normalize(file);

    this.log('root()', id);

    return this._add(id, root);
  }

  // Remove a file from the dependency graph
  remove(input: string | string[]) {
    // Only want files actually in the array
    const files = (Array.isArray(input) ? input : [input])
      .map(this._normalize)
      .filter((file) => this.graph.hasNode(file));

    if (!files.length) {
      return files;
    }

    for (const file of files) {
      this.files.delete(file);
      this.graph.removeNode(file);
      this.log('remove()', file);
    }

    return files;
  }

  // Return the corrected-path version of the file
  normalize(file: string) {
    return this._normalize(file);
  }

  // Check if a file exists in the currently-processed set
  has(input: string) {
    const file = this._normalize(input);

    return file in this.files;
  }

  // Mark a file and everything that depends on it as invalid so
  // it can be overwritten
  invalidate(input: string) {
    if (!input) {
      throw new Error('invalidate() requires a file argument');
    }

    // Only want files actually in the array
    const source = this._normalize(input);

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
      const id = this._normalize(file);

      return this.graph.dependenciesOf(id, leavesOnly);
    }

    return this.graph.overallOrder(leavesOnly);
  }

  // Get the dependant files for a file
  dependents(file: string, options: { leavesOnly?: boolean } = {}) {
    if (!file) {
      throw new Error('Must provide a file to processor.dependants()');
    }

    const id = this._normalize(file);
    const { leavesOnly } = options;

    return this.graph.dependantsOf(id, leavesOnly);
  }

  // Get the ultimate output for specific files or the entire tree
  // async output(args: { to?: string; files?: string[] } = {}) {
  //   let files = args.files ?? tiered(this.graph);

  //   // Throw normalize values into a Set to remove dupes
  //   files = Array.from(new Set(files.map(this._normalize)));

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
  //       text: relative(this._options.cwd, result.opts!.from!),

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

  async _add(id: string, src: string | postcss.Root) {
    const check = id.toLowerCase();

    // Warn about potential dupes if an ID goes past we've seen before
    if (this._options.dupewarn) {
      const other = this.ids.get(check);

      if (other && other !== id) {
        // eslint-disable-next-line no-console
        console.warn(
          `POTENTIAL DUPLICATE FILES:\n\t${relative(
            this._options.cwd,
            other,
          )}\n\t${relative(this._options.cwd, id)}`,
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
          params(this, {
            from: dep,
            namer: this._options.namer,
          }),
        );
      }

      file.result = await file.processed;

      // const { result } = file;

      // file.exports = {
      //   __proto__: null,

      //   // optionally export @value entries
      //   ...(this._options.exportValues
      //     ? mapValues(file.values, ({ value }) => value)
      //     : null),

      //   // export classes
      //   ...message(result, 'classes'),

      //   // Export anything from plugins named "modular-css-export*"
      //   ...result.messages.reduce((out, { plugin, exports: exported }) => {
      //     if (!plugin || plugin.indexOf('modular-css-export') !== 0) {
      //       return out;
      //     }

      //     return Object.assign(out, exported);
      //   }, Object.create(null)),
      // };
    }

    return {
      id,
      file: id,
      files: this.files,
      details: this.files.get(id),
      // exports: this.files.get(id).exports,
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

    const file: File = {
      // @ts-ignore
      text: typeof src === 'string' ? src : src.source!.input.css,
      exports: false,
      values: false,
      valid: true,
      before: this.before.process(
        src,
        params(this, {
          from: name,
        }),
      ),
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

      const dep = this._normalize(dependency);

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

module.exports = Processor;
