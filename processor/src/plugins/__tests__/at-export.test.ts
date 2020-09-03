import { evaluate } from '../../../test/helpers';
import ModuleMembers from '../../ModuleMembers';
import Scope from '../../Scope';
import { NumericValue, RgbValue } from '../../Values';

describe('@export', () => {
  it.each([
    [
      `@export $bar, $foo from './other'`,
      {
        $bar: { type: 'variable', node: new NumericValue(1, 'px') },
        $foo: { type: 'variable', node: new RgbValue('red') },
      },
    ],
    [
      `@export * from './other'`,
      {
        $bar: { type: 'variable', node: new NumericValue(1, 'px') },
        $foo: { type: 'variable', node: new RgbValue('red') },
      },
    ],
    [
      `@export $bar as $baz, $foo;`,
      {
        $baz: { type: 'variable', node: new NumericValue(1, 'px') },
        $foo: { type: 'variable', node: new RgbValue('red') },
      },
      // the local members
      new ModuleMembers([
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
    ],
  ])(
    'should export variables for: %s',
    async (css, expected, members: ModuleMembers = new ModuleMembers()) => {
      const exports = new ModuleMembers();

      await evaluate(css, {
        exports,
        scope: new Scope({ members }),
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
        ],
      });

      const result = [] as any[];
      Object.entries(expected).forEach(([key, value]) => {
        result.push([key, expect.objectContaining(value)]);
      });

      expect(Array.from(exports)).toEqual(result);
    },
  );

  it.each([
    [`@export $bar, $foo from './none'`, 'Could not resolve module ./none'],
    [`@export $baz, $foo from './other'`, '"./other" does not export $baz'],
    [`@export ( $baz );`, 'There is no local $baz declared.'],
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
