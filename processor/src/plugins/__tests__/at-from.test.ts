import { Selectors, evaluate } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import Scope from '../../Scope';
import { NumericValue, RgbValue } from '../../Values';

describe('@use', () => {
  it.each([
    [
      `@use './other' import $bar, $foo, %baz;`,
      {
        $bar: { node: new NumericValue(1, 'px') },
        $foo: { node: new RgbValue('red') },
        '%baz': {
          identifier: 'baz',
          selector: Selectors.class`hey`,
          composes: [],
        },
      },
    ],
    [
      `@use './other' as other;`,
      {
        'other.$bar': { node: new NumericValue(1, 'px') },
        'other.$foo': { node: new RgbValue('red') },
        'other.%baz': {
          identifier: 'baz',
          selector: Selectors.class`hey`,
          composes: [],
        },
      },
    ],
    [
      `@use './other' import (
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
              [
                '$bar',
                {
                  type: 'variable',
                  identifier: 'bar',
                  node: new NumericValue(1, 'px'),
                },
              ],
              [
                '$foo',
                {
                  type: 'variable',
                  identifier: 'foo',
                  node: new RgbValue('red'),
                },
              ],
              [
                '%baz',
                {
                  type: 'class',
                  identifier: 'baz',
                  selector: Selectors.class`hey`,
                  composes: [],
                },
              ],
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

  it.each([
    [`@use './none' import $baz, $foo`, 'Could not resolve module ./none'],
    [`@use './other' import $baz, $foo`, '"./other" does not export $baz'],
  ])('should throw variables for: %s', async (css, error) => {
    await expect(() =>
      evaluate(css, {
        modules: [
          [
            'other',
            {
              scope: new Scope(),
              exports: new ModuleMembers([
                [
                  '$bar',
                  {
                    type: 'variable',
                    identifier: 'bar',
                    node: new NumericValue(1, 'px'),
                  },
                ],
                [
                  '$foo',
                  {
                    type: 'variable',
                    identifier: 'foo',
                    node: new RgbValue('red'),
                  },
                ],
              ]),
            },
          ],
          [
            '/none',
            {
              scope: new Scope(),
              exports: new ModuleMembers(),
            },
          ],
        ],
      }),
    ).rejects.toThrowError(error);
  });
});
