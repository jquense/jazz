import { ArthimeticOperators, Operators } from '../Ast';
import {
  BinaryMathExpression,
  BooleanValue,
  MathFunctionValue,
  MathValue,
  NumericValue,
  Value,
  isCalcValue,
} from '../Values';

export const isMathValue = (term: Value): term is MathValue =>
  term.type === 'numeric' ||
  term.type === 'math-function' ||
  (term.type === 'string' && term.isVarCall);

export const isResolvableToNumeric = (fn: Value): fn is MathFunctionValue =>
  fn.type === 'math-function';

export const isArithmeticOperator = (
  op: Operators,
): op is ArthimeticOperators =>
  op === '+' ||
  op === '-' ||
  op === '*' ||
  op === '/' ||
  op === '%' ||
  op === '**';

export const isShortCircuitOperator = (op: Operators): op is 'and' | 'or' =>
  op === 'and' || op === 'or';

const throwIrreducable = (a: MathValue, b: MathValue) => {
  throw new Error(
    `The terms ${a} and ${b} cannot be reduced without producing a calc() expression`,
  );
};

const assertValidMathFunctionValue = (a: MathValue) => {
  if (a.type === 'string' && !a.isVarCall)
    throw new Error(`The function ${a} is not valid in a Math expression`);
};

export function add(a: MathValue, b: MathValue, mustReduce = false) {
  if (a.type === 'numeric' && b.type === 'numeric') {
    if (NumericValue.compatible(a, b) || mustReduce) {
      const result = b.convert(a.unit);
      result.value = a.value + result.value;
      return result;
    }
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunctionValue(a);
  assertValidMathFunctionValue(b);

  if (isCalcValue(a)) a = a.args[0] as any;
  if (isCalcValue(b)) b = b.args[0] as any;

  return new MathFunctionValue('calc', new BinaryMathExpression(a, '+', b));
}

export function subtract(a: MathValue, b: MathValue, mustReduce = false) {
  if (a.type === 'numeric' && b.type === 'numeric') {
    if (NumericValue.compatible(a, b) || mustReduce) {
      const result = b.convert(a.unit);
      result.value = a.value - result.value;
      return result;
    }
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunctionValue(a);
  assertValidMathFunctionValue(b);

  if (isCalcValue(a)) a = a.args[0] as any;
  if (isCalcValue(b)) b = b.args[0] as any;

  return new MathFunctionValue('calc', new BinaryMathExpression(a, '-', b));
}

export function multiply(a: MathValue, b: MathValue, mustReduce = false) {
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
        `Cannot multiply ${a} by ${b} because both terms contain units, which would produce an invalid CSS value`,
      );
    }

    return new NumericValue(a.value * b.value, a.unit || b.unit);
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunctionValue(a);
  assertValidMathFunctionValue(b);

  if (isCalcValue(a)) a = a.args[0] as any;
  if (isCalcValue(b)) b = b.args[0] as any;
  return new MathFunctionValue('calc', new BinaryMathExpression(a, '*', b));
}

export function divide(a: MathValue, b: MathValue, mustReduce = false) {
  if (a.type === 'numeric' && b.type === 'numeric') {
    const nextUnit = b.unit === a.unit ? undefined : a.unit;
    // only allow unit math that would produce valid CSS values, meh
    if (b.unit && b.unit !== a.unit) {
      throw new Error(
        `Cannot divide ${a} by ${b} because ${b} contains units that would produce an invalid CSS value`,
      );
    }
    return new NumericValue(a.value / b.value, nextUnit);
  }

  if (mustReduce) throwIrreducable(a, b);
  assertValidMathFunctionValue(a);
  assertValidMathFunctionValue(b);

  if (isCalcValue(a)) a = a.args[0] as any;
  if (isCalcValue(b)) b = b.args[0] as any;
  return new MathFunctionValue('calc', new BinaryMathExpression(a, '/', b));
}

export function pow(a: MathValue, b: MathValue) {
  if (b.type === 'numeric' && b.unit)
    throw new Error(`Cannot raise ${a} to ${b} because ${b} is not unitless`);

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new NumericValue(a.value ** b.value, a.unit);
  }

  throw new Error(`One or more terms is not a number`);
}

export function mod(a: MathValue, b: MathValue) {
  if (b.type === 'numeric' && b.unit)
    throw new Error(
      `Cannot evaluate ${a} % ${b} because ${b} is not unitless`,
    );

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new NumericValue(a.value % b.value, a.unit);
  }

  throw new Error(`One or more terms is not a number`);
}

export function min(terms: MathValue[], mustReduce = false) {
  let current: NumericValue | null = null;

  const getExpression = () => {
    if (!mustReduce) return new MathFunctionValue('min', terms);
    throw new Error(
      `Cannot evaluate the min of ${terms.join(
        ',',
      )} because at least one term is not numeric and would procude a runtime min() expression`,
    );
  };

  for (const term of terms) {
    if (term.type !== 'numeric') return getExpression();

    if (current) {
      if (NumericValue.compatible(current, term)) {
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

export function max(terms: MathValue[], mustReduce = false) {
  let current: NumericValue | null = null;

  const getExpression = () => {
    if (!mustReduce) return new MathFunctionValue('max', terms);
    throw new Error(
      `Cannot evaluate the max of ${terms.join(
        ',',
      )} because at least one term is not numeric and would procude a runtime max() expression`,
    );
  };

  for (const term of terms) {
    if (term.type !== 'numeric') return getExpression();

    if (current) {
      if (NumericValue.compatible(current, term)) {
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

export function clamp([minVal, val, maxVal]: MathValue[], mustReduce = false) {
  const result = max([min([maxVal, val], mustReduce), minVal], mustReduce);
  if (result.type === 'numeric') return result;
  return new MathFunctionValue('clamp', [minVal, val, maxVal]);
}

export function gt(a: NumericValue, b: NumericValue) {
  return new BooleanValue(a.value > b.convert(a.unit).value);
}

export function gte(a: NumericValue, b: NumericValue) {
  return new BooleanValue(a.value >= b.convert(a.unit).value);
}

export function lt(a: NumericValue, b: NumericValue) {
  return new BooleanValue(a.value < b.convert(a.unit).value);
}

export function lte(a: NumericValue, b: NumericValue) {
  return new BooleanValue(a.value <= b.convert(a.unit).value);
}

export function eq(a: Value, b: Value) {
  // repeated logic
  if (a.type !== b.type) {
    if (a.type === 'string' && b.type === 'string') {
      return new BooleanValue(a.equalTo(b));
    }
    return new BooleanValue(false);
  }

  if (a.type === 'numeric' && b.type === 'numeric') {
    return new BooleanValue(a.equalTo(b));
  }
  if (a.type === 'color' && b.type === 'color') {
    return new BooleanValue(a.equalTo(b));
  }
  if (a.type === 'list' && b.type === 'list') {
    return new BooleanValue(a.equalTo(b));
  }
  if (a.type === 'map' && b.type === 'map') {
    return new BooleanValue(a.equalTo(b));
  }

  return new BooleanValue(a.equalTo(b as any));
}

export function neq(a: Value, b: Value) {
  return eq(a, b).negate();
}
