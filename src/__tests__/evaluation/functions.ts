import { css, evaluate } from '../../../test/helpers';

describe('function evaluation', () => {
  it('should leave unknown funcs alone', async () => {
    expect(
      await evaluate(
        css`
          .foo {
            a: foo(1 2 4 / 0.5);
            b: bar(50%, 20%, 50%, 1);
          }
        `,
      ),
    ).toMatchCss(css`
      .foo {
        a: foo(1 2 4 / 0.5);
        b: bar(50%, 20%, 50%, 1);
      }
    `);
  });

  it('should import builtins', async () => {
    expect(
      await evaluate(
        css`
          @from 'math' import * as math;

          .foo {
            width: math.round($number: math.multiply(1.251px, math.$PI));
          }
        `,
      ),
    ).toMatchCss(css`
      .foo {
        width: 4px;
      }
    `);
  });

  describe('rgba', () => {
    it('should render as string correctly', async () => {
      expect(
        await evaluate(
          css`
            .foo {
              a: rgb(1 2 4 / 0.5);
              b: rgba(50%, 20%, 50%, 1);
            }
          `,
        ),
      ).toMatchCss(css`
        .foo {
          a: rgba(1, 2, 4, 0.5);
          b: rgb(128, 51, 128);
        }
      `);
    });

    test.each([
      [`rgba($red: 255, $alpha: 1)`, 'Missing argument $green'],
      [`rgba(155, 255)`, 'Missing argument $blue'],
      [`rgba(155 255)`, 'Missing argument $blue'],
      [`rgba(155 255 / 1)`, 'Missing argument $blue'],
    ])('%s should throw', async (input, expected) => {
      await expect(() => evaluate(`.a { a: ${input}; }`)).rejects.toThrow(
        expected,
      );
    });
  });

  describe('hsl', () => {
    it('should render as string correctly', async () => {
      expect(
        await evaluate(
          css`
            .foo {
              a: hsl(120, 100%, 40%);
              b: hsl(270 60% 50% / 0.15);
            }
          `,
        ),
      ).toMatchCss(css`
        .foo {
          a: hsl(120, 100%, 40%);
          b: hsla(270, 60%, 50%, 0.15);
        }
      `);
    });

    test.each([
      [`hsl($saturation: 255, $alpha: 1)`, 'Missing argument $hue'],
      [`hsl(155, 255)`, 'Missing argument $lightness'],
      [`hsl(155 255)`, 'Missing argument $lightness'],
      [`hsl(155 255 / 1)`, 'Missing argument $lightness'],
    ])('%s should throw', async (input, expected) => {
      await expect(() => evaluate(`.a { a: ${input}; }`)).rejects.toThrow(
        expected,
      );
    });
  });

  describe('color functions', () => {
    it('should work', async () => {
      expect(
        await evaluate(
          css`
            @from 'color' import ( lightness, alpha, adjust );

            .foo {
              a: lightness(hsl(120, 100%, 40%));
              b: alpha(rgb(1 2 4 / 0.5));
              c: adjust(hsl(120, 100%, 40%), $saturation: -10);
            }
          `,
        ),
      ).toMatchCss(css`
        .foo {
          a: 40%;
          b: 0.5;
          c: hsl(120, 90%, 40%);
        }
      `);
    });
  });
});
