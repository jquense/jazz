import * as Ast from '../../parsers/Ast';
import { evaluate } from '../evaluate';

describe('evaluate', () => {
  it('works', () => {
    expect(
      evaluate(
        new Ast.Expression([
          new Ast.Function(
            new Ast.Ident('darken'),
            new Ast.Expression([
              new Ast.Color('#fff'),
              new Ast.Separator(','),
              new Ast.Variable('amt'),
            ]),
          ),
        ]),
        {
          amt: { value: '5%' },
        },
      ),
    ).toEqual('darken(#fff, 5%)');
  });
});
