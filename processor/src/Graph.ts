/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import postcss, { CssSyntaxError, Root as PostCSSRoot } from 'postcss';
// @ts-ignore
import slug from 'unique-slug';

import { Root } from './Ast';
import { JazzFile, ProcessingFile, ScriptFile } from './File2';
import ModuleMembers from './ModuleMembers';
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

export type Options = {
  cwd: string;
  map: boolean;
  dupewarn: boolean;
  resolvers: Resolver[] | Array<Resolver | AsyncResolver>;
  icssCompatible: boolean;
  postcssPlugins?: any[];
  namer: (file: string, selector: string) => string;
  verbose: boolean;
};

const DEFAULTS = {
  cwd: process.cwd(),
  map: false,

  dupewarn: true,
  icssCompatible: false,

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

    this.resolver = mergeResolvers(this.options.resolvers, this.options.cwd);

    this.normalize = normalizePath.bind(null, options.cwd);
  }

  async add(_id: string, content?: string | Root): Promise<void> {
    const id = this.normalize(_id);

    this.log('_add()', id);

    await this.walk(id, content);

    const deps = [...this.graph.dependenciesOf(id), id];

    for (const dep of deps) {
      this.files.get(dep)!.process(this.files);
    }
  }

  // Process files and walk their composition/value dependency tree to find
  // new files we need to process
  private async walk(name: string, content?: string | Root) {
    // No need to re-process files unless they've been marked invalid
    if (this.files.get(name)?.valid) {
      // Do want to wait until they're done being processed though
      await this.files.get(name)!.ready;

      return;
    }

    this.graph.addNode(name, { file: name, content });

    const file = isStyleFile(name)
      ? new JazzFile({
          id: name,
          content: content!,
          namer: this.options.namer,
          resolver: this.resolver,
          plugins: this.options.postcssPlugins,
        })
      : new ScriptFile(name, content as string);

    this.files.set(name, file);

    for (const dep of await file.collectDependencies()) {
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

  // Get the ultimate output for specific files or the entire tree
  output(args: { to?: string; files?: string[] } = {}) {
    let { files } = args;

    if (!files) {
      files = graphTiers(this.graph);
    }

    // Throw normalize values into a Set to remove dupes
    files = Array.from(new Set(files));

    // Rewrite relative URLs before adding
    // Have to do this every time because target file might be different!
    const results = [] as ProcessingFile<Root>[];

    for (const dep of files) {
      const file = this.files.get(dep)!;
      if (file.module.type !== 'jazzscript') results.push(file);
    }

    // Clone the first result if available to get valid source information
    const root: PostCSSRoot = results.length
      ? (results[0].result!.clone() as any)
      : postcss.root();

    // Then destroy all its children before adding new ones
    root.removeAll();

    results.forEach(({ result, id }) => {
      // Add file path comment
      const comment = postcss.comment({
        text: relative(this.options.cwd, id),

        // Add a bogus-ish source property so postcss won't make weird-looking
        // source-maps that break the visualizer
        //
        // https://github.com/postcss/postcss/releases/tag/5.1.0
        // https://github.com/postcss/postcss/pull/761
        // https://github.com/tivac/modular-css/pull/157
        //
        // @ts-ignore
        source: {
          ...result!.source,
          end: result!.source!.start,
        },
      });

      root.append([comment, ...root!.nodes!]);

      const idx = root.index(comment as any);

      // Need to manually insert a newline after the comment, but can only
      // do that via whatever comes after it for some reason?
      // I'm not clear why comment nodes lack a `.raws.after` property
      //
      // https://github.com/postcss/postcss/issues/44
      if (root.nodes![idx + 1]) {
        root.nodes![idx + 1].raws.before = '\n';
      }
    });

    return root;
  }
}

export default Processor;
