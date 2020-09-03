import type { LazyResult, ProcessOptions, Result, Root } from 'postcss';

import type ModuleMembers from './ModuleMembers';
// eslint-disable-next-line import/no-duplicates
import type Scope from './Scope';
import type { EvaluationScope, IdentifierScope } from './utils/Scoping';
import { DepGraph } from 'dependency-graph';

export type Keys<Obj, Exclude> = {
  [P in keyof Obj]: Obj[P] extends Exclude ? P : never;
}[keyof Obj];

export interface Value {
  name?: string;
  value: string;
  source?: string;
}

export interface Module {
  scope: Scope;
  exports: ModuleMembers;
}

export interface ProcessingFile {
  text: string;
  // values: Record<string, Value>;

  module: Module;

  valid: boolean;
  before: LazyResult;
  processed?: LazyResult;
  requests: Map<string, string>;
  result?: Result;
  walked: Promise<void>;
}

export interface File {
  text: string;
  module: Module;
  valid: boolean;
  result: Result;
  values: Record<string, string>;
  selectors: Record<string, string[]>;
}

export type PostcssProcessOptions = ProcessOptions & ModularCSSOpts;

export type PostcssPluginResult = Result & { opts: ModularCSSOpts };

export type PostcssPlugin = { postcssPlugin?: string } & ((
  root: Root,
  result: PostcssPluginResult,
) => Promise<any> | any);

export interface ModularCSSOpts {
  from: string;
  moduleGraph: DepGraph<string> & { outgoingEdges: Record<string, string[]> };
  resolve: (url: string) => string | false;
  source?: boolean;
  trace?: boolean;
  icssCompatible?: boolean;
  identifierScope: IdentifierScope;
  evaluationScope: EvaluationScope;
  namer?: (fileName: string, ident: string) => string;
  modules: Map<string, Module>;
}

export interface BeforeModularCSSOpts extends Omit<ModularCSSOpts, 'resolve'> {
  resolve: (url: string) => string | false | Promise<string | false>;
}

export type Variable = {
  name: string;
  value: string;
};

export type ResolverOptions = {
  cwd: string;
  from: string;
};

export type Resolver = (
  url: string,
  resolverOptions: ResolverOptions,
) => string | false;

export type AsyncResolver = (
  url: string,
  resolverOptions: ResolverOptions,
) => Promise<string | false>;
