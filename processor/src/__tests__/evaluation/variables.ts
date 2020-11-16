import { css, evaluate } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import Scope from '../../Scope';
import { RgbValue, StringValue } from '../../Values';

describe('variable evaluation', () => {
  it('should replace variables in declarations', async () => {
    const scope = new Scope();

    expect(
      await evaluate(
        css`
          @export $color: red;
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
      new ModuleMembers([
        [
          '$color',
          expect.objectContaining({
            node: new RgbValue('red'),
          }),
        ],
        [
          '$name',
          expect.objectContaining({
            node: new StringValue('a'),
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

  it('should handle scoping', async () => {
    expect(
      await evaluate(css`
        $first: blue;
        $first: red;

        .a {
          a: $first;
        }

        $first: orange;

        .b {
          a: $first;
        }
        .c {
          $first: blue;
          $num: 0;

          @if 1 + 3 == 4 {
            $first: purple;

            @each $i in 1 through 3 {
              $num: $num + 1;
            }
          }
          a: $first;
          b: $num;
        }
        .d {
          a: $first;
        }
      `),
    ).toMatchCss(css`
      .a {
        a: red;
      }

      .b {
        a: orange;
      }
      .c {
        a: purple;
        b: 3;
      }
      .d {
        a: orange;
      }
    `);
  });
});
