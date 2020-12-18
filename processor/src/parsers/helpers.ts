import Parser from '.';
import { MathFunctionValue } from '../Values';
import interleave from '../utils/interleave';

export function calc(
  strings: TemplateStringsArray,
  ...values: MathFunctionValue[]
): MathFunctionValue {
  const parser = new Parser();

  const innerCalcs = interleave(
    strings,
    values.map((v) => v.toString(true)),
  ).join('');
  return new MathFunctionValue(
    'calc',
    parser.parse(innerCalcs, {
      startRule: 'ExpressionWithDivision',
      source: false,
    }),
  );
}
