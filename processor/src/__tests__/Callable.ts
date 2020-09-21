// @ts-nocheck

/* eslint-disable @typescript-eslint/no-unused-vars, func-names, no-shadow */
import {
  Parameter,
  ParameterList,
  RestParameter,
  UnknownDefaultValue,
  Variable,
} from '../Ast';
import { parseParameters } from '../Interop';
import * as Callable from '../Callable';
import { ArgumentListValue, ListValue, NumericValue } from '../Values';

const v = (n: string) => new Variable(n);

describe('Callable interop', () => {
  test.each([
    [
      new ParameterList([
        new Parameter(v('a')),
        new Parameter(v('b')),
        new Parameter(v('c')),
      ]),

      (a: any, b: any, c: any) => {},
    ],
    [
      new ParameterList([
        new Parameter(v('a')),
        new Parameter(v('b')),
        new Parameter(v('c')),
      ]),
      function a(a: any, b: any, c: any) {},
    ],
    [
      new ParameterList([
        new Parameter(v('a')),
        new Parameter(v('b')),
        new Parameter(v('c')),
      ]),
      function (a: any, b: any, c: any) {},
    ],
    [
      new ParameterList([
        new Parameter(v('a')),
        new Parameter(v('?')),
        new Parameter(v('c')),
      ]),
      (a: any, { b }: any, c: any) => {},
    ],
    [
      new ParameterList([
        new Parameter(v('a')),
        new Parameter(v('?'), new UnknownDefaultValue()),
        new Parameter(v('c')),
      ]),
      (a: any, [b]: any = [], c: any) => {},
    ],
    [
      new ParameterList(
        [new Parameter(v('a')), new Parameter(v('b'))],
        new RestParameter(v('c')),
      ),
      (a: any, b: any, ...c: any[]) => {},
    ],
    [
      new ParameterList(
        [
          new Parameter(v('a')),
          new Parameter(v('b'), new UnknownDefaultValue()),
        ],
        new RestParameter(v('c')),
      ),
      (a: any, b: any = [1, 2], ...c: any[]) => {},
    ],
  ])('parses fn params -> %s', (expected, input) => {
    expect(parseParameters(input)).toEqual(expected);
  });

  describe('Callable', () => {
    it('should look like a function', () => {
      const callable = Callable.create(
        'type-of',
        (a, b, c) => new ListValue([a, b, c]),
      );

      expect(callable instanceof Function).toEqual(true);
      expect(callable.name).toEqual('type-of');
    });

    it('should spread arguments', () => {
      const callable = Callable.create(
        'type-of',
        (a, b, c) => new ListValue([a, b, c]),
      );

      expect(
        callable({
          a: new NumericValue(1),
          c: new NumericValue(3),
        }),
      ).toEqual(
        new ListValue([
          new NumericValue(1),
          undefined as any,
          new NumericValue(3),
        ]),
      );
    });

    it('should pass as named', () => {
      const callable = Callable.create('type-of', '$args...', ({ args }) => {
        return args;
      });

      expect(
        callable({
          args: new ArgumentListValue([
            new NumericValue(1),
            new NumericValue(3),
          ]),
        }),
      ).toEqual(
        new ArgumentListValue([new NumericValue(1), new NumericValue(3)]),
      );
    });
  });
});
