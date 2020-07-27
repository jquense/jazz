import Parser from '.';
import interleave from '../utils/interleave';
import { MathCallExpression } from '../Ast';

export function calc(
  strings: TemplateStringsArray,
  ...values: MathCallExpression[]
): MathCallExpression {
  const parser = new Parser();

  const innerCalcs = interleave(
    strings,
    values.map((v) => MathCallExpression.withContext(() => v.toString())),
  ).join('');
  return new MathCallExpression(
    'calc',
    parser.parse(innerCalcs, {
      startRule: 'ExpressionWithDivision',
      source: false,
    }),
  );
}
