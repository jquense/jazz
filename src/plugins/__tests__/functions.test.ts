import postcss from 'postcss';

import functions, { Options } from '../functions';

describe('functions', () => {
  async function run(fixture: string, expected: string, opts: Options) {
    const { css } = await postcss(functions(opts)).process(fixture, {
      from: undefined,
    });

    expect(css).toEqual(expected);
  }

  it('should invoke a recognized function', () => {
    return run('a{foo:bar()}', 'a{foo:baz}', {
      functions: {
        bar() {
          return 'baz';
        },
      },
    });
  });

  it('should accept deferred functions', () => {
    return run('a{foo:bar()}', 'a{foo:baz}', {
      functions: {
        bar() {
          return Promise.resolve('baz');
        },
      },
    });
  });

  it('should invoke multiple functions', () => {
    return run('a{foo:bar() baz()}', 'a{foo:bat qux}', {
      functions: {
        bar() {
          return 'bat';
        },
        baz() {
          return 'qux';
        },
      },
    });
  });

  it('should ignore unrecognized functions', () => {
    return run('a{foo:bar()}', 'a{foo:bar()}', {
      functions: {},
    });
  });

  it('should be able to pass arguments to functions', () => {
    return run('a{foo:bar(qux, norf)}', 'a{foo:qux-norf}', {
      functions: {
        bar(baz: any, bat: any) {
          return `${baz}-${bat}`;
        },
      },
    });
  });

  it('should be able to pass arguments with spaces to functions', () => {
    return run('a{foo:bar(hello world)}', 'a{foo:hello-world}', {
      functions: {
        bar(baz: any) {
          return baz.replace(' ', '-');
        },
      },
    });
  });

  it('should invoke a function in an at-rule', () => {
    return run('@foo bar(){bat:qux}', '@foo baz{bat:qux}', {
      functions: {
        bar() {
          return 'baz';
        },
      },
    });
  });

  it('should invoke a function in a rule', () => {
    return run('foo:nth-child(bar()){}', 'foo:nth-child(baz){}', {
      functions: {
        bar() {
          return 'baz';
        },
      },
    });
  });

  it('should invoke nested functions', () => {
    return run('a{foo:bar(baz())}', 'a{foo:batqux}', {
      functions: {
        bar(arg: any) {
          return `bat${arg}`;
        },
        baz() {
          return Promise.resolve('qux');
        },
      },
    });
  });

  it('should not pass empty arguments', () => {
    expect.assertions(1);
    return postcss(
      functions({
        functions: {
          bar(...args: any[]) {
            expect(args).toHaveLength(0);
            return '';
          },
        },
      }),
    ).process('a{foo:bar()}', { from: undefined });
  });
});
