import { Selectors, css, evaluate } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import Scope from '../../Scope';

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

  it('should unwrap scoping psuedos', async () => {
    expect(
      await evaluate(
        css`
          :global(.foo) > :local(.bar) {
            a: a;
          }
        `,
        { hash: true },
      ),
    ).toMatchCss(`
      .foo > .h_bar {
        a: a;
      }
    `);
  });

  it('should throw for invalid scopes', async () => {
    await expect(() =>
      evaluate(css`
        :global(.foo, .bar) {
          a: a;
        }
      `),
    ).rejects.toThrow(`Scope psuedo selectors must contain one selector`);
  });

  it('should throw for invalid scopes 2', async () => {
    await expect(() =>
      evaluate(css`
        :global(a.foo) {
          a: a;
        }
      `),
    ).rejects.toThrow(
      `Scope psuedo selectors must contain a single class selector`,
    );
  });

  describe('nesting', () => {
    async function processSelectorTestCase(
      _: string,
      input: string,
      expected: string,
    ) {
      expect(await evaluate(input)).toMatchCss(expected);
    }

    it('should throw for top level selectors', async () => {
      await expect(() =>
        evaluate(css`
          .a & {
            a: a;
          }
        `),
      ).rejects.toThrow(
        `Top-level selectors may not contain a parent selector "&".`,
      );
    });

    test.each([
      ['implicit unwrapping', `.a { .b {c:c;} }`, `.a .b {c:c;}`],
      ['simple parent', `.a { .b & {c:c;} }`, `.b .a {c:c;} `],
      ['parses empty', `.a {}`, ``],
      ['leave important empty comment', `.a {/*!*/}`, `.a {/*!*/}`],
      ['leave important  comment', `.a {/*! hi */}`, `.a {/*! hi */}`],
      ['removes when empty', `.a {/* hi */}`, ``],
      [
        'parent prefix',
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
        'parent suffix',
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
        'parent list, prefix and suffix',
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
        'multiple levels of nesting',
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
        'selector in pseudo',
        css`
          a {
            b:not(&.c) {
              d: d;
            }
          }
        `,
        css`
          b:not(a.c) {
            d: d;
          }
        `,
      ],
      [
        'mixed selector with pseudo',
        css`
          a {
            & b:not(&.c) {
              d: d;
            }
          }
        `,
        css`
          a b:not(a.c) {
            d: d;
          }
        `,
      ],
      [
        'parent in none selector pseudo',
        css`
          a {
            & b:another(&.c) {
              d: d;
            }
          }
        `,
        css`
          a b:another(&.c) {
            d: d;
          }
        `,
      ],

      [
        'unwraps @media',
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
        'unwraps multiple at rules',
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
        'handles keyframes',
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
    ])('%s', processSelectorTestCase);
  });

  describe('placeholders', () => {
    it('should replace placeholders', async () => {
      expect(
        await evaluate(
          css`
            @from './other' import %foo;

            .bar > %foo {
              a: a;
            }
            .bar:not(%foo) {
              a: a;
            }
            .baz {
              %foo%foo {
                a: a;
              }
            }
          `,
          {
            hash: true,
            modules: [
              [
                'other',
                {
                  scope: new Scope(),
                  exports: new ModuleMembers([
                    [
                      '%foo',
                      {
                        type: 'class',
                        identifier: 'foo',
                        selector: Selectors.class`h_foo`,
                        composes: [],
                      },
                    ],
                  ]),
                },
              ],
            ],
          },
        ),
      ).toMatchCss(`
        .h_bar > .h_foo {
          a: a;
        }
        .h_bar:not(.h_foo) {
          a: a;
        }
        .h_baz .h_foo.h_foo {
          a: a;
        }
      `);
    });
  });
});
