import postcss from 'postcss';

import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';

describe('@mixin', () => {
  it('should declare a mixin', async () => {
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

    expect(scope.members.get('foo')).toEqual({
      type: 'mixin',
      source: undefined,
      node: new Ast.CallableDeclaration(
        new Ast.Ident('foo'),
        [],
        [expect.objectContaining({ prop: 'color', value: 'red' })],
      ),
    });
  });

  async function testParams(input: string, expected: Ast.Node[]) {
    const scope = new Scope();
    await evaluate(
      css`
        @mixin a(${input}) {
          color: red;
        }
      `,
      scope,
    );
    expect(scope.getMixin('a')!.node.params).toEqual(expected);
  }

  test.each([
    ['$a', [new Ast.Parameter(new Ast.Variable('a'))]],

    [
      '$a: 1px + 2px',
      [
        new Ast.Parameter(
          new Ast.Variable('a'),
          new Ast.BinaryExpression(
            new Ast.Numeric(1, 'px'),
            new Ast.Operator('+'),
            new Ast.Numeric(2, 'px'),
          ),
        ),
      ],
    ],
    [
      '$a: 1px, $b: $c',
      [
        new Ast.Parameter(new Ast.Variable('a'), new Ast.Numeric(1, 'px')),
        new Ast.Parameter(new Ast.Variable('b'), new Ast.Variable('c')),
      ],
    ],
    [
      '$a: 1px, $b, $c...',
      [
        new Ast.Parameter(new Ast.Variable('a'), new Ast.Numeric(1, 'px')),
        new Ast.Parameter(new Ast.Variable('b')),
        new Ast.RestParameter(new Ast.Variable('c')),
      ],
    ],
  ])('%s', testParams);

  it.only('should include a mixin', async () => {
    const scope = new Scope();
    const result = await evaluate(
      css`
        @mixin foo($a: red) {
          .a {
            color: $a;
          }
        }

        @include foo();
      `,
      scope,
    );

    expect(result).toMatchCss(css`
      .a {
        color: red;
      }
    `);
  });
});
