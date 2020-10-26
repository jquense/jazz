import { css, evaluate, process, Selectors } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import * as Callable from '../../Callable';
import Scope from '../../Scope';
import { StringValue } from '../../Values';

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

  it('should suggest function', async () => {
    await expect(() =>
      evaluate(
        css`
          $red: red;

          .foo {
            a: mins($numbers: pink);
          }
        `,
      ),
    ).rejects.toThrow(
      'Unexpected keyword argument, did you mean to call min instead?',
    );
  });

  it('should evaluate function arguments', async () => {
    expect(
      await evaluate(
        css`
          $red: red;

          .foo {
            a: linear-gradient($red, pink);
            b: unknown($red pink / 1px);
          }
        `,
      ),
    ).toMatchCss(css`
      .foo {
        a: linear-gradient(red, pink);
        b: unknown(red pink / 1px);
      }
    `);
  });

  it('should import builtins', async () => {
    expect(
      await evaluate(
        css`
          @use 'math' as math;

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
            @use 'color' import ( lightness, alpha, adjust );

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

  it('scopes parameters correctly', async () => {
    const { css: result } = await process(
      css`
        $a: blue;
        @use './other' as o;

        .d {
          a: o.my-func();
        }
      `,
      {
        modules: [
          [
            'other',
            {
              scope: new Scope(),
              exports: new ModuleMembers([
                [
                  'my-func',
                  {
                    type: 'function',
                    identifier: 'my-func',
                    callable: Callable.create(
                      'my-func',
                      '$a: red, $b: $a',
                      ({ a, b }) => {
                        // console.log(args);
                        return [a, b];
                      },
                    ),
                  },
                ],
              ]),
            },
          ],
        ],
      },
    );

    expect(result).toMatchCss(`
      .d {
        a: red, red;
      }
    `);
  });

  describe('user defined', () => {
    it('should work', async () => {
      expect(
        await evaluate(
          css`
            $red: red;

            @function is-red($color: $red) {
              @if $color == red {
                @return true;
              } @else {
                @return false;
              }
            }

            .foo {
              a: is-red(red);
              b: is-red(blue);
              c: is-red();
            }
          `,
        ),
      ).toMatchCss(css`
        .foo {
          a: true;
          b: false;
          c: true;
        }
      `);
    });

    it('should break from loops', async () => {
      expect(
        await evaluate(
          css`
            $red: red;

            @function my-func($color) {
              @if $color == red {
                @each $i in 0 through 10 {
                  @if $i >= 4 {
                    @return $i;
                  }
                }
              }
            }

            .foo {
              a: my-func(red);
            }
          `,
        ),
      ).toMatchCss(css`
        .foo {
          a: 4;
        }
      `);
    });

    it('should throw when no return value', async () => {
      await expect(() =>
        evaluate(css`
          @function is-red($color: $red) {
            @if $color == red {
              @return true;
            }
          }

          .a {
            a: is-red(blue);
          }
        `),
      ).rejects.toThrow('Function is-red did not return a value');
    });
  });
});
