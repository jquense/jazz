import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../parsers/Ast';

describe('if/else evaluation', () => {
  it('should evaluate @if', async () => {
    expect(
      await evaluate(css`
        .foo {
          @if 5px >= 2px {
            color: blue;
          } @else {
            color: red;
          }
        }
      `),
    ).toMatchCss(`.foo { color: blue }`);
  });

  it('should evaluate strings @if', async () => {
    expect(
      await evaluate(css`
        .foo {
          @if 'foo' == foo {
            a: a;
          }
          @if foo == foo {
            b: b;
          }
          @if 'foo' == 'foo' {
            c: c;
          }
          @if 'foo' != 'bar' {
            d: d;
          }
        }
      `),
    ).toMatchCss(css`
      .foo {
        a: a;
        b: b;
        c: c;
        d: d;
      }
    `);
  });

  it('should evaluate strings @else if', async () => {
    expect(
      await evaluate(css`
        .foo {
          @if 'bar' == foo {
            a: a;
          } @else if baz == 'foo' {
            b: b;
          } @else if foo == foo {
            c: c;
          } @else {
            f: f;
          }
        }
      `),
    ).toMatchCss(css`
      .foo {
        c: c;
      }
    `);
  });

  // it('should evaluate colors', async () => {
  //   const { css } = await evaluate(`
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
    expect(
      await evaluate(css`
        .foo {
          @if 10px <= 2px {
            color: blue;
          } @else {
            color: red;
          }
        }
      `),
    ).toMatchCss(`.foo { color: red }`);
  });

  it('should convert between units', async () => {
    expect(
      await evaluate(css`
        .foo {
          @if 1in == 96px {
            color: blue;
          }
        }
      `),
    ).toMatchCss(`.foo { color: blue }`);
  });

  // it('should not shadow', async () => {
  //   const { css } = await evaluate(`
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
    expect(await evaluate(`.a { @if ${expression} { a: true } }`)).toMatchCss(
      `.a { a: true }`,
    );
  });

  it('should throw on unresolvable calc', async () => {
    await expect(
      evaluate(`.a { @if calc(5em + 2px) == 12px { a: true } }`),
    ).rejects.toThrow(
      'Cannot evaluate calc(5em + 2px) == 12px. ' +
        'Math functions must be resolvable when combined outside of another math function',
    );
  });
});
