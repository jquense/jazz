import { css, evaluate } from '../../../test/helpers';

describe('stylesheet', () => {
  it('should evaluate @atrule params', async () => {
    expect(
      await evaluate(
        css`
          $a: ~'max-width: 30px';

          @keyframes hi {
            to: {
              color: red;
            }
          }

          @keyframes :global(hi) {
            to: {
              color: red;
            }
          }

          @media (#{$a}) {
            c: a;
          }

          @counter-style #{something} {
            c: a;
          }

          .fade {
            animation: 1s hi;
          }
        `,
        { hash: true },
      ),
    ).toMatchCss(css`
      @keyframes h_hi {
        to: {
          color: red;
        }
      }

      @keyframes hi {
        to: {
          color: red;
        }
      }

      @media (max-width: 30px) {
        c: a;
      }

      @counter-style something {
        c: a;
      }

      .h_fade {
        animation: 1s h_hi;
      }
    `);
  });
});
