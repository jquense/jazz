import Parser from '.';
import interleave from '../utils/interleave';
import { Calc, MathCallExpression } from './Ast';

export function calc(strings: TemplateStringsArray, ...values: Calc[]): Calc {
  const parser = new Parser();

  const innerCalcs = interleave(
    strings,
    values.map((v) => MathCallExpression.withContext(() => v.toString())),
  ).join('');
  return new Calc(
    parser.parse(innerCalcs, {
      startRule: 'ExpressionWithDivision',
      source: false,
    }),
  );
}
