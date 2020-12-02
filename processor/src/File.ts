/* eslint-disable require-await */

import _Module from 'module';
import path from 'path';

import postcss, { LazyResult, Result, Root } from 'postcss';

import ModuleMembers from './ModuleMembers';
import Scope from './Scope';
import { getMembers } from './modules';
import postcssParser from './parsers/jazz-postcss';
import depGraphPlugin from './plugins/dependency-graph';
import valuePlugin from './plugins/value-processing';
import type {
  ModularCSSOpts,
  Module,
  ModuleType,
  ResolvedResource,
} from './types';
import { inferIdentifierScope, inferModuleType } from './utils/Scoping';

// const directDependencies = (id: string, graph: any): string[] => {
//   return (graph as any).outgoingEdges[id];
// };

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
  readonly id: string;

  valid = true;

  complete!: () => void;

  readonly ready: Promise<void>;

  readonly module: Module;

  abstract result?: TOut;

  abstract collectDependencies(): Promise<ResolvedResource[]>;

  abstract process(): Promise<void>;

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

const collectDependencies = postcss([depGraphPlugin]);

interface JazzFileOptions {
  id: string;
  content: string | Root | undefined;
  processor: Processor;
  plugins?: any[];
}

export class JazzFile extends ProcessingFile<Result> {
  private before?: LazyResult;

  private processed?: LazyResult;

  result?: Result;

  private processor: Processor;

  private content: string | Root;

  private dependencies?: ResolvedResource[];

  private _icssResult: any;

  private cssProcessor: ReturnType<typeof postcss>;

  constructor(options: JazzFileOptions) {
    super(options.id);

    this.content = options.content || loadFile(options.id);
    this.processor = options.processor;

    this.cssProcessor = postcss([...(options.plugins || []), valuePlugin]);
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
      }) as any,
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

    this.dependencies = dependencies;

    return dependencies;
  }

  async process(): Promise<void> {
    if (this.result) return;

    if (!this.processed)
      this.processed = this.cssProcessor.process(
        this.before!,
        this.postcssOptions({
          from: this.id,
          namer: this.processor.options.namer,
        }) as any,
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

    const identifierScope = inferIdentifierScope(from);

    return {
      ...options,
      from,
      modules,
      moduleGraph: graph,
      icssCompatible: false,
      identifierScope,
      parser: postcssParser,
      resolve: (url: string) => {
        return this.requests.get(url);
      },
      ...args,
    };
  }

  toICSS() {
    if (!this._icssResult) {
      this._icssResult = postcss([
        {
          postcssPlugin: 'jazz-icss-output',
          Once: (root) => {
            for (const dep of this.dependencies!) {
              root.prepend(
                postcss.atRule({
                  name: 'icss-import',
                  params: `"${path.relative(
                    path.dirname(this.id),
                    dep.file,
                  )}"`,
                  // nodes: [postcss.decl({ prop: '____a', value: 'a' })],
                }),
              );
            }

            const entries = Object.entries(this.module.exports.toJSON());
            if (entries.length) {
              const exportNode: any = postcss.atRule({
                name: 'icss-export',
                nodes: entries.map(([prop, value]) =>
                  postcss.decl({ prop, value }),
                ),
              });
              root.append(exportNode);
            }
          },
        },
      ]).process(this.result!, { from: this.id });
    }

    return this._icssResult;
  }
}

export class ScriptFile extends ProcessingFile<Record<string, unknown>> {
  result?: Record<string, unknown>;

  private m: _Module;

  private content: string;

  constructor(
    id: string,
    content: string | undefined,
    private processor: Processor,
  ) {
    super(id, 'jazzscript');

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
