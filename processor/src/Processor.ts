/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import postcss, { CssSyntaxError, ProcessOptions } from 'postcss';
// @ts-ignore
import slug from 'unique-slug';

import { JazzFile, ProcessingFile, ScriptFile } from './File';
import ModuleMembers, { Member } from './ModuleMembers';
import postcssParser from './parsers/jazz-postcss';
import mergeResolvers from './resolvers';
import type {
  AsyncResolver,
  File,
  Module,
  ModuleType,
  ResolvedResource,
  Resolver,
} from './types';
import { isStyleFile } from './utils/Scoping';
import graphTiers from './utils/graph-tiers';

const sepRegex = /\\/g;

export type {
  Module,
  File,
  ProcessingFile,
  Resolver,
  AsyncResolver,
  CssSyntaxError,
};

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

  // namer: () => ``,
  // postcss: {},
  resolvers: [],
  rewrite: true,
  verbose: false,
};

export type FileDependency = {
  type: ModuleType;
  id: string;
  exports: ModuleMembers;
};

class Processor {
  private log: (...args: any[]) => void;

  normalize: (path: string) => string;

  options: Options;

  readonly files = new Map<string, ProcessingFile>();

  readonly resolvedRequests = new Map<string, string>();

  readonly graph = new Graph<ResolvedResource>();

  private ids = new Map<any, any>();

  readonly resolver: AsyncResolver;

  constructor(opts: Partial<Options> = {}) {
    /* eslint max-statements: [ "warn", 25 ] */
    const options: Partial<Options> = {
      ...DEFAULTS,
      ...opts,
    };

    if (!path.isAbsolute(options.cwd!)) {
      options.cwd = path.resolve(options.cwd!);
    }

    if (typeof options.namer !== 'function') {
      options.namer = (file: string, selector: string) =>
        `jz${slug(relative(options.cwd!, file))}_${selector}`;
    }

    this.options = options as Options;

    this.log = options.verbose
      ? // eslint-disable-next-line no-console
        console.log.bind(console, '[processor]')
      : // eslint-disable-next-line @typescript-eslint/no-empty-function
        () => {};

    this.resolver = mergeResolvers(this.options.resolvers);

    this.normalize = normalizePath.bind(null, options.cwd);
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
  dependencies(
    file: string,
    options: { leavesOnly?: boolean } = {},
  ): string[] {
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
  async output(args: { to?: string; files?: string[] } = {}) {
    let { files } = args;

    if (!files) {
      files = graphTiers(this.graph);
    }

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
      const file = this.files.get(dep)!;
      if (file.module.type !== 'jazzscript') results.push(file.result!);
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
          if (module.type !== 'jazzscript')
            json[relative(this.options.cwd, key)] = module.exports.toJSON();
        });

        return json;
      },
    });

    return result as postcss.Result & {
      exports: Record<string, Record<string, string>>;
    };
  }

  async add(_id: string, content?: string): Promise<File> {
    const id = this.normalize(_id);

    // Warn about potential dupes if an ID goes past we've seen before
    const check = id.toLowerCase();
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

    await this.walk(id, content);

    const deps = [...this.graph.dependenciesOf(id), id];

    // XXX: promise.all() ?
    for (const dep of deps) {
      await this.files.get(dep)!.process();
    }

    const file = this.files.get(id)!;
    const { module, result, valid } = file;

    // const values: Record<string, string> = {};
    // const selectors: Record<string, string[]> = {};

    // module.exports.forEach((member) => {
    //   if (member.type === 'class')
    //     selectors[member.identifier] = [
    //       String(member.selector.name),
    //       ...member.composes.map((c) => String(c.name)),
    //     ];
    //   else if (member.type === 'variable') {
    //     values[member.identifier] = String(member.node);
    //   }
    // });
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const processor = this;

    const toJs = () => {
      // @ts-ignore
      const imports = this.graph.outgoingEdges[id];

      const exports = [] as string[];
      const grouped: Record<string, Member[]> = {};

      for (const member of module.exports.values()) {
        if (member.source) {
          grouped[member.source] = grouped[member.source] || [];
          grouped[member.source].push(member);
        }

        if (member.type === 'class') {
          const classes = [
            String(member.selector.name),
            ...member.composes.map((c) => String(c.name)),
          ].join(' ');
          exports.push(`const ${member.identifier} = '${classes}';\n`);
        } else if (member.type === 'variable') {
          exports.push(
            `const ${member.identifier} = ${member.node.toJSON()};\n`,
          );
        }
      }
    };

    return {
      type: module.type,
      module,
      valid,
      // values,
      // selectors,
      result: result!,
      toICSS() {
        return (file as JazzFile).toICSS();
      },
      get exports() {
        return module.exports.toJSON();
      },
      get imports() {
        // @ts-ignore
        return processor.graph.outgoingEdges[id].filter((dep) => {
          return processor.files.get(dep)!.module.type !== 'jazzscript';
        });
      },
    };
  }

  // Process files and walk their composition/value dependency tree to find
  // new files we need to process
  private async walk(name: string, content?: string) {
    // No need to re-process files unless they've been marked invalid
    if (this.files.get(name)?.valid) {
      // Do want to wait until they're done being processed though
      await this.files.get(name)!.ready;

      return;
    }

    const resource: ResolvedResource = { file: name, content };
    this.graph.addNode(name, resource);

    this.log('before()', name);

    const file = isStyleFile(name)
      ? new JazzFile(name, content, this)
      : new ScriptFile(name, content, this);

    this.files.set(name, file);

    const deps = await file.collectDependencies();

    for (const dep of deps) {
      this.graph.addNode(dep.file, dep);
      this.graph.addDependency(name, dep.file);
    }

    // Walk this node's dependencies, reading new files from disk as necessary
    await Promise.all(
      this.graph.dependenciesOf(name).map(async (dependency) => {
        const depData = this.graph.getNodeData(dependency);
        const dep = this.files.get(dependency);

        await (dep?.valid
          ? dep.ready
          : this.add(depData.file, depData.content));
      }),
    );

    // Mark the walk of this file & its dependencies complete
    file.complete();
  }
}

type ParseOptions = {
  filename?: string;
  map?: ProcessOptions['map'];
};

export function parse(content: string, { filename, map }: ParseOptions = {}) {
  return postcssParser(content, { from: filename, map });
}

export async function render(file: string, content?: string, opts?: Options) {
  const p = new Processor(opts);
  await p.add(file, content);

  return p.output();
}

export default Processor;
