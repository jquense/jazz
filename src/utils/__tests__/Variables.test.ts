import { getVariables, replaceWithValue } from '../Variables';

describe('Variables', () => {
  it.each([
    ['$foo', ['foo']],
    ['$foo $bar', ['foo', 'bar']],
    ['colors.$foo $bar', ['colors.foo', 'bar']],
    ['\\$foo colors.\\$bar $bar', ['bar']],
    ['$foo #{$bar + $baz}', ['foo', 'bar', 'baz']],
    ['$foo #{$bar + $#{baz}}', ['foo', 'bar']],
    ['$foo #{$bar + \\#{baz}}', ['foo', 'bar']],
    ['$foo #{$bar + "$#{$baz}"}', ['foo', 'bar', 'baz']],
  ])('should find variables in: %s', (input: string, expected: string[]) => {
    expect(Array.from(getVariables(input))).toEqual(expected);
  });

  it('should replace variables in string', () => {
    expect(
      replaceWithValue('$foo #{$bar + $baz} ns.$foo', {
        'foo': { value: 1 },
        'bar': { value: 'red' },
        'baz': { value: true },
        'ns.foo': { value: 'blue' },
      }),
    ).toEqual('1 red + true blue');
  });

  it('should replace only interpolations', () => {
    expect(
      replaceWithValue(
        '$foo-#{$bar}',
        {
          foo: { value: 1 },
          bar: { value: 'red' },
        },
        'string',
      ),
    ).toEqual('$foo-red');
  });

  it('should throw for invalid variables', () => {
    expect(() =>
      replaceWithValue(
        '$foo-#{$bar}',
        {
          foo: { value: 1 },
          bar: { value: 'red' },
        },
        'identifier',
      ),
    ).toThrow('Unexpected variable location');
  });
});
