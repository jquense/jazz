import type { LazyResult, ProcessOptions, Result, Root } from 'postcss';

import type ModuleMembers from './ModuleMembers';
// eslint-disable-next-line import/no-duplicates
import type Scope from './Scope';
import type { IdentifierScope } from './utils/infer-scope';

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

// export type Scope = {
//   variables: Map<string, Ast.Function>;
//   functions: Map<string, Ast.Function>;
// };

export type PostcssProcessOptions = ProcessOptions & ModularCSSOpts;

export type PostcssPluginResult = Result & { opts: ModularCSSOpts };

export type PostcssPlugin = { postcssPlugin?: string } & ((
  root: Root,
  result: PostcssPluginResult,
) => Promise<any> | any);

export interface ModularCSSOpts {
  resolve: any;
  source?: boolean;
  trace?: boolean;
  identifierScope?: IdentifierScope;
  namer?: (fileName: string, ident: string) => string;
  modules: Map<string, Module>;
}

export type Variable = {
  name: string;
  value: string;
};
