import * as Ast from '../parsers/Ast';

export type VariableMember = {
  source?: string;
  node: Ast.ReducedExpression;
};

export type FunctionMember = {
  source?: string;
  fn: (...args: Ast.ListItem[]) => Ast.ReducedExpression;
};

export type Member = VariableMember | FunctionMember;

export default class Scope {
  readonly variables: Record<string, VariableMember> = Object.create(null);

  readonly funcs: Record<string, FunctionMember> = Object.create(null);

  constructor(opts?: {
    variables?: Record<string, VariableMember>;
    funcs?: Record<string, FunctionMember>;
  }) {
    if (opts) {
      this.variables = opts.variables ?? this.variables;
      this.funcs = opts.funcs ?? this.funcs;
    }
  }

  from(scope: Scope, namespace?: string) {
    for (const [key, value] of Object.entries(scope.variables)) {
      this.set(new Ast.Variable(key.slice(1), namespace), value);
    }
    for (const [key, value] of Object.entries(scope.funcs)) {
      this.set(new Ast.Ident(key, namespace), value);
    }
  }

  get(ident: Ast.Ident): FunctionMember;

  get(ident: Ast.Variable): VariableMember;

  get(ident: Ast.Ident | Ast.Variable) {
    const cache = ident.type === 'variable' ? this.variables : this.funcs;

    return cache[ident.toString()];
  }

  set(
    ident: Ast.Variable,
    nodeOrMember: Ast.ReducedExpression | VariableMember,
    source?: string,
  ): boolean;

  set(
    ident: Ast.Ident,
    funcOrMember: Function | FunctionMember,
    source?: string,
  ): boolean;

  set(
    ident: Ast.Ident | Ast.Variable,
    nodeOrFuncOrMember:
      | Ast.ReducedExpression
      | VariableMember
      | FunctionMember
      | Function,
    source?: string,
  ) {
    const name = ident.toString();
    const cache = ident.type === 'variable' ? this.variables : this.funcs;

    if (name in cache) {
      return false;
    }

    if (ident.type === 'variable') {
      this.variables[name] =
        'type' in nodeOrFuncOrMember
          ? { node: nodeOrFuncOrMember, source }
          : { ...(nodeOrFuncOrMember as VariableMember), source };
    } else {
      this.funcs[name] =
        typeof nodeOrFuncOrMember === 'function'
          ? { fn: nodeOrFuncOrMember, source }
          : { ...(nodeOrFuncOrMember as FunctionMember), source };
    }

    return true;
  }

  setVariable(name: string, node: Ast.ReducedExpression, source?: string) {
    return this.set(new Ast.Variable(name), node, source);
  }

  setFunction(name: string, fn: Function, source?: string) {
    return this.set(new Ast.Ident(name), fn, source);
  }
}
