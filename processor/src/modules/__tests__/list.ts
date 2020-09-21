import { css, evaluate } from '../../../test/helpers';

describe('module.string', () => {
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
});
