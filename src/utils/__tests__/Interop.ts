/* eslint-disable @typescript-eslint/no-unused-vars, func-names, no-shadow */
import * as Interop from '../Interop';

describe('interop', () => {
  test.each([
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: 'b', defaulted: false },
          { name: 'c', defaulted: false },
        ],
        null,
      ],
      (a: any, b: any, c: any) => {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: 'b', defaulted: false },
          { name: 'c', defaulted: false },
        ],
        null,
      ],
      function a(a: any, b: any, c: any) {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: 'b', defaulted: false },
          { name: 'c', defaulted: false },
        ],
        null,
      ],
      function (a: any, b: any, c: any) {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: null, defaulted: false },
          { name: 'c', defaulted: false },
        ],
        null,
      ],
      (a: any, { b }: any, c: any) => {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: null, defaulted: true },
          { name: 'c', defaulted: false },
        ],
        null,
      ],
      (a: any, [b]: any = [], c: any) => {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: 'b', defaulted: false },
        ],
        'c',
      ],
      (a: any, b: any, ...c: any[]) => {},
    ],
    [
      [
        [
          { name: 'a', defaulted: false },
          { name: 'b', defaulted: true },
        ],
        'c',
      ],
      (a: any, b: any = [1, 2], ...c: any[]) => {},
    ],
    // prettier-ignore
    [[[{ name: 'a', defaulted: false }], null], a => {}],
  ])('parses fn params -> %s', (expected, input) => {
    expect(Interop.parseParameters(input)).toEqual(expected);
  });
});
