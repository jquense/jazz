import { css, evaluate } from '../../../test/helpers';

describe('module.string', () => {
  it('should quote', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.quote(Helvetica);
            a: string.quote('Helvetica');
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: 'Helvetica';
        a: 'Helvetica';
      }
    `);
  });

  it('should unquote', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.unquote('Helvetica');
            a: string.unquote('Helvetica');
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: Helvetica;
        a: Helvetica;
      }
    `);
  });

  it('should handle casing', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.to-lower-case('BOLD');
            b: string.to-upper-case(bold);
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: 'bold';
        b: BOLD;
      }
    `);
  });

  it('should index', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.index('Helvetica Neue', 'Helvetica');
            a: string.index('Helvetica Neue', 'Neue');
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: 0;
        a: 10;
      }
    `);
  });

  it('should slice', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.slice('Helvetica Neue', 10);
            a: string.slice('Helvetica Neue', 0, 3);
            a: string.slice('Helvetica Neue', 0, -5);
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: 'Neue';
        a: 'Hel';
        a: 'Helvetica';
      }
    `);
  });

  it('should insert', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            a: string.insert('Roboto Bold', ' Mono', 6);
            a: string.insert('Roboto Bold', ' Mono', -5);
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: 'Roboto Mono Bold';
        a: 'Roboto Mono Bold';
      }
    `);
  });

  it('should split', async () => {
    expect(
      await evaluate(
        css`
          @use 'string' as string;

          .a {
            $i: 0;
            @each $str in string.split('hi there how are you?', ' ') {
              $i: $i + 1;
              #{$i}: $str;
            }
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        1: 'hi';
        2: 'there';
        3: 'how';
        4: 'are';
        5: 'you?';
      }
    `);
  });
});
