/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */

import path from 'path';

import { DepGraph as Graph } from 'dependency-graph';
import postcss, { CssSyntaxError } from 'postcss';
// @ts-ignore
import slug from 'unique-slug';

import { JazzFile, ProcessingFile, ScriptFile } from './File';
import ModuleMembers, { Member } from './ModuleMembers';
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

  async add(_id: string, content?: string): Promise<void> {
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
      ? new JazzFile({
          id: name,
          content,
          processor: this,
          plugins: this.options.postcssPlugins,
        })
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

export default Processor;
