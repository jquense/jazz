import postcss from 'postcss';

import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';
import plugin from '../value-processing';

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

describe('value-processing', () => {
  function run(css: string, scope = new Scope()) {
    return postcss([require('../at-from').default, plugin]).process(css, {
      parser: require('postcss-scss'),
      from: './foo.js',
      files: { './foo.js': { scope } },
    } as any);
  }

  it('should replace variables in declarations', async () => {
    const scope = new Scope();

    const { css } = await run(
      `
        $color: red;

        .foo {
          color: $color;
        }
      `,
      scope,
    );

    expect(css).toMatchCss(`
      .foo {
        color: red;
      }
    `);

    expect(scope.variables).toEqual({
      $color: {
        node: new Ast.Color('red'),
      },
    });
  });

  it('should resolve interpolations', async () => {
    const { css } = await run(
      `
        $prefix: -webkit-;

        .foo {
          #{$prefix}transition: all 5s;
        }
      `,
    );

    expect(css).toMatchCss(`
      .foo {
        -webkit-transition: all 5s;
      }
    `);

    // expect(members.variables).toEqual({
    //   $color: new Ast.Color('red'),
    // });
  });

  describe('functions', () => {
    it('should leave unknown funcs alone', async () => {
      const { css } = await run(
        `
          .foo {
            color: rgb(1 2 4 / 1)
          }
        `,
      );

      expect(css).toMatchCss(`
        .foo {
          color: rgb(1 2 4 / 1)
        }
      `);
    });

    it.only('should import builtins', async () => {
      const { css } = await run(
        `
        @from 'math' import * as math;

        .foo {
          width: math.round(math.multiply(1.251px, math.$PI));
        }
      `,
      );

      expect(css).toMatchCss(`
        .foo {
          width: 4px;
        }
      `);
    });
  });

  // it('should complain about redefining', async () => {
  //   const values = {};

  //   await expect(() =>
  //     run(
  //       `
  //       $foo: red;
  //       $foo: blue;
  //     `,
  //       values,
  //     ),
  //   ).rejects.toThrowError('Cannot redefine an existing variable: $foo');
  // });
});
