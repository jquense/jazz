import { mix } from 'khroma';

import {
  ArthimeticOperators,
  BinaryExpression,
  BinaryExpressionTerm,
  Calc,
  Function,
  MathFunction,
  Numeric,
  Operator,
  Operators,
} from './Ast';

export type Term = Numeric | Calc | MathFunction | Function;

const PRECEDENCE: Record<Operators, number> = {
  '==': 0,
  '!=': 0,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
  '%': 3,
  '**': 4,
};

const equalityOperators = {
  '==': true,
  '!=': true,
};

const multiplicativeOperators = {
  '*': true,
  '/': true,
  '%': true,
};

export const isMathTerm = (term: BinaryExpressionTerm): term is Term =>
  term.type === 'numeric' ||
  term.type === 'calc' ||
  term.type === 'math-function' ||
  term.type === 'function';

export const isValidCalcFunction = ({ name, isVar }: Function): boolean =>
  isVar ||
  name.name === 'min' ||
  name.name === 'max' ||
  name.name === 'clamp' ||
  name.name === 'calc';

export const isArithmeticOperator = (
  op: Operators,
): op is ArthimeticOperators =>
  op === '+' ||
  op === '-' ||
  op === '*' ||
  op === '/' ||
  op === '%' ||
  op === '**';

const throwIrreducable = (a: Term, b: Term) => {
  throw new Error(
    `The terms ${a} and ${b} cannot be reduced without producing a calc() expression`,
  );
};

const assertValidMathFunction = (a: Term) => {
  if (a.type === 'function' && !a.isVar)
    throw new Error(`The function ${a} is not valid in a Math expression`);
};

// prettier
export function shouldFlatten(parentOp: Operators, nodeOp: Operators) {
  if (PRECEDENCE[nodeOp] !== PRECEDENCE[parentOp]) return false;

  // ** is right-associative
  // x ** y ** z --> x ** (y ** z)
  if (parentOp === '**') return false;

  // x == y == z --> (x == y) == z
  if (parentOp in equalityOperators && nodeOp in equalityOperators)
    return false;

  // x * y % z --> (x * y) % z
  if (
    (nodeOp === '%' && parentOp in multiplicativeOperators) ||
    (parentOp === '%' && nodeOp in multiplicativeOperators)
  ) {
    return false;
  }

  // x * y / z --> (x * y) / z
  // x / y * z --> (x / y) * z
  if (
    nodeOp !== parentOp &&
    nodeOp in multiplicativeOperators &&
    parentOp in multiplicativeOperators
  ) {
    return false;
  }

  return true;
}

export function add(a: Term, b: Term, mustReduce = false) {
  if (a.type === 'numeric' && b.type === 'numeric') {
    if (Numeric.compatible(a, b) || mustReduce) {
      const result = b.convert(a.unit);
      result.value = a.value + result.value;
      return result;
    }
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunction(a);
  assertValidMathFunction(b);

  if (a.type === 'calc') a = a.expression as any;
  if (b.type === 'calc') b = b.expression as any;
  return new Calc(new BinaryExpression(a, new Operator('+'), b));
}

export function subtract(a: Term, b: Term, mustReduce = false) {
  if (a.type === 'numeric' && b.type === 'numeric') {
    if (Numeric.compatible(a, b) || mustReduce) {
      const result = b.convert(a.unit);
      result.value = a.value - result.value;
      return result;
    }
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunction(a);
  assertValidMathFunction(b);

  if (a.type === 'calc') a = a.expression as any;
  if (b.type === 'calc') b = b.expression as any;
  return new Calc(new BinaryExpression(a, new Operator('-'), b));
}

export function multiply(a: Term, b: Term, mustReduce = false) {
  if (b.type !== 'numeric' && mustReduce)
    throw new Error(
      `Cannot multiply ${a} by ${b} because the units are incompatible`,
    );

  if (a.type === 'numeric' && b.type === 'numeric') {
    // it should the case if either a or b produce calcs,
    // they should get reduced if one produces a unitless number
    // e.g. calc(calc(10 * 2) * 2px) -> calc(20 * 2px)
    if (a.unit && b.unit) {
      throw new Error(
        `Cannot multiply ${a} by ${b} because both terms contain units`,
      );
    }

    return new Numeric(a.value * b.value, a.unit || b.unit);
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunction(a);
  assertValidMathFunction(b);

  if (a.type === 'calc') a = a.expression as any;
  if (b.type === 'calc') b = b.expression as any;
  return new Calc(new BinaryExpression(a, new Operator('*'), b));
}

export function divide(a: Term, b: Term, mustReduce = false) {
  if ((b.type !== 'numeric' && mustReduce) || (b.type === 'numeric' && b.unit))
    throw new Error(
      (b as Numeric).unit
        ? `Cannot divide ${a} by ${b} because ${b} is not unitless`
        : `Cannot divide ${a} by ${b} because the units are incompatible`,
    );

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new Numeric(a.value / b.value, a.unit);
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunction(a);
  assertValidMathFunction(b);

  if (a.type === 'calc') a = a.expression as any;
  if (b.type === 'calc') b = b.expression as any;
  return new Calc(new BinaryExpression(a, new Operator('/'), b));
}

export function pow(a: Term, b: Term) {
  if (b.type === 'numeric' && b.unit)
    throw new Error(`Cannot raise ${a} to ${b} because ${b} is not unitless`);

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new Numeric(a.value ** b.value, a.unit);
  }

  throw new Error(`One or more terms is not a number`);
}

export function mod(a: Term, b: Term) {
  if (b.type === 'numeric' && b.unit)
    throw new Error(
      `Cannot evaluate ${a} % ${b} because ${b} is not unitless`,
    );

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new Numeric(a.value % b.value, a.unit);
  }

  throw new Error(`One or more terms is not a number`);
}

export function min(terms: Term[], mustReduce = false) {
  let current: Numeric | null = null;

  const getExpression = () => {
    if (!mustReduce) return new MathFunction('min', terms);
    throw new Error(
      `Cannot evaluate the min of ${terms.join(
        ',',
      )} because at least one term is not numeric and would procude a runtime min() expression`,
    );
  };

  for (const term of terms) {
    if (term.type !== 'numeric') return getExpression();

    if (current) {
      if (Numeric.compatible(current, term)) {
        const next = term.convert(current.unit);

        if (current.value > next.value) {
          current = next;
        }
        continue;
      }

      return getExpression();
    }
    current = term;
  }
  return current!;
}

export function max(terms: Term[], mustReduce = false) {
  let current: Numeric | null = null;

  const getExpression = () => {
    if (!mustReduce) return new MathFunction('max', terms);
    throw new Error(
      `Cannot evaluate the max of ${terms.join(
        ',',
      )} because at least one term is not numeric and would procude a runtime max() expression`,
    );
  };

  for (const term of terms) {
    if (term.type !== 'numeric') return getExpression();

    if (current) {
      if (Numeric.compatible(current, term)) {
        const next = term.convert(current.unit);

        if (current.value < next.value) {
          current = next;
        }
        continue;
      }

      return getExpression();
    }
    current = term;
  }
  return current!;
}

export function clamp([minVal, val, maxVal]: Term[], mustReduce = false) {
  return max([min([maxVal, val], mustReduce), minVal], mustReduce);
}
