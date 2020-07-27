import { css, evaluate } from '../../../test/helpers';

describe('expressions', () => {
  it('should evaluate expressions correctly', async () => {
    const result = await evaluate(css`
      a: not 1;
      b: 1 + 3 and 'hi';
      c: not null and 1px;
      d: not true or 'yo';
      e: -1 or $foo; // undefined var not evaluated
      f: +-1;
      g: red == hsl(0, 100%, 50%);
    `);

    expect(result).toMatchCss(css`
      a: false;
      b: 'hi';
      c: 1px;
      d: 'yo';
      e: -1;
      f: -1;
      g: true;
    `);
  });

  async function shouldThrow(expected: any, expr: string) {
    await expect(evaluate(`a: ${expr};`)).rejects.toThrowError(expected);
  }

  test.each([
    ['"-" only operates on numbers and null is not a number', '-(null)'],
    [
      'min(1px, 2em) <= 3px contains unresolvable math expressions',
      'min(1px, 2em) <= 3px',
    ],

    // ['The "-" operator', '-(null)'],
  ])('should throw %s', shouldThrow);
});
