import Parser from '.';
import interleave from '../utils/interleave';
import { Calc, MathFunction } from './Ast';

export function calc(strings: TemplateStringsArray, ...values: Calc[]): Calc {
  const parser = new Parser();

  const innerCalcs = interleave(
    strings,
    values.map((v) => MathFunction.withContext(() => v.toString())),
  ).join('');
  return new Calc(
    parser.parse(innerCalcs, {
      startRule: 'ExpressionWithDivision',
      source: false,
    }),
  );
}
