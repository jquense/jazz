import type { LazyResult, ProcessOptions, Result, Root } from 'postcss';

import * as Ast from './parsers/Ast';
import Scope, { Member } from './utils/Scope';
import { EXPORTS } from './utils/Symbols';

export interface Value {
  name?: string;
  value: string;
  source?: string;
}

export interface ProcessingFile {
  text: string;
  values: Record<string, Value>;

  scope: Scope;

  [EXPORTS]: Scope;

  valid: boolean;
  before: LazyResult;
  processed?: LazyResult;
  result?: Result;
  walked: Promise<void>;
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
  files: Record<string, ProcessingFile>;
}

export type Variable = {
  name: string;
  value: string;
};
