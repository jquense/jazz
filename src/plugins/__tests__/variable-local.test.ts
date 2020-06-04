import postcss from 'postcss';

import plugin from '../variable-local';

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

describe('variable-local', () => {
  function run(css: string, values = {}) {
    return postcss(plugin).process(css, {
      parser: require('postcss-scss'),
      from: './foo.js',
      files: { './foo.js': { values } },
    } as any);
  }

  it('should collect values', async () => {
    const values = {};

    await run(
      `
        $foo: red;
        $baz: $foo + 'blue';
      `,
      values,
    );

    expect(values).toEqual({
      foo: { value: 'red', name: 'foo' },
      baz: { value: "$foo + 'blue'", name: 'baz' },
    });
  });

  it('should complain about redefining', async () => {
    const values = {};

    await expect(() =>
      run(
        `
        $foo: red;
        $foo: blue;
      `,
        values,
      ),
    ).rejects.toThrowError('Cannot redefine an existing variable: $foo');
  });
});
