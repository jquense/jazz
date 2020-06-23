import { css, evaluate } from '../../../test/helpers';

describe('calc evaluation', () => {
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
      const result = await evaluate(`
        $a: 10px;
        $b: 3%;

        .foo { width: ${input}; }
      `);

      expect(result).toMatchCss(`.foo { width: ${expected}; }`);
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
      expect(
        await evaluate(css`
          $a: 10px;
          $b: 3%;
          $c: calc(1em + 10px);

          .foo {
            width: ${input};
          }
        `),
      ).toMatchCss(`.foo { width: ${expected}; }`);
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
      expect(
        await evaluate(
          css`
            .foo {
              width: ${input};
            }
          `,
        ),
      ).toMatchCss(
        css`
          .foo {
            width: ${expected};
          }
        `,
      );
    });
  });

  it('should reduce calc as much as possible', async () => {
    expect(
      await evaluate(css`
        .foo {
          width: calc(1px * (10 + 10) + 100vh);
        }
      `),
    ).toMatchCss(css`
      .foo {
        width: calc(20px + 100vh);
      }
    `);
  });

  it('should reduce with variables', async () => {
    expect(
      await evaluate(css`
        $width: calc(1px * 2);

        .foo {
          width: calc($width + 100vh);
        }
      `),
    ).toMatchCss(css`
      .foo {
        width: calc(2px + 100vh);
      }
    `);
  });

  it('should thow on invalid terms', async () => {
    await expect(
      evaluate(`
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
      evaluate(`
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
      evaluate(`
        .foo {
          width: ${calc};
        }
      `),
    ).rejects.toThrowError(expected);
  });
});
