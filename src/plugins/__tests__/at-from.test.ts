import { evaluate } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import Scope from '../../Scope';
import { NumericValue, RgbValue, StringValue } from '../../Values';

describe('@from', () => {
  it.each([
    [
      `@from './other' import $bar, $foo, %baz;`,
      {
        $bar: { node: new NumericValue(1, 'px') },
        $foo: { node: new RgbValue('red') },
        '%baz': { node: new StringValue('.hey') },
      },
    ],
    [
      `@from './other' import * as other;`,
      {
        'other.$bar': { node: new NumericValue(1, 'px') },
        'other.$foo': { node: new RgbValue('red') },
        'other.%baz': { node: new StringValue('.hey') },
      },
    ],
    [
      `@from './other' import (
        $bar as $baz,
        $foo
      );`,
      {
        $baz: { node: new NumericValue(1, 'px') },
        $foo: { node: new RgbValue('red') },
      },
    ],
  ])('should import variables for: %s', async (css, expected) => {
    const scope = new Scope();

    await evaluate(css, {
      scope,
      modules: [
        [
          'other',
          {
            scope: new Scope(),
            exports: new ModuleMembers([
              ['$bar', { type: 'variable', node: new NumericValue(1, 'px') }],
              ['$foo', { type: 'variable', node: new RgbValue('red') }],
              ['%baz', { type: 'class', node: new StringValue('.hey') }],
            ]),
          },
        ],
      ],
    });

    const result = [] as any[];

    Object.entries(expected).forEach(([key, value]) => {
      result.push([key, expect.objectContaining(value)]);
    });

    expect(Array.from(scope.members)).toEqual(result);
  });
});
