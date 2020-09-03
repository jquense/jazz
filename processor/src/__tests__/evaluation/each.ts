import { css, evaluate } from '../../../test/helpers';

describe('@each loop', () => {
  it('should evaluate exclusive loop', async () => {
    const result = await evaluate(css`
      @each $i in 0 to 10 {
        a: $i;
      }
    `);

    expect(result).toMatchCss(`
      a: 0;
      a: 1;
      a: 2;
      a: 3;
      a: 4;
      a: 5;
      a: 6;
      a: 7;
      a: 8;
      a: 9
    `);
  });

  it('should evaluate inclusive loop', async () => {
    const result = await evaluate(css`
      @each $i in 0 through 5 {
        a: $i;
      }
    `);

    expect(result).toMatchCss(`
      a: 0;
      a: 1;
      a: 2;
      a: 3;
      a: 4;
      a: 5
    `);
  });

  it('should start from', async () => {
    const result = await evaluate(css`
      @each $i in 3 through 5 {
        a: $i;
      }
    `);

    expect(result).toMatchCss(`
      a: 3;
      a: 4;
      a: 5
    `);
  });

  it('should iterate over lists', async () => {
    const result = await evaluate(css`
      @each $i in (1 2 3) {
        a: $i;
      }
    `);

    expect(result).toMatchCss(`
      a: 1;
      a: 2;
      a: 3
    `);
  });

  it('should destructure nested lists', async () => {
    const result = await evaluate(css`
      @each $i, $j in (1 2, 3 4, 5 6) {
        a: $i $j;
      }
    `);

    expect(result).toMatchCss(`
      a: 1 2;
      a: 3 4;
      a: 5 6
    `);
  });

  it('should destructure nested maps', async () => {
    const result = await evaluate(css`
      @each $i, $j in (1: 2, 3: 4, 5: 6) {
        a: $i $j;
      }
    `);

    expect(result).toMatchCss(`
      a: 1 2;
      a: 3 4;
      a: 5 6
    `);
  });

  it('should leave undefined members', async () => {
    const result = await evaluate(css`
      @each $i, $j in (1, 3, 5) {
        a: $i $j;
      }
    `);

    expect(result).toMatchCss(`
      a: 1;
      a: 3;
      a: 5
    `);
  });

  it('should maintain scope', async () => {
    const result = await evaluate(css`
      $a: 1;

      @each $i in 3 through 5 {
        a: calc($i + $a);
      }
    `);

    expect(result).toMatchCss(`
      a: 4;
      a: 5;
      a: 6
    `);
  });

  it('should not leak scope', async () => {
    await expect(
      evaluate(css`
        @each $i in 3 through 5 {
          a: $i;
        }

        .foo {
          b: $i;
        }
      `),
    ).rejects.toThrowError('Variable not defined $i');
  });
});
