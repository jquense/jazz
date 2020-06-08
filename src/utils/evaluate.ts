import * as Ast from '../parsers/Ast';
import * as math from '../parsers/math';
import Scope from './Scope';

// export function canCalcBeReduced(calc: Ast.Calc) {
//   if (calc)
// }

type Reduceable = Ast.ListItem | Ast.Root | Ast.BinaryExpressionTerm;

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
          // console.log(`IN ${this.inCalc}`);
          return this.reduce(this.inCalc > 1 ? node.expression : node);
        } finally {
          this.inCalc--;
          // console.log(`OUT ${this.inCalc}`);
        }
      }
      case 'math-function':
        this.reduceChildren(node);
        // console.log('MATH', node);
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
    let argument = this.reduce(node.argument) as Ast.BinaryExpressionTerm;

    if (!math.isMathTerm(argument)) {
      throw new Error(`${argument} is not a number`);
    }

    if (node.operator === 'not') {
      if (inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      throw new Error('not implemented');
      // return this.evaluateTruthy()
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

    const left = this.reduce(node.left) as ResolvedBinaryTerm;
    const right = this.reduce(node.right) as ResolvedBinaryTerm;
    const op = node.operator.value;

    if (math.isArithmeticOperator(op)) {
      if (!math.isMathTerm(left) || !math.isMathTerm(right)) {
        throw new Error(
          `Cannot evaluate ${node} (evaluated as: ${left} ${op} ${right}) because some terms are not numerical.`,
        );
      }

      if (op === '+') return math.add(left, right, !inCalc);
      if (op === '-') return math.subtract(left, right, !inCalc);
      if (op === '*') return math.multiply(left, right, !inCalc);
      if (op === '/') return math.divide(left, right, !inCalc);
      if (op === '%') return math.mod(left, right);
      if (op === '**') return math.pow(left, right);
    } else if (inCalc) {
      throw new Error(
        `Only arithmetic is allowed in a CSS calc() function not ${node}`,
      );
    }

    throw new Error(`not implemented: ${math.isArithmeticOperator(op)}`);
  }
}

type ResolvedBinaryTerm = Exclude<
  Ast.BinaryExpressionTerm,
  Ast.Function | Ast.Variable
>;
