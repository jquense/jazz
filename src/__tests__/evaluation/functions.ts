import { css, evaluate } from '../../../test/helpers';
import * as Ast from '../../parsers/Ast';

describe('function evaluation', () => {
  it('should leave unknown funcs alone', async () => {
    expect(
      await evaluate(
        css`
          .foo {
            color: rgb(1 2 4 / 1);
          }
        `,
      ),
    ).toMatchCss(css`
      .foo {
        color: rgb(1 2 4 / 1);
      }
    `);
  });

  it('should import builtins', async () => {
    expect(
      await evaluate(
        css`
          @from 'math' import * as math;

          .foo {
            width: math.round(math.multiply(1.251px, math.$PI));
          }
        `,
      ),
    ).toMatchCss(css`
      .foo {
        width: 4px;
      }
    `);
  });
});
