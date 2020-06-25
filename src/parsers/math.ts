import {
  ArthimeticOperators,
  BinaryExpression,
  BooleanLiteral,
  CallExpression,
  Expression,
  MathCallExpression,
  Numeric,
  Operator,
  Operators,
  Value,
  isCalc,
  isStringish,
} from './Ast';

export type Term = Numeric | MathCallExpression | CallExpression;

export const isMathTerm = (term: Expression): term is Term =>
  term.type === 'numeric' ||
  term.type === 'math-call-expression' ||
  term.type === 'call-expression';

export const isResolvableToNumeric = (fn: Value): boolean =>
  fn.type === 'math-call-expression';

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

const assertValidMathCallExpression = (a: Term) => {
  if (a.type === 'call-expression' && !a.isVar)
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
  assertValidMathCallExpression(a);
  assertValidMathCallExpression(b);

  if (isCalc(a)) a = a.args.first as any;
  if (isCalc(b)) b = b.args.first as any;

  return new MathCallExpression(
    'calc',
    new BinaryExpression(a, new Operator('+'), b),
  );
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
  assertValidMathCallExpression(a);
  assertValidMathCallExpression(b);

  if (isCalc(a)) a = a.args.first as any;
  if (isCalc(b)) b = b.args.first as any;
  return new MathCallExpression(
    'calc',
    new BinaryExpression(a, new Operator('-'), b),
  );
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
  assertValidMathCallExpression(a);
  assertValidMathCallExpression(b);

  if (isCalc(a)) a = a.args.first as any;
  if (isCalc(b)) b = b.args.first as any;
  return new MathCallExpression(
    'calc',
    new BinaryExpression(a, new Operator('*'), b),
  );
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
  assertValidMathCallExpression(a);
  assertValidMathCallExpression(b);

  if (isCalc(a)) a = a.args.first as any;
  if (isCalc(b)) b = b.args.first as any;
  return new MathCallExpression(
    'calc',
    new BinaryExpression(a, new Operator('/'), b),
  );
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
    if (!mustReduce) return new MathCallExpression('min', terms);
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
    if (!mustReduce) return new MathCallExpression('max', terms);
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
  const result = max([min([maxVal, val], mustReduce), minVal], mustReduce);
  if (result.type === 'numeric') return result;
  return new MathCallExpression('clamp', [minVal, val, maxVal]);
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
