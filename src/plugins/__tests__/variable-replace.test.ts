import postcss from 'postcss';

import plugin from '../variable-replace';

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

describe('variable-replace', () => {
  function run(css: string, values: any) {
    return postcss(plugin).process(css, {
      parser: require('postcss-scss'),
      from: './foo.js',
      files: { './foo.js': { values } },
    } as any);
  }

  it('should normalize values on file', async () => {
    const values = {
      bar: { value: '1px' },
      foo: { value: '$bar + $baz' },
      baz: { value: '$bar + 2px' },
    };

    await run('', values);

    expect(values).toEqual({
      bar: { value: '1px' },
      baz: { value: '1px + 2px' },
      foo: { value: '1px + 1px + 2px' },
    });
  });

  it('should replace in CSS', async () => {
    const values = {
      bar: { value: '1px' },
      foo: { value: 'parent' },
      baz: { value: 'color' },
    };

    const { css } = await run(
      `
        #{$foo}-child {
          #{$baz}: calc(#{$bar} + 1px);
          #{$foo}: $foo$bar;
        }
     `,
      values,
    );

    expect(css).toMatchCss(`
      parent-child {
        color: calc(1px + 1px);
        parent: parent1px;
      }
    `);
  });

  it('should throw for bare variable in function name', async () => {
    const values = {
      foo: { value: 'calc' },
    };

    await expect(() =>
      run(`div { width: $foo(1px + 1px); }`, values),
    ).rejects.toThrowError(
      'Unexpected variable location, use interpolation: #{$foo}',
    );
  });

  it('should throw for bare variable in properties ', async () => {
    const values = {
      foo: { value: 'calc' },
    };

    await expect(() => run(`div { $foo: 1px; }`, values)).rejects.toThrowError(
      'Unexpected variable location, use interpolation: #{$foo}',
    );
  });
});
