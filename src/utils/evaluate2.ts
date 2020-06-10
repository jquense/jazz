/* eslint-disable no-loop-func */
import postcss, { AtRule, ChildNode, Declaration } from 'postcss';

import Parser from '../parsers';
import * as Ast from '../parsers/Ast';
import * as math from '../parsers/math';
import Scope from './Scope';
import { isVariableDeclaration } from './Variables';

// export function canCalcBeReduced(calc: Ast.Calc) {
//   if (calc)
// }

type Reduceable =
  | Ast.ListItem
  | Ast.DeclarationValue
  | Ast.Expression
  | postcss.Node;

type MathExpression = Ast.BinaryExpression & {
  left: math.Term;
  right: math.Term;
};

type Resolved<T> = T extends Ast.Variable ? never : T;

const insertBeforeParent = (node: postcss.ChildNode) =>
  (node.parent as postcss.Container).insertBefore(node, node.nodes);

function fixElseIfAtRule(rule?: ChildNode) {
  if (rule?.type !== 'atrule') return rule;
  if (rule.name !== 'else') return rule;

  const [ifPart, rest] = rule.params.split(/\s*if\s+/g);
  if (!ifPart.length && rest) {
    rule.name += ' if';
    rule.params = rest;
  }
  return rule;
}

export class Reducer {
  private inCalc = 0;

  constructor(private currentScope: Scope, public parser: Parser) {}

  static reduce(
    node: Reduceable,
    scope: Scope,
    parser: Parser,
  ): Resolved<Reduceable> {
    return new Reducer(scope, parser).reduce(node);
  }

  scope(fn: (scope: Scope) => void) {
    this.currentScope = this.currentScope.createChildScope();

    try {
      fn(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  reduce(node: Reduceable): Resolved<Reduceable> {
    switch (node.type) {
      case 'root':
        // console.log('ROOOT', node);
        this.reducePostCssNodes(node);
        return node;
      case 'rule':
        // console.log('RULE', node.nodes);

        this.scope(() => {
          this.reducePostCssNodes(node);
        });
        break;

      case 'decl':
        this.reduceDeclaration(node);

        break;
      case 'atrule': {
        if (node.name === 'if') this.reduceIfRule(node);
        else if (node.name === 'for') this.reduceForRule(node);
        break;
      }

      case 'variable': {
        const variable = this.currentScope.get(node);

        if (!variable) {
          throw new Error(`Variable not defined ${node.toString()}`);
        }
        return variable.node.clone();
      }
      case 'numeric':
      case 'string':
      case 'color':
      case 'url':
      case 'operator':
        return node;

      case 'list':
      case 'declaration-value':
        this.reduceChildren(node);
        break;
      case 'unary-expression':
        return this.reduceUnaryExpression(node);
      case 'binary-expression':
        return this.reduceBinaryExpression(node);

      case 'calc': {
        try {
          this.inCalc++;

          return this.reduce(this.inCalc > 1 ? node.expression : node);
        } finally {
          this.inCalc--;
        }
      }
      case 'math-function':
        this.reduceChildren(node);

        return math[node.name](node.nodes as math.Term[], !this.inCalc);
      case 'function':
        return this.reduceFunction(node);

      case 'interpolated-ident': {
        this.reduceChildren(node);

        return new Ast.Ident(node.toString());
      }

      default:
    }

    return node as any;
  }

  reduceDeclaration(node: Declaration) {
    const parsed = this.reduce(this.parser.value(node));
    // TODO: handle null
    node.value = parsed.toString();

    if (isVariableDeclaration(node.prop)) {
      const name = node.prop.slice(1);

      // console.log(parsed.body);
      this.currentScope.setVariable(name, parsed.body.clone());

      node.remove();
      return null;
    }

    node.prop = this.reduce(this.parser.prop(node)).toString();

    return node;
  }

  reduceForRule(node: AtRule) {
    const parsed = this.parser.forCondition(node);
    const fromExpr = this.reduce(parsed.from) as Ast.ReducedExpression;
    const toExpr = this.reduce(parsed.to) as Ast.ReducedExpression;

    if (fromExpr.type !== 'numeric') {
      throw node.error(`${fromExpr} is not numeric`);
    }
    if (toExpr.type !== 'numeric') {
      throw node.error(`${toExpr} is not numeric`);
    }
    if (!Ast.Numeric.compatible(fromExpr, toExpr)) {
      throw node.error(
        `${fromExpr.unit} is not compatible with ${toExpr.unit}`,
      );
    }

    const end = parsed.exclusive ? toExpr.value : toExpr.value + 1;
    const start = fromExpr.value;

    const nodes = [] as ChildNode[];
    for (let i = start; i < end; i++) {
      this.scope((scope) => {
        scope.set(parsed.variable.clone(), new Ast.Numeric(i));

        const iter = node.clone({ parent: node.parent });

        nodes.push(...iter.nodes!.map((t) => this.reduce(t) as ChildNode));
      });
    }

    node.replaceWith(...nodes);
  }

  reduceIfRule(node: AtRule) {
    let current: ChildNode | undefined = node;
    let result = false;

    while (current && current.type === 'atrule') {
      const next = fixElseIfAtRule(current.next());

      if (!result && current.name.endsWith('if')) {
        const condition = this.reduce(
          this.parser.expression(current),
        ) as Ast.Value;

        result = Ast.isTruthy(condition);

        if (result) {
          this.scope(() => {
            this.reducePostCssNodes(current);

            current!.replaceWith(...current!.nodes!);
          });
        }
      } else if (!result && current.name === 'else') {
        this.scope(() => {
          current!.replaceWith(...current!.nodes!.map((t) => this.reduce(t)));
        });
      }

      current.remove();

      // if we find another @if need to break and let the reducer run it
      if (next?.type === 'atrule' && next.name === 'if') {
        break;
      }

      current = next;
    }
  }

  reduceFunction(node: Ast.Function) {
    const fn = this.currentScope.get(node.name);

    // assume a css function grumble
    if (!fn) {
      return node;
    }

    node.separateArgumentsBy(',');

    this.reduceChildren(node);

    return fn.fn(...node.nodes);
  }

  reducePostCssNodes(node: postcss.Container) {
    node.each((child) => {
      this.reduce(child as any);
    });
  }

  reduceChildren(node: Ast.Container) {
    const result = [] as any[];

    for (const child of node.nodes!) {
      const next = this.reduce(child as any);
      if (next) result.push(next);
    }

    node.nodes = result;
  }

  reduceUnaryExpression(node: Ast.UnaryExpression) {
    const { inCalc } = this;
    let argument = this.reduce(node.argument) as Ast.Value;

    if (!math.isMathTerm(argument)) {
      throw new Error(`${argument} is not a number`);
    }

    if (node.operator === 'not') {
      if (inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      return new Ast.BooleanLiteral(!Ast.isFalsey(argument));
    }

    if (node.operator === '-') {
      if (argument.type === 'numeric') argument.value *= -1;
      else if (this.inCalc)
        argument = new Ast.Calc(
          new Ast.BinaryExpression(
            new Ast.Numeric(-1),
            new Ast.Operator('*'),
            argument.type === 'calc' ? argument.expression : argument,
          ),
        );
    }

    return argument;
  }

  reduceBinaryExpression(node: Ast.BinaryExpression) {
    const { inCalc } = this;

    const left = this.reduce(node.left) as ResolvedValue;
    const right = this.reduce(node.right) as ResolvedValue;
    const op = node.operator.value;

    const evalError = (reason: string) => {
      const original = node.toString();
      const resolved = new Ast.BinaryExpression(
        left,
        node.operator.clone(),
        right,
      ).toString();
      return new Error(
        `Cannot evaluate ${node}${
          original !== resolved ? ` (evaluated as: ${resolved})` : ''
        }. ${reason}`,
      );
    };

    if (math.isArithmeticOperator(op)) {
      if (!math.isMathTerm(left) || !math.isMathTerm(right)) {
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

    // calc and math functions shouldn't be compared as nodes
    if (
      math.isResolvableToNumeric(left) ||
      math.isResolvableToNumeric(right)
    ) {
      throw evalError(
        'Math functions must be resolvable when combined outside of another math function',
      );
    }

    if (op === 'and') return Ast.isTruthy(left) ? right : left;
    if (op === 'or') return Ast.isTruthy(left) ? left : right;

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
}

type ResolvedValue = Exclude<Ast.Value, Ast.Variable>;
