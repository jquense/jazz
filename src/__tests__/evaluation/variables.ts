import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';

describe('variable evaluation', () => {
  it('should replace variables in declarations', async () => {
    const scope = new Scope();

    expect(
      await evaluate(
        css`
          $color: red;
          $name: a;

          .foo {
            #{$name}: $color;
          }
        `,
        scope,
      ),
    ).toMatchCss(css`
      .foo {
        a: red;
      }
    `);

    expect(scope.members).toEqual(
      new Map([
        [
          '$color',
          expect.objectContaining({
            node: new Ast.Color('red'),
          }),
        ],
        [
          '$name',
          expect.objectContaining({
            node: new Ast.Ident('a'),
          }),
        ],
      ]),
    );
  });

  it('should resolve interpolations', async () => {
    expect(
      await evaluate(css`
        $prefix: -webkit-;

        .foo {
          #{$prefix}transition: all 5s;
          a: ~'#{$prefix}transition';
        }
      `),
    ).toMatchCss(css`
      .foo {
        -webkit-transition: all 5s;
        a: -webkit-transition;
      }
    `);
  });

  it('should resolve parent selector references', async () => {
    expect(
      await evaluate(css`
        .a {
          .b#{&} {
            content: '#{&}';
            other: &;
          }
        }
      `),
    ).toMatchCss(css`
      .a .b.a {
        content: '.a .b.a';
        other: .a .b.a;
      }
    `);
  });
});
