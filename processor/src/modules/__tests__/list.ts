import { css, evaluate } from '../../../test/helpers';

describe('module.list', () => {
  it('should return separator', async () => {
    expect(
      await evaluate(
        css`
          @use 'list' import separator;

          .a {
            a: separator((1, 2, 4)) == ',';
            a: separator((1 2 4)) == ' ';
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: true;
        a: true;
      }
    `);
  });

  it('list.entries()', async () => {
    expect(
      await evaluate(
        css`
          @use 'list' import entries;

          .a {
            @each $idx, $num in entries(10 to 15) {
              #{$idx}: $num;
            }
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        0: 10;
        1: 11;
        2: 12;
        3: 13;
        4: 14;
      }
    `);
  });
});
