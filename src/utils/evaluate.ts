import * as Ast from '../parsers/Ast';
import * as math from '../parsers/math';
import Scope from './Scope';

// export function canCalcBeReduced(calc: Ast.Calc) {
//   if (calc)
// }

type Reduceable = Ast.ListItem | Ast.Root | Ast.Expression;

type MathExpression = Ast.BinaryExpression & {
  left: math.Term;
  right: math.Term;
};

type Resolved<T> = T extends Ast.Variable ? never : T;

export class Reducer {
  private inCalc = 0;

  constructor(private scope: Scope) {}

  reduce(node: Reduceable): Resolved<Reduceable> {
    const { scope } = this;

    switch (node.type) {
      case 'variable': {
        const variable = scope.get(node);

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

      case 'root':
      case 'list':
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
      case 'math-call-expression':
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

  reduceFunction(node: Ast.Function) {
    const fn = this.scope.get(node.name);

    // assume a css function grumble
    if (!fn) {
      return node;
    }

    node.separateArgumentsBy(',');

    this.reduceChildren(node);

    return fn.fn(...node.nodes);
  }

  reduceChildren(node: Ast.Container) {
    node.nodes = node.nodes.map((t) => this.reduce(t as any));
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
