import {
  ArthimeticOperators,
  BinaryExpression,
  BooleanLiteral,
  Calc,
  Expression,
  Function,
  MathFunction,
  Numeric,
  Operator,
  Operators,
  Value,
  isStringish,
} from './Ast';

export type Term = Numeric | Calc | MathFunction | Function;

export const isMathTerm = (term: Expression): term is Term =>
  term.type === 'numeric' ||
  term.type === 'calc' ||
  term.type === 'math-function' ||
  term.type === 'function';

export const isResolvableToNumeric = (fn: Value): boolean =>
  fn.type === 'calc' || fn.type === 'math-function';

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

export function gt(a: Numeric, b: Numeric) {
  return new BooleanLiteral(a.value > b.convert(a.unit).value);
}

export function gte(a: Numeric, b: Numeric) {
  return new BooleanLiteral(a.value >= b.convert(a.unit).value);
}

export function lt(a: Numeric, b: Numeric) {
  return new BooleanLiteral(a.value < b.convert(a.unit).value);
}

export function lte(a: Numeric, b: Numeric) {
  return new BooleanLiteral(a.value <= b.convert(a.unit).value);
}

export function eq(a: Value, b: Value) {
  // repeated logic
  if (a.type !== b.type) {
    if (isStringish(a) && isStringish(b)) {
      return new BooleanLiteral(a.equalTo(b));
    }
    return new BooleanLiteral(false);
  }

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new BooleanLiteral(a.equalTo(b));
  }
  if (a.type === 'color' && b.type === 'color') {
    return new BooleanLiteral(a.equalTo(b));
  }
  if (a.type === 'list' && b.type === 'list') {
    return new BooleanLiteral(a.equalTo(b));
  }

  return new BooleanLiteral(a.equalTo(b as any));
}

export function neq(a: Value, b: Value) {
  return eq(a, b).negate();
}
