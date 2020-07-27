import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../Ast';
import Scope from '../../Scope';

describe('@mixin', () => {
  function t(input: string, expected: string) {
    return async () => {
      expect(await evaluate(input)).toMatchCss(expected);
    };
  }

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
      node: expect.objectContaining({
        type: 'atrule',
        name: 'mixin',
        mixin: new Ast.Ident('foo'),
        parameterList: new Ast.ParameterList(),
        nodes: [
          expect.objectContaining({
            prop: 'color',
            value: 'red',
          }),
        ],
      }),
    });
  });

  async function testParams(input: string, expected: Ast.ParameterList) {
    const scope = new Scope();
    await evaluate(
      css`
        @mixin a(${input}) {
          color: red;
        }
      `,
      scope,
    );
    expect(scope.getMixin('a')!.node.parameterList).toEqual(expected);
  }

  test.each([
    ['$a', new Ast.ParameterList([new Ast.Parameter(new Ast.Variable('a'))])],

    [
      '$a: 1px + 2px',
      new Ast.ParameterList([
        new Ast.Parameter(
          new Ast.Variable('a'),
          new Ast.BinaryExpression(
            new Ast.Numeric(1, 'px'),
            new Ast.Operator('+'),
            new Ast.Numeric(2, 'px'),
          ),
        ),
      ]),
    ],
    [
      '$a: 1px, $b: $c',
      new Ast.ParameterList([
        new Ast.Parameter(new Ast.Variable('a'), new Ast.Numeric(1, 'px')),
        new Ast.Parameter(new Ast.Variable('b'), new Ast.Variable('c')),
      ]),
    ],
    [
      '$a: 1px, $b, $c...',
      new Ast.ParameterList(
        [
          new Ast.Parameter(new Ast.Variable('a'), new Ast.Numeric(1, 'px')),
          new Ast.Parameter(new Ast.Variable('b')),
        ],
        new Ast.RestParameter(new Ast.Variable('c')),
      ),
    ],
  ])('%s', testParams);

  it(
    'should include mixin',
    t(
      css`
        @mixin foo($a: ~'re#{d}') {
          .a {
            color: $a;
          }
        }

        @include foo();
      `,
      css`
        .a {
          color: red;
        }
      `,
    ),
  );

  it(
    'should scope arguments correctly',
    t(
      css`
        @mixin foo($a: red, $b: $a) {
          .a {
            color: $b;
          }
        }

        @include foo();
      `,
      css`
        .a {
          color: red;
        }
      `,
    ),
  );

  it(
    'should spread out args',
    t(
      css`
        @mixin foo($values...) {
          .a {
            b: $values;
          }
        }

        @include foo(1, 2, 3);
      `,
      css`
        .a {
          b: 1, 2, 3;
        }
      `,
    ),
  );

  it(
    'should use content',
    t(
      css`
        @mixin foo($values...) {
          .a {
            b: $values;
            @content;
          }
        }
        $red: red;
        @include foo(1, 2, 3) {
          $blue: blue;
          c: $red $blue;
        }
      `,
      css`
        .a {
          b: 1, 2, 3;
          c: red blue;
        }
      `,
    ),
  );

  it(
    'should include in the right place',
    t(
      css`
        @mixin foo($color) {
          color: $color;
        }

        .a {
          color: blue;
          @include foo(red);
          width: 5px;
          @include foo(violet);
        }
      `,
      css`
        .a {
          color: blue;
          color: red;
          width: 5px;
          color: violet;
        }
      `,
    ),
  );
  it(
    'should include many',
    t(
      css`
        @mixin color($color) {
          color: $color;
        }

        @mixin square($size) {
          width: $size;
          height: $size;
        }

        .a {
          @include color(red), square(5px);
        }
      `,
      css`
        .a {
          color: red;
          width: 5px;
          height: 5px;
        }
      `,
    ),
  );
});
