/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import postcss, { CssSyntaxError } from 'postcss';

// @ts-ignore
import slug from 'unique-slug';

import ModuleMembers from './ModuleMembers';
import Scope from './Scope';
import mergeResolvers from './resolvers';
import type {
  File,
  ModularCSSOpts,
  Module,
  ProcessingFile,
  Resolver,
  AsyncResolver,
} from './types';
import { inferEvaluationScope, inferIdenifierScope } from './utils/Scoping';
import graphTiers from './utils/graph-tiers';

const sepRegex = /\\/g;

export type { File, Module, ProcessingFile, Resolver, CssSyntaxError };

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

export type Options = {
  cwd: string;
  map: boolean;
  dupewarn: boolean;
  // postcss: Record<string, unknown>;
  resolvers: Resolver[] | Array<Resolver | AsyncResolver>;
  icssCompatible: boolean;
  loadFile: (id: string) => string | Promise<string>;
  namer: (file: string, selector: string) => string;
  verbose: boolean;
};

const DEFAULTS = {
  cwd: process.cwd(),
  map: false,

  dupewarn: true,
  icssCompatible: false,
  loadFile: defaultLoadFile,

  namer: () => ``,
  // postcss: {},
  resolvers: [],
  rewrite: true,
  verbose: false,
};

class Processor {
  private log: (...args: any[]) => void;

  private loadFile: any;

  normalize: (path: string) => string;

  options: Options;

  readonly files = new Map<string, ProcessingFile>();

  readonly resolvedRequests = new Map<string, string>();

  readonly graph = new Graph<string>();

  private ids = new Map<any, any>();

  private before: postcss.Processor;

  private process: postcss.Processor;

  private resolver: AsyncResolver;

  constructor(opts: Partial<Options> = {}) {
    /* eslint max-statements: [ "warn", 25 ] */
    const options: Options = {
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

    this.resolver = mergeResolvers(options.resolvers);

    this.normalize = normalizePath.bind(null, options.cwd);

    this.before = postcss([require('./plugins/dependency-graph').default]);

    this.process = postcss([require('./plugins/value-processing').default]);
  }

  private postcssOptions({
    from,
    ...args
  }: { from: string } & Partial<ModularCSSOpts>) {
    const { options, graph } = this;
    const modules = new Map<string, Module>();

    this.files.forEach((value, key) => {
      modules.set(key, value.module);
    });

    return {
      ...options,
      from,
      modules,
      moduleGraph: graph,
      identiferScope: inferIdenifierScope(from),
      evaluationContext: inferEvaluationScope(from),
      parser: require('./parsers/postcss').default,
      resolve: (url: string) => {
        const file = this.files.get(from);
        return file?.requests.get(url);
      },
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
  async output(args: { to?: string } = {}) {
    let files = graphTiers(this.graph);

    // Throw normalize values into a Set to remove dupes
    files = Array.from(new Set(files));

    // Verify that all requested files have been fully processed & succeeded
    // See
    //  - https://github.com/tivac/modular-css/issues/248
    //  - https://github.com/tivac/modular-css/issues/324
    await Promise.all(
      files.map((file) => {
        if (!this.files.has(file)) {
          throw new Error(`Unknown file requested: ${file}`);
        }

        return this.files.get(file)!.result;
      }),
    );

    // Rewrite relative URLs before adding
    // Have to do this every time because target file might be different!
    const results = [];

    for (const dep of files) {
      results.push(this.files.get(dep)!.result!);
    }

    // Clone the first result if available to get valid source information
    const root = results.length ? results[0].root!.clone() : postcss.root();

    // Then destroy all its children before adding new ones
    root.removeAll();

    results.forEach((result) => {
      // Add file path comment
      const comment = postcss.comment({
        text: relative(this.options.cwd, result.opts!.from!),

        // Add a bogus-ish source property so postcss won't make weird-looking
        // source-maps that break the visualizer
        //
        // https://github.com/postcss/postcss/releases/tag/5.1.0
        // https://github.com/postcss/postcss/pull/761
        // https://github.com/tivac/modular-css/pull/157
        //
        // @ts-ignore
        source: {
          ...result.root!.source,
          end: result.root!.source!.start,
        },
      });

      root.append([comment, ...result.root!.nodes!]);

      const idx = root.index(comment);

      // Need to manually insert a newline after the comment, but can only
      // do that via whatever comes after it for some reason?
      // I'm not clear why comment nodes lack a `.raws.after` property
      //
      // https://github.com/postcss/postcss/issues/44
      if (root.nodes![idx + 1]) {
        root.nodes![idx + 1].raws.before = '\n';
      }
    });

    const result = await postcss([() => true]).process(root, {
      from: '', // FIXME
      ...args,
    });

    Object.defineProperty(result, 'exports', {
      get: () => {
        const json: Record<string, Record<string, string>> = {};
        this.files.forEach(({ module }, key) => {
          json[relative(this.options.cwd, key)] = module.exports.toJSON();
        });
      },
    });

    return result as postcss.Result & {
      exports: Record<string, Record<string, string>>;
    };
  }

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

    module.exports.forEach((member) => {
      if (member.type === 'class')
        selectors[member.identifier] = [
          String(member.selector.name),
          ...member.composes.map((c) => String(c.name)),
        ];
      else if (member.type === 'variable') {
        values[member.identifier] = String(member.node);
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
      requests: new Map<string, string>(),
      before: this.before.process(
        src,
        this.postcssOptions({
          from: name,
          // @ts-expect-error resolve allows async in before
          resolve: (url) =>
            this.resolver(url, { from: name, cwd: this.options.cwd }),
        }),
      ),
      walked: new Promise((done) => {
        walked = done;
      }),
    };

    this.files.set(name, file);

    await file.before;

    // Add all the found dependencies to the graph
    file.before.messages.forEach(({ plugin, dependency, request }) => {
      if (plugin !== 'modular-css-graph-nodes') {
        return;
      }

      const dep = this.normalize(dependency);

      file.requests.set(request, dep);
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
