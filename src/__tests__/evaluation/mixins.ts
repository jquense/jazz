import postcss from 'postcss';

import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';

describe('@mixin', () => {
  it('should evaluate exclusive loop', async () => {
    const scope = new Scope();
    const result = await evaluate(
      css`
        @mixin foo {
          color: red;
        }
      `,
      scope,
    );

    expect(result).toMatchCss(``);

    expect(scope.members).toEqual(
      new Map([
        [
          'foo',
          {
            type: 'mixin',
            source: undefined,
            node: expect.objectContaining(
              new Ast.CallableDeclaration(
                expect.objectContaining({ value: 'foo' }),
                [],
                [expect.objectContaining({ prop: 'color', value: 'red' })],
              ),
            ),
          },
        ],
      ]),
    );
  });
});
