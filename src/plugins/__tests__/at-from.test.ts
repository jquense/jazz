import path from 'path';

import postcss from 'postcss';

import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';
import { EXPORTS } from '../../utils/Symbols';
import plugin from '../at-from';

describe('@from', () => {
  function run(css: string, scope: Scope, files: any) {
    return postcss(plugin).process(css, {
      parser: require('postcss-scss'),
      from: '/foo.js',
      resolve: (from: string, to: string) => {
        return path.join(path.dirname(from), to);
      },
      files: { '/foo.js': { scope }, ...files },
    } as any);
  }

  it.each([
    [
      `@from './other' import $bar, $foo;`,
      {
        $bar: { node: new Ast.Numeric(1, 'px') },
        $foo: { node: new Ast.Color('red') },
      },
    ],
    [
      `@from './other' import * as other;`,
      {
        'other.$bar': { node: new Ast.Numeric(1, 'px') },
        'other.$foo': { node: new Ast.Color('red') },
      },
    ],
    [
      `@from './other' import (
        $bar as $baz,
        $foo
      );`,
      {
        $baz: { node: new Ast.Numeric(1, 'px') },
        $foo: { node: new Ast.Color('red') },
      },
    ],
  ])('should import variables for: %s', async (css, expected) => {
    const scope = new Scope();

    await run(css, scope, {
      '/other': {
        [EXPORTS]: new Scope({
          members: new Map([
            ['$bar', { type: 'variable', node: new Ast.Numeric(1, 'px') }],
            ['$foo', { type: 'variable', node: new Ast.Color('red') }],
          ]),
        }),
      },
    });

    const result: any = new Map();
    Object.entries(expected).forEach(([key, value]) => {
      result.set(key, expect.objectContaining(value));
    });

    expect(scope.members).toEqual(result);
  });
});
