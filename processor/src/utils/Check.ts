import type * as Ast from '../Ast';
import type { Value, VarFunctionCall } from '../Values';

export const isVarCall = (n: Value): n is VarFunctionCall =>
  n.type === 'string' && n.isVarCall;

export const isIfRule = (n: Ast.StatementNode): n is Ast.IfAtRule =>
  n.type === 'atrule' && (n.name === 'if' || n.name === 'else if');

export const isEachRule = (n: Ast.StatementNode): n is Ast.EachAtRule =>
  n.type === 'atrule' && n.name === 'each';

export const isUseRule = (n: Ast.StatementNode): n is Ast.UseAtRule =>
  n.type === 'atrule' && n.name === 'use';

export const isImportRule = (n: Ast.StatementNode): n is Ast.ImportAtRule =>
  n.type === 'atrule' && n.name === 'import';

export const isExportRule = (n: Ast.StatementNode): n is Ast.ExportAtRule =>
  n.type === 'atrule' && n.name === 'export';

export const isComposeRule = (n: Ast.StatementNode): n is Ast.ComposeAtRule =>
  n.type === 'atrule' && n.name === 'compose';

export const isFunctionRule = (
  n: Ast.StatementNode,
): n is Ast.FunctionAtRule => n.type === 'atrule' && n.name === 'function';

export const isMixinRule = (n: Ast.StatementNode): n is Ast.MixinAtRule =>
  n.type === 'atrule' && n.name === 'mixin';

export const isIncludeRule = (n: Ast.StatementNode): n is Ast.IncludeAtRule =>
  n.type === 'atrule' && n.name === 'include';

export const isMetaRule = (n: Ast.StatementNode): n is Ast.MetaAtRule =>
  n.type === 'atrule' &&
  (n.name === 'debug' || n.name === 'warn' || n.name === 'error');

export const isIcssImportRule = (
  n: Ast.StatementNode,
): n is Ast.IcssImportAtRule =>
  n.type === 'atrule' && n.name === 'icss-import';

export const isIcssExportRule = (
  n: Ast.StatementNode,
): n is Ast.IcssExportAtRule =>
  n.type === 'atrule' && n.name === 'icss-export';
