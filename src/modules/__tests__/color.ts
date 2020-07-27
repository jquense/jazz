import { css, evaluate } from '../../../test/helpers';

describe('module.color', () => {
  it('should convert between colors', async () => {
    expect(
      await evaluate(
        css`
          $color: rgb(50, 0, 0);

          .a {
            a: hsl($color);
            a: rgb($color);
          }
        `,
      ),
    ).toMatchCss(css`
      .a {
        a: hsl(0, 100%, 10%);
        a: rgb(50, 0, 0);
      }
    `);
  });

  describe('adjust', () => {
    it('should adjust values', async () => {
      expect(
        await evaluate(
          css`
            @from 'color' import * as color;

            .a {
              a: color.adjust(rgb(0, 0, 0), $red: 40);
              a: color.adjust(rgb(0, 10, 0), $blue: 60, $green: 50);
              a: color.adjust(hsl(200, 50%, 100%), $saturation: -20);
            }
          `,
        ),
      ).toMatchCss(css`
        .a {
          a: rgb(40, 0, 0);
          a: rgb(0, 60, 60);
          a: hsl(200, 30%, 100%);
        }
      `);
    });

    it('should clamp', async () => {
      expect(
        await evaluate(
          css`
            @from 'color' import * as color;

            .a {
              a: color.adjust(rgb(50, 0, 0), $red: 255);
              a: color.adjust(hsl(250, 10, 0), $hue: -360deg);
            }
          `,
        ),
      ).toMatchCss(css`
        .a {
          a: rgb(255, 0, 0);
          a: hsl(0, 10%, 0%);
        }
      `);
    });

    it('should not mutate', async () => {
      expect(
        await evaluate(
          css`
            @from 'color' import * as color;

            $color: rgb(50, 0, 0);

            .a {
              a: color.adjust($color, $blue: 255);
              a: color.adjust($color, $alpha: -0.5);
              a: $color;
            }
          `,
        ),
      ).toMatchCss(css`
        .a {
          a: rgb(50, 0, 255);
          a: rgba(50, 0, 0, 0.5);
          a: rgb(50, 0, 0);
        }
      `);
    });
  });
});
