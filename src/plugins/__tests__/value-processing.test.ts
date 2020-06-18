import postcss from 'postcss';

import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';
import plugin from '../value-processing';

describe('value-processing', () => {
  function run(css: string, scope = new Scope()) {
    return postcss([require('../at-from').default, plugin]).process(css, {
      parser: require('postcss-scss'),
      from: './foo.js',
      files: { './foo.js': { scope } },
    } as any);
  }

  it('should replace variables in declarations', async () => {
    const scope = new Scope();

    const { css } = await run(
      `
        $color: red;

        .foo {
          color: $color;
        }
      `,
      scope,
    );

    expect(css).toMatchCss(`
      .foo {
        color: red;
      }
    `);

    expect(scope.variables).toEqual({
      $color: {
        node: new Ast.Color('red'),
      },
    });
  });

  it('should resolve interpolations', async () => {
    const { css } = await run(
      `
        $prefix: -webkit-;

        .foo {
          #{$prefix}transition: all 5s;
          a: ~"#{$prefix}transition";
        }
      `,
    );

    expect(css).toMatchCss(`
      .foo {
        -webkit-transition: all 5s;
        a: -webkit-transition;
      }
    `);

    // expect(members.variables).toEqual({
    //   $color: new Ast.Color('red'),
    // });
  });

  describe('functions', () => {
    it('should leave unknown funcs alone', async () => {
      const { css } = await run(
        `
          .foo {
            color: rgb(1 2 4 / 1)
          }
        `,
      );

      expect(css).toMatchCss(`
        .foo {
          color: rgb(1 2 4 / 1)
        }
      `);
    });

    it('should import builtins', async () => {
      const { css } = await run(
        `
        @from 'math' import * as math;

        .foo {
          width: math.round(math.multiply(1.251px, math.$PI));
        }
      `,
      );

      expect(css).toMatchCss(`
        .foo {
          width: 4px;
        }
      `);
    });
  });

  describe('calc', () => {
    describe('reduces fully', () => {
      it.each([
        ['calc((1px * (10 + 10)) / 2)', '10px'],
        ['calc(1px * 10)', '10px'],
        ['calc(1 * 10px)', '10px'],

        ['calc(min($a, 20px + 30px) * 1)', '10px'],
        ['calc(max(5cm, 30mm + 3cm, 1mm) + 60mm)', '12cm'],
        ['calc(clamp(2px, $a * 2, 15px))', '15px'],

        ['calc(-$a * 10)', '-100px'],

        ['calc(calc(1 + /* 4 + */ 4) * 10px)', '50px'],
        ['calc(calc(1 + 4px) * 10)', '50px'],
      ])('%s -> %s', async (input, expected) => {
        const { css } = await run(`
          $a: 10px;
          $b: 3%;

          .foo { width: ${input}; }
        `);

        expect(css).toMatchCss(`.foo { width: ${expected}; }`);
      });
    });

    describe('reduces as much as possible', () => {
      it.each([
        ['calc((10 + 10) * 1px + 100vh)', 'calc(20px + 100vh)'],
        ['calc(-$a + 100vh)', 'calc(-10px + 100vh)'],
        ['calc(var(--foo) + 100vh)', 'calc(var(--foo) + 100vh)'],
        ['calc((10px + 10px) + 100vh)', 'calc(20px + 100vh)'],
        ['calc($c + 100vh)', 'calc(1em + 10px + 100vh)'],
        ['calc(-$c + 100vh)', 'calc(-1 * (1em + 10px) + 100vh)'],

        [
          'calc(max($a, $b + 30px, 4vw) * 1)',
          'calc(max(10px, 3% + 30px, 4vw) * 1)',
        ],
      ])('%s -> %s', async (input, expected) => {
        const { css } = await run(`
          $a: 10px;
          $b: 3%;
          $c: calc(1em + 10px);

          .foo { width: ${input}; }
        `);

        expect(css).toMatchCss(`.foo { width: ${expected}; }`);
      });
    });

    describe('converts between units', () => {
      it.each([
        ['calc(1meh + 2px)', 'calc(1meh + 2px)'],
        ['calc(1px + 2meh)', 'calc(1px + 2meh)'],
        ['calc(1q + 10pc)', '170.33333q'],
        ['calc(1.1E+1px + 1.1E+1px)', '22px'],
        ['calc(9e+1% + 10%)', '100%'],
      ])('%s -> %s', async (input, expected) => {
        const { css } = await run(`.foo { width: ${input}; }`);

        expect(css).toMatchCss(`.foo { width: ${expected}; }`);
      });
    });

    it('should reduce calc as much as possible', async () => {
      const { css } = await run(`
        .foo {
          width: calc(1px * (10 + 10) + 100vh);
        }
      `);

      expect(css).toMatchCss(`
        .foo {
          width: calc(20px + 100vh);
        }
      `);
    });

    it('should reduce with variables', async () => {
      const { css } = await run(`
        $width: calc(1px * 2);

        .foo {
          width: calc($width + 100vh);
        }
      `);

      expect(css).toMatchCss(`
        .foo {
          width: calc(2px + 100vh);
        }
      `);
    });

    it('should thow on invalid terms', async () => {
      await expect(
        run(`
          $width: red;

          .foo {
            width: calc($width + 100vh);
          }
        `),
      ).rejects.toThrowError(
        'Cannot evaluate $width + 100vh (evaluated as: red + 100vh). Some terms are not numerical',
      );
    });

    it.each([
      [
        'calc(100vh / 1px)',
        'Cannot divide 100vh by 1px because 1px is not unitless',
      ],
      [
        'calc(100vh * 1px)',
        'Cannot multiply 100vh by 1px because both terms contain units',
      ],
      [
        'calc(100vh % 1px)',
        'Cannot evaluate 100vh % 1px because 1px is not unitless',
      ],
      [
        'calc(100vh + (not 1px))',
        'Only arithmetic is allowed in a CSS calc() function not `not 1px` which would produce a Boolean, not a number',
      ],
    ])('should throw on bad math: %s', async (calc, expected) => {
      await expect(
        run(`
          .foo {
            width: ${calc};
          }
        `),
      ).rejects.toThrowError(expected);
    });

    it.each([
      ['calc(100vh ** calc(1px - 1em))', 'One or more terms is not a number'],
      ['calc(100vh % calc(1px - 1em))', 'One or more terms is not a number'],
    ])('should thow on invalid calc results', async (calc, expected) => {
      await expect(
        run(`
          .foo {
            width: ${calc};
          }
        `),
      ).rejects.toThrowError(expected);
    });
  });

  describe('@if/@else', () => {
    it('should evaluate @if', async () => {
      const { css } = await run(`
        .foo {
          @if 5px >= 2px {
            color: blue
          } @else {
            color: red
          }
        }
      `);

      expect(css).toMatchCss(`.foo { color: blue }`);
    });

    it('should evaluate strings @if', async () => {
      const { css } = await run(`
        .foo {
          @if 'foo' == foo {
            a: a
          }
          @if foo == foo {
            b: b
          }
          @if 'foo' == "foo" {
            c: c
          }
          @if 'foo' != 'bar' {
            d: d
          }
        }
      `);

      expect(css).toMatchCss(`.foo {
        a: a;
        b: b;
        c: c;
        d: d
      }`);
    });

    it('should evaluate strings @else if', async () => {
      const { css } = await run(`
        .foo {
          @if 'bar' == foo {
            a: a
          }
          @else if baz == 'foo' {
            b: b
          } @else if foo == foo {
            c: c
          } @else {
            f: f
          }
        }
      `);

      expect(css).toMatchCss(`.foo {
        c: c
      }`);
    });

    // it('should evaluate colors', async () => {
    //   const { css } = await run(`
    //     .foo {
    //       @if hsl(34, 35%, 92.1%) == #f2ece4 {
    //         a: a
    //       }
    //     }
    //   `);

    //   expect(css).toMatchCss(`.foo {
    //     a: a;
    //   }`);
    // });

    it('should use else block @if', async () => {
      const { css } = await run(`
        .foo {
          @if 10px <= 2px {
            color: blue
          } @else {
            color: red
          }
        }
      `);

      expect(css).toMatchCss(`.foo { color: red }`);
    });

    it('should convert between units', async () => {
      const { css } = await run(`
        .foo {
          @if 1in == 96px {
            color: blue
          }
        }
      `);

      expect(css).toMatchCss(`.foo { color: blue }`);
    });

    // it('should not shadow', async () => {
    //   const { css } = await run(`
    //     .foo {
    //       @if 1in == 96px {
    //         color: blue
    //       }
    //     }
    //   `);

    //   expect(css).toMatchCss(`.foo { color: blue }`);
    // });

    it.each([
      ['5px + 10px > 4'],
      ['(null or 5px) == 5px'],
      ['(5px or false) == 5px'],
      ['false or 5px == 5px'],
      ['(5px and 6em) == 6em'],
      ['10 % 3 == 1'],
      ['(10px) == 10'],
      ['(10,) != 10'],
      ['(10, 10) == (10, 10)'],
      ['(10, 10) != [10, 10]'],
      ['(10, 10) != (10 10)'],
      ['(10, 10) != (10 / 10)'],

      ['96px == 1in'],
      ['(10: 96px, "foo": bar) == (10: 1in, foo: "bar")'],

      ['5px + calc(5px + 2px) == 12px'],
    ])('is true:  %s', async (expression) => {
      const { css } = await run(`.a { @if ${expression} { a: true } }`);

      expect(css).toMatchCss(`.a { a: true }`);
    });

    it('should throw on unresolvable calc', async () => {
      await expect(
        run(`.a { @if calc(5em + 2px) == 12px { a: true } }`),
      ).rejects.toThrow(
        'Cannot evaluate calc(5em + 2px) == 12px. ' +
          'Math functions must be resolvable when combined outside of another math function',
      );
    });
  });

  describe('@each loop', () => {
    it('should evaluate exclusive loop', async () => {
      const { css } = await run(`
        @each $i in 0 to 10 {
          a: $i
        }
      `);

      expect(css).toMatchCss(`
        a: 0;
        a: 1;
        a: 2;
        a: 3;
        a: 4;
        a: 5;
        a: 6;
        a: 7;
        a: 8;
        a: 9
      `);
    });

    it('should evaluate inclusive loop', async () => {
      const { css } = await run(`
        @each $i in 0 through 5 {
          a: $i
        }
      `);

      expect(css).toMatchCss(`
        a: 0;
        a: 1;
        a: 2;
        a: 3;
        a: 4;
        a: 5
      `);
    });

    it('should start from', async () => {
      const { css } = await run(`
        @each $i in 3 through 5 {
          a: $i
        }
      `);

      expect(css).toMatchCss(`
        a: 3;
        a: 4;
        a: 5
      `);
    });

    it('should iterate over lists', async () => {
      const { css } = await run(`
        @each $i in (1 2 3) {
          a: $i
        }
      `);

      expect(css).toMatchCss(`
        a: 1;
        a: 2;
        a: 3
      `);
    });

    it('should destructure nested lists', async () => {
      const { css } = await run(`
        @each $i, $j in (1 2, 3 4, 5 6) {
          a: $i $j
        }
      `);

      expect(css).toMatchCss(`
        a: 1 2;
        a: 3 4;
        a: 5 6
      `);
    });

    it('should destructure nested maps', async () => {
      const { css } = await run(`
        @each $i, $j in (1: 2, 3: 4, 5: 6) {
          a: $i $j
        }
      `);

      expect(css).toMatchCss(`
        a: 1 2;
        a: 3 4;
        a: 5 6
      `);
    });

    it('should leave undefined members', async () => {
      const { css } = await run(`
        @each $i, $j in (1, 3, 5) {
          a: $i $j
        }
      `);

      expect(css).toMatchCss(`
        a: 1;
        a: 3;
        a: 5
      `);
    });

    it('should maintain scope', async () => {
      const { css } = await run(`
        $a: 1;

        @each $i in 3 through 5 {
          a: calc($i + $a);
        }
      `);

      expect(css).toMatchCss(`
        a: 4;
        a: 5;
        a: 6
      `);
    });

    it('should not leak scope', async () => {
      await expect(
        run(`
          @each $i in 3 through 5 {
            a: $i
          }

          .foo { b: $i; }
        `),
      ).rejects.toThrowError('Variable not defined $i');
    });
  });

  describe('selectors', () => {
    it('should resolve selectors', async () => {
      const { css } = await run(`
        $a: ~'.a';
        $b: disabled;

        #{$a} .b > c[#{$b}], #{$a}-child {
          a: a;
        }
      `);

      expect(css).toMatchCss(`
        .a .b > c[disabled], .a-child {
          a: a;
        }
      `);
    });

    describe('nesting', () => {
      async function processSelectorTestCase([input, expected]: [
        string,
        string,
      ]) {
        const { css } = await run(input);
        console.log(css);
        expect(css).toMatchCss(expected);
      }

      it.only('should resolve nesting', () => {
        return Promise.all(
          [
            // [`.a { .b {} }`, `.a { .a .b {} }`],
            // [`.a { .b & {} }`, `.a { .b .a {} }`],
            [
              `
                .a,
                .b {
                  &-c {
                    d: d
                  }
                }
              `,
              `.a, .b {
                .a-c, .b-c {}
               }`,
            ],
          ].map(processSelectorTestCase),
        );
      });
    });
  });
  // it('should complain about redefining', async () => {
  //   const values = {};

  //   await expect(() =>
  //     run(
  //       `
  //       $foo: red;
  //       $foo: blue;
  //     `,
  //       values,
  //     ),
  //   ).rejects.toThrowError('Cannot redefine an existing variable: $foo');
  // });
});
