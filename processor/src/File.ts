/* eslint-disable require-await */

import _Module from 'module';
import path from 'path';

import postcss, { Plugin } from 'postcss';

import { Root } from './Ast';
import Evaluator from './Evaluate';
import ModuleMembers from './ModuleMembers';
import Scope from './Scope';
import { getMembers } from './modules';
import Parser from './parsers';
import postcssParser from './parsers/jazz-postcss';
import { walkTree } from './plugins/dependency-graph';
import { defaultNamer } from './plugins/value-processing';
import type {
  AsyncResolver,
  Module,
  ModuleType,
  ResolvedResource,
} from './types';
import {
  IdentifierScope,
  inferIdentifierScope,
  inferModuleType,
} from './utils/Scoping';

let fs: typeof import('fs');
const loadFile = (id: string) => {
  if (!fs) {
    const name = 'fs';
    fs = require(name);
  }

  return fs.readFileSync(id, 'utf8');
};

export abstract class ProcessingFile<TOut = any> {
  readonly id: string;

  valid = true;

  complete!: () => void;

  readonly ready: Promise<void>;

  readonly module: Module;

  abstract result?: TOut;

  abstract collectDependencies(...args: any[]): Promise<ResolvedResource[]>;

  abstract process(files: Map<string, ProcessingFile>): void;

  readonly requests: Map<string, string> = new Map();

  get type() {
    return this.module.type;
  }

  constructor(id: string, type: ModuleType = inferModuleType(id)) {
    this.id = id;
    this.module = {
      type,
      scope: new Scope(),
      exports: new ModuleMembers(),
    };

    this.ready = new Promise((done) => {
      this.complete = done;
    });
  }
}

interface JazzFileOptions {
  id: string;
  content: Root | string;
  trace?: boolean;
  resolver: AsyncResolver;
  namer?: (file: string, selector: string) => string;
  plugins?: Plugin[];
}

export class JazzFile extends ProcessingFile<Root> {
  result?: Root;

  private content: Root | null = null;

  private identifierScope: IdentifierScope;

  private namer: (selector: string) => string;

  private trace: any;

  private resolve: AsyncResolver;

  private pendingContent: Promise<Root> | Root;

  constructor(options: JazzFileOptions) {
    super(options.id);

    this.trace = options.trace;
    this.resolve = options.resolver;
    this.namer = (selector: string) => {
      return (options.namer || defaultNamer)(options.id, selector);
    };
    this.identifierScope = inferIdentifierScope(options.id);
    this.pendingContent = this.loadContent(options);
  }

  loadContent(options: JazzFileOptions) {
    return typeof options.content === 'string'
      ? postcss(options.plugins || [])
          .process(options.content, {
            from: this.id,
            parser: postcssParser as any,
          })
          .then((r: any) => r.root)
      : options.content;
  }

  async collectDependencies() {
    const messages = [] as any[];
    this.content = await this.pendingContent;

    await walkTree(this.content, messages, {
      type: this.type,
      from: this.id,
      resolve: (url) => this.resolve(url, { from: this.id, cwd: 'xxx' }),
    });

    const dependencies: ResolvedResource[] = [];
    // Add all the found dependencies to the graph
    messages.forEach(({ plugin, dependency, request }) => {
      if (plugin !== 'jazz-dependencies') {
        return;
      }

      this.requests.set(request, dependency.file);

      dependencies.push(dependency);
    });

    return dependencies;
  }

  process(files: Map<string, ProcessingFile>): void {
    if (this.result) return;

    const parser = Parser.get(this.content!, { trace: this.trace });
    const { module } = this;

    const { exports, icss } = Evaluator.evaluate(this.content!, {
      isCss: module.type === 'css',
      namer: this.namer,
      loadModule: (request: string) => {
        const resolved = this.requests.get(request) || false;

        return {
          module: resolved ? files.get(resolved)!.module : undefined,
          // FIXME: this is weird here, if it's absolute tho tests are hard
          resolved, // && path.relative(path.dirname(from), resolved),
        };
      },
      initialScope: module.scope,
      identifierScope: this.identifierScope,
      parser,
    });

    module.icss = icss;
    module.exports.addAll(exports);

    this.result = this.content!;
  }
}

export class ScriptFile extends ProcessingFile<Record<string, unknown>> {
  result?: Record<string, unknown>;

  private m: _Module;

  private content: string;

  constructor(id: string, content: string | undefined) {
    super(id, 'jazzscript');

    this.content = content || loadFile(id);
    this.m = new _Module(id, module);
    // @ts-ignore
    this.m.paths = _Module._nodeModulePaths(path.dirname(id));
    this.m.filename = id;
  }

  collectDependencies() {
    return Promise.resolve([]);
  }

  process(): void {
    if (this.result) return;
    // @ts-ignore
    this.m._compile(this.content, this.id);
    this.module.exports = getMembers(this.m.exports);

    this.result = this.m.exports;
  }
}
