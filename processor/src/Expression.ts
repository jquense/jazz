import * as Ast from './Ast';
import type { ResolvedArguments, ResolvedParameters } from './Callable';
import { fromJs } from './Interop';
import Scope from './Scope';
import {
  ArgumentListValue,
  BinaryMathExpression,
  BooleanValue,
  ListValue,
  MapValue,
  MathFunctionValue,
  NullValue,
  NumericValue,
  RgbValue,
  StringValue,
  Value,
  isCalcValue,
  stringifyList,
} from './Values';
import JazzSyntaxError from './utils/JazzSyntaxError';
import * as math from './utils/Math';
import { closest } from './utils/closest';
import interleave from './utils/interleave';
import { ExpressionVisitor } from './visitors';

export type Options = {
  scope: Scope;
};

function catchAndThrowFromNode<T>(node: Ast.Node, fn: () => T): T {
  try {
    return fn();
  } catch (err: any) {
    throw node.error(err.message);
  }
}

export default class EvaluateExpression implements ExpressionVisitor<Value> {
  protected inCalc = 0;

  currentScope: Scope;

  constructor({ scope }: Options) {
    this.currentScope = scope;
  }

  protected withClosure<T>(fn: (scope: Scope) => T): T;

  protected withClosure<T>(parentScope: Scope, fn: (scope: Scope) => T): T;

  protected withClosure<T>(
    parentOrfn: Scope | ((scope: Scope) => T),
    fn?: (scope: Scope) => T,
  ) {
    let scope = parentOrfn as Scope;
    const old = this.currentScope;

    if (typeof parentOrfn === 'function' && !fn) {
      scope = this.currentScope;
      fn = parentOrfn;
    }

    this.currentScope = scope.createChildScope(true);

    try {
      return fn!(this.currentScope);
    } finally {
      this.currentScope.close();
      this.currentScope = old;
    }
  }

  withScope<T>(scope: Scope, fn: (scope: Scope) => T): T {
    const old = this.currentScope;

    this.currentScope = scope;
    try {
      return fn!(this.currentScope);
    } finally {
      this.currentScope = old;
    }
  }

  protected withChildScope<T>(fn: (scope: Scope) => T): T {
    this.currentScope = this.currentScope.createChildScope(false);

    try {
      return fn!(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  visitVariable(node: Ast.Variable): Value {
    const variable = this.currentScope.getVariable(node);

    if (!variable) {
      throw new Error(`Variable not defined ${node}`);
    }

    return variable.node;
  }

  visitParentSelectorReference(
    _: Ast.ParentSelectorReference,
  ): ListValue | NullValue {
    const parent = this.currentScope.currentRule?.selectorList;

    if (!parent) {
      return new NullValue();
    }

    return new ListValue(
      parent.nodes.map(
        (n) =>
          new ListValue(
            n.type === 'compound-selector'
              ? [new StringValue(String(n))]
              : n.nodes.map((nn) => new StringValue(String(nn))),
            ' ',
          ),
      ),
      ',',
    );
  }

  visitBooleanLiteral(node: Ast.BooleanLiteral): Value {
    return new BooleanValue(node.value);
  }

  visitStringLiteral(node: Ast.StringLiteral): Value {
    return new StringValue(node.value, node.quote);
  }

  visitNullLiteral(_: Ast.NullLiteral): NullValue {
    return new NullValue();
  }

  visitNumeric(node: Ast.Numeric): NumericValue {
    return new NumericValue(node.value, node.unit);
  }

  visitUrl(node: Ast.Url): StringValue {
    throw new Error('nope');
    return new StringValue(`url(${node.value})`);
  }

  visitList(node: Ast.List<Ast.Expression>): ListValue {
    return new ListValue(
      node.nodes.map((n) => n.accept(this)),
      node.separator,
      node.brackets,
    );
  }

  visitMap(node: Ast.Map<Ast.Expression, Ast.Expression>): Value {
    return new MapValue(
      node
        .entries()
        .map(([key, value]) => [key.accept(this), value.accept(this)]),
    );
  }

  visitColor(node: Ast.Color): RgbValue {
    return new RgbValue(node.value)!;
  }

  visitStringTemplate(node: Ast.StringTemplate): StringValue {
    const hasQuote = node.quote;

    return new StringValue(
      interleave(
        node.quasis,
        node.expressions.map((e) => {
          const value = e.accept(this);
          // inner strings need their quotes dropped
          return hasQuote && value.type === 'string' ? value.value : value;
        }),
      ).join(''),
      node.quote,
    );
  }

  visitIdent(node: Ast.Ident): StringValue {
    return new StringValue(node.value);
  }

  visitInterpolatedIdent(node: Ast.InterpolatedIdent): StringValue {
    return new StringValue(
      interleave(
        node.quasis,
        node.expressions.map((e) => e.accept(this)),
      ).join(''),
    );
  }

  visitInterpolation(node: Ast.Interpolation): Value {
    return node.first.accept(this);
  }

  visitBinaryExpression(node: Ast.BinaryExpression): Value {
    const original = node.toString();

    const { inCalc } = this;

    const left = node.left.accept(this);

    const op = node.operator.value;

    const toString = () =>
      new BinaryMathExpression(
        left as any,
        op,
        node.right.accept(this) as any,
      ).toString();

    const evalError = (reason: string) => {
      const resolved = toString();

      return node.error(
        `Cannot evaluate ${original}${
          original !== resolved ? ` (resolved to: ${resolved})` : ''
        }. ${reason}`,
      );
    };

    if (math.isArithmeticOperator(op)) {
      const right = node.right.accept(this);

      // console.log(left, right);
      if (!math.isMathValue(left) || !math.isMathValue(right)) {
        throw evalError('Some terms are not numerical.');
      }

      if (op === '+') return math.add(left, right, !inCalc);
      if (op === '-') return math.subtract(left, right, !inCalc);
      if (op === '*') return math.multiply(left, right, !inCalc);
      if (op === '/') return math.divide(left, right, !inCalc);
      if (op === '%') return math.mod(left, right);
      if (op === '**') return math.pow(left, right);
    } else if (inCalc) {
      throw evalError('Only arithmetic is allowed in a CSS calc() function');
    }

    if (op === 'and') return left.isTruthy() ? node.right.accept(this) : left;
    if (op === 'or') return left.isTruthy() ? left : node.right.accept(this);

    const right = node.right.accept(this);

    // calc and math functions shouldn't be compared as nodes
    if (
      math.isResolvableToNumeric(left) ||
      math.isResolvableToNumeric(right)
    ) {
      throw node.error(
        `The expression ${toString()} contains unresolvable math expressions making numeric comparison impossible.`,
      );
    }

    if (op === '==') return math.eq(left, right);
    if (op === '!=') return math.neq(left, right);

    if (left.type !== 'numeric' || right.type !== 'numeric') {
      throw evalError('Some terms are not numerical and cannot be compared.');
    }

    if (op === '>') return math.gt(left, right);
    if (op === '>=') return math.gte(left, right);
    if (op === '<') return math.lt(left, right);
    if (op === '<=') return math.lte(left, right);

    throw new Error(`not implemented: ${op}`);
  }

  visitUnaryExpression(node: Ast.UnaryExpression): Value {
    let argument = node.argument.accept(this);

    if (node.operator === 'not') {
      if (this.inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      return new BooleanValue(!argument.isTruthy());
    }

    if (!math.isMathValue(argument)) {
      throw new Error(
        `"${node.operator}" only operates on numbers and ${argument} is not a number`,
      );
    }

    if (node.operator === '-') {
      if (argument.type === 'numeric') argument.value *= -1;
      else if (this.inCalc) {
        argument = new MathFunctionValue(
          'calc',
          new BinaryMathExpression(
            new NumericValue(-1),
            '*',
            isCalcValue(argument) ? argument.args[0] : argument,
          ),
        );
      }
    }

    return argument;
  }

  visitRange(node: Ast.Range): ListValue {
    const from = node.from.accept(this);
    const to = node.to.accept(this);

    if (from.type !== 'numeric') throw new Error(`${from} is not numeric`);
    if (to.type !== 'numeric') throw new Error(`${to} is not numeric`);

    if (!NumericValue.compatible(from, to)) {
      throw new Error(`${from.unit} is not compatible with ${to.unit}`);
    }

    const end = node.exclusive ? to.value : to.value + 1;
    const start = from.value;
    const mult = end < start ? -1 : 1;

    const list = new ListValue(
      Array.from(
        { length: Math.abs(end - start) },
        (_, i) => new NumericValue(start + i * mult),
      ),
      ',',
    );

    return list;
  }

  visitCallExpression(node: Ast.CallExpression): Value {
    // if this is a plain function call then evaluate it in place
    // otherwise let the parent rule handle the mixin
    const args = this.evaluateArguments(node.args);
    const member = this.currentScope.getFunction(node.callee);

    const suggestFunction = () => {
      const fns = this.currentScope
        .getAll('function')
        .map((f) => f.identifier);

      return closest(`${node.callee}`, fns, 1);
    };
    // assume a css function...grumble
    if (member) {
      if (member.callable) {
        const params = catchAndThrowFromNode(node, () =>
          this.resolveParameters(member.callable.params, args),
        );

        const result = member.callable(params);

        if (result === undefined) {
          throw node.error(
            `Function ${member.identifier} did not return a value`,
          );
        }

        return fromJs(result);
      }
    } else if (node.callee.namespace) {
      const bestGuess = suggestFunction();
      throw node.error(
        `Undefined function ${node.callee}.${
          bestGuess ? ` Did you mean to call ${bestGuess} instead` : ''
        }`,
      );
    }

    if (Object.keys(args.keywords).length) {
      const bestGuess = suggestFunction();

      throw node.error(
        bestGuess
          ? `Unexpected keyword argument, did you mean to call ${bestGuess} instead?`
          : `Plain CSS functions specify arguments by keyword`,
      );
    }

    return new StringValue(
      `${node.callee}(${stringifyList(args.positionals, ',')})`,
    );
  }

  visitMathCallExpression(node: Ast.MathCallExpression): Value {
    try {
      this.inCalc++;

      const name = node.callee.accept(this) as StringValue;
      const args = this.evaluateArguments(node.args);

      // We don't call calc functions since they function only as
      // syntatic fences for allowing math expressions, which are evaluated above.
      //
      // The first argument will always evaluate to a resolved expression or
      // another calc call if it cannot be resolved
      if (name.value === 'calc') {
        return args.positionals[0];
      }

      const member = this.currentScope.getFunction(name.value)!;

      const params = catchAndThrowFromNode(node, () =>
        this.resolveParameters(member.callable.params, args),
      );

      return fromJs(member.callable(params));
    } finally {
      this.inCalc--;
    }
  }

  callWithScopedParameters<T>(
    paramList: Ast.ParameterList,
    params: ResolvedParameters,
    fn: (args: ResolvedParameters) => T,
  ) {
    return this.withClosure((scope) => {
      for (const param of paramList.parameters) {
        const { name } = param.name;
        let provided = params[name];

        if (
          provided === undefined &&
          param.defaultValue &&
          param.defaultValue.type !== 'unknown-default-value'
        ) {
          provided = params[name] = param.defaultValue.accept(this);
        }
        if (provided) scope.setVariable(param.name, provided);
      }
      if (paramList.rest) {
        scope.setVariable(
          paramList.rest.name.name,
          params[paramList.rest.name.name]!,
        );
      }

      return fn(params);
    });
  }

  protected resolveParameters(
    paramList: Ast.ParameterList,
    args: ResolvedArguments,
  ): ResolvedParameters {
    const { positionals, keywords } = args!;

    const kwargs = new Set(Object.keys(keywords));
    const params = paramList.parameters;
    const numPositionals = positionals.length;

    const result: ResolvedParameters = {};
    for (const [idx, param] of params.entries()) {
      // name without $
      const paramName = param.name.name;

      // let expr;
      if (idx < numPositionals) {
        if (kwargs.has(paramName)) {
          throw new JazzSyntaxError({
            message: `Argument ${param.name} was passed both by position and by name.`,
            word: String(param.name),
          });
        }

        result[param.name.name] = positionals[idx];
      } else if (kwargs.has(paramName)) {
        kwargs.delete(paramName);
        result[param.name.name] = keywords[paramName]!;
      } else if (param.defaultValue) {
        result[param.name.name] = undefined;
      } else {
        throw new JazzSyntaxError({
          message: `Missing argument $${paramName}.`,
          word: `$${paramName}`,
        });
      }
    }

    if (paramList.rest) {
      result[paramList.rest.name.name] = new ArgumentListValue(
        positionals.slice(params.length),
        keywords,
      );
    } else if (kwargs.size) {
      throw new JazzSyntaxError(
        `No argument(s) named ${Array.from(kwargs, (k) => `$${k}`).join(
          ', ',
        )}`,
      );
    }
    return result;
  }

  protected evaluateArguments(node: Ast.ArgumentList): ResolvedArguments {
    const spreads = [] as Value[];
    const positionals = [] as Value[];
    const keywords = Object.create(null) as Record<string, Value>;

    node.nodes.forEach((arg) => {
      if (arg.type === 'keyword-argument') {
        keywords[arg.name.name] = arg.value.accept(this);
      } else if (arg.type === 'spread') {
        spreads.push(arg.value.accept(this));
      } else {
        positionals.push(arg.accept(this));
      }
    });

    function addKeywords(spread: MapValue) {
      for (const [key, value] of spread) {
        if (key.type !== 'string')
          throw node.error(
            'Variable keyword argument map must have string keys',
          );
        keywords[key.value] = value;
      }
    }

    if (spreads.length) {
      const [spreadA, spreadB] = spreads;

      if (spreadB) {
        if (spreadB.type !== 'map') {
          throw node.error('Variable keyword arguments must be a map');
        }
        addKeywords(spreadB);
      }

      if (spreadA.type === 'map') {
        addKeywords(spreadA);
      } else {
        positionals.push(...spreadA.toArray());
      }
    }

    return { positionals, keywords };
  }
}
