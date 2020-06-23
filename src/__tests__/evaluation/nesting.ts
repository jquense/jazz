import { css, evaluate } from '../../../test/helpers';

describe('selectors', () => {
  it('should resolve selectors', async () => {
    expect(
      await evaluate(css`
        $a: ~'.a';
        $b: disabled;

        #{$a} .b > c[#{$b}],
        #{$a}-child {
          a: a;
        }
      `),
    ).toMatchCss(`
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
      expect(await evaluate(input)).toMatchCss(expected);
    }

    it('should resolve in selectors', () => {
      return Promise.all(
        [
          [`.a { .b {} }`, `.a .b {}`],
          [`.a { .b & {} }`, `.b .a {} `],
          [
            css`
              .a {
                span& {
                  d: d;
                }
              }
            `,
            css`
              span.a {
                d: d;
              }
            `,
          ],
          [
            css`
              .a,
              .b {
                &-c {
                  d: d;
                }
              }
            `,
            css`
              .a-c,
              .b-c {
                d: d;
              }
            `,
          ],
          [
            css`
              a,
              b {
                f: f;

                foo-&-c {
                  d: d;
                }
              }
            `,
            css`
              a,
              b {
                f: f;
              }

              foo-a-c,
              foo-b-c {
                d: d;
              }
            `,
          ],
          [
            css`
              a {
                b {
                  c {
                    d: d;
                  }
                }
              }
            `,
            css`
              a b c {
                d: d;
              }
            `,
          ],

          [
            css`
              .a {
                @media() {
                  color: b;
                }
              }
            `,
            css`
              @media() {
                .a {
                  color: b;
                }
              }
            `,
          ],
          [
            css`
              .a {
                @media (max-width: 400px) {
                  @supports (color: red) {
                    b: b;

                    &.c {
                      d: d;
                    }
                  }
                }
              }
            `,
            css`
              @media (max-width: 400px) {
                @supports (color: red) {
                  .a {
                    b: b;
                  }

                  .a.c {
                    d: d;
                  }
                }
              }
            `,
          ],

          [
            css`
              .a {
                color: b;

                @keyframes foo {
                  from {
                  }
                  to {
                  }
                }
              }
            `,
            css`
              .a {
                color: b;
              }

              @keyframes foo {
                from {
                }
                to {
                }
              }
            `,
          ],
        ].map(processSelectorTestCase),
      );
    });
  });
});
