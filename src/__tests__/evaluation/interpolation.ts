import { css, evaluate } from '../../../test/helpers';

describe('interpolations', () => {
  function t(input: string, expected: string) {
    return async () => {
      expect(await evaluate(input)).toMatchCss(expected);
    };
  }
  it(
    'should merge strings in templates',
    t(
      css`
        $name: 'Pat';

        a: 'hi #{$name}';
        b: 'hi #{"g"}';
      `,
      css`
        a: 'hi Pat';
        b: 'hi g';
      `,
    ),
  );

  it(
    'should treat literals with strings as interpolated strings',
    t(
      css`
        $name: 'Pat';

        a: ~'hi #{$name}';
        b: ~'hi #{"g"}';
      `,
      css`
        a: hi 'Pat';
        b: hi 'g';
      `,
    ),
  );

  it.todo('handles escaping inner quotes');
});
