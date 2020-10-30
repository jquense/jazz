/* eslint-disable require-await */

import _Module from 'module';
import path from 'path';

import postcss, { LazyResult, Result, Root } from 'postcss';

import ModuleMembers from './ModuleMembers';
import Scope from './Scope';
import { getMembers } from './modules';
import postcssParser from './parsers/postcss';
import depGraphPlugin from './plugins/dependency-graph';
import valuePlugin from './plugins/value-processing';
import type {
  ModularCSSOpts,
  Module,
  ModuleType,
  ResolvedResource,
} from './types';
import { inferEvaluationScope, inferIdenifierScope } from './utils/Scoping';

type Processor = import('./Processor').default;

let fs: typeof import('fs');
const loadFile = (id: string) => {
  if (!fs) {
    const name = 'fs';
    fs = require(name);
  }

  return fs.readFileSync(id, 'utf8');
};

export abstract class ProcessingFile<TOut = any> {
  // abstract readonly text: string;

  valid = true;

  complete!: () => void;

  readonly ready: Promise<void>;

  readonly module: Module;

  abstract result?: TOut;

  abstract collectDependencies(): Promise<ResolvedResource[]>;

  abstract process(): Promise<void>;

  readonly requests: Map<string, string> = new Map();

  constructor(type: ModuleType) {
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

const collectDependencies = postcss([depGraphPlugin]);

const cssProcessor = postcss([valuePlugin]);

// export class CssFile extends ProcessingFile<Result> {
//   before();
// }

export class JazzFile extends ProcessingFile<Result> {
  private before?: LazyResult;

  private processed?: LazyResult;

  result?: Result;

  private content: string | postcss.Root;

  constructor(
    private id: string,
    content: string | Root | undefined,
    private processor: Processor,
  ) {
    super('jazzcss');

    this.content = content || loadFile(id);
  }

  get text(): string {
    return typeof this.content === 'string'
      ? this.content
      : // @ts-ignore
        this.content.source!.input.css;
  }

  async collectDependencies() {
    this.before = collectDependencies.process(
      this.content!,
      this.postcssOptions({
        from: this.id,
        // @ts-expect-error resolve allows async in before
        resolve: (url) =>
          this.processor.resolver(url, {
            from: this.id,
            cwd: this.processor.options.cwd,
          }),
      }),
    );

    await this.before;

    const dependencies: ResolvedResource[] = [];
    // Add all the found dependencies to the graph
    this.before.messages.forEach(({ plugin, dependency, request }) => {
      if (plugin !== 'jazz-dependencies') {
        return;
      }

      this.requests.set(request, this.processor.normalize(dependency.file));

      dependencies.push(dependency);
    });

    return dependencies;
  }

  async process(): Promise<void> {
    if (this.result) return;

    if (!this.processed)
      this.processed = cssProcessor.process(
        this.before!,
        this.postcssOptions({
          from: this.id,
          namer: this.processor.options.namer,
        }),
      );

    this.result = await this.processed;
  }

  private postcssOptions({
    from,
    ...args
  }: { from: string } & Partial<ModularCSSOpts>) {
    const { options, graph, files } = this.processor;
    const modules = new Map<string, Module>();

    files.forEach((value, key) => {
      modules.set(key, value.module);
    });

    return {
      ...options,
      from,
      modules,
      moduleGraph: graph,
      identifierScope: inferIdenifierScope(from),
      evaluationContext: inferEvaluationScope(from),
      parser: postcssParser,
      resolve: (url: string) => {
        return this.requests.get(url);
      },
      ...args,
    };
  }
}

export class ScriptFile extends ProcessingFile<Record<string, unknown>> {
  result?: Record<string, unknown>;

  private m: _Module;

  private content: string;

  constructor(
    private id: string,
    content: string | undefined,
    private processor: Processor,
  ) {
    super('jazzscript');

    this.content = content || loadFile(id);
    this.m = new _Module(id, module);
    // @ts-ignore
    this.m.paths = _Module._nodeModulePaths(path.dirname(id));
    this.m.filename = id;
  }

  collectDependencies() {
    // this.content = this.processor.loadFile();
    return Promise.resolve([]);
  }

  async process(): Promise<void> {
    if (this.result) return;
    // @ts-ignore
    this.m._compile(this.content, this.id);
    this.module.exports = getMembers(this.m.exports);

    this.result = this.m.exports;
  }
}

// export class TypeScriptFile extends ScriptFile {
//   constructor(
//     private id: string,
//     private content: string,
//     private processor: Processor,
//   ) {
//     super('jazzscript');

//     this.text = content;

//     this.m = new _Module(id, module);
//     // @ts-ignore
//     this.m.paths = _Module._nodeModulePaths(path.dirname(id));
//     this.m.filename = id;
//   }

//   collectDependencies() {
//     return Promise.resolve([]);
//   }

//   async process(): Promise<void> {
//     if (this.result) return;
//     // @ts-ignore
//     this.m._compile(this.content, this.id);
//     this.module.exports = getMembers(this.m.exports);

//     this.result = this.m.exports;
//   }
// }

// export function createFile(processor: Processor, id: string) {}

// class FileManager extends Map<string, ProcessingFile> {
//   constructor() {
//     super();
//   }

//   load(id: string): ProcessingFile
// }
