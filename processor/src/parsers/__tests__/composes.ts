import Parser from '..';
import { Composition, Ident } from '../../Ast';

describe('parser: compose_list', () => {
  let parse: (input: string) => any;

  beforeEach(() => {
    const parser = new Parser();
    parse = (input: string) =>
      parser.parse(input, { startRule: 'compose_list', source: false });
  });

  test.each([
    [
      'foo bar baz',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
      ),
    ],
    [
      'foo, bar, baz',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
      ),
    ],
    [
      'foo, bar, /* hi, */ baz',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
      ),
    ],
    [
      'foo, bar baz',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
      ),
    ],
    [
      'foo, bar, baz from global',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        true,
      ),
    ],
    [
      'foo bar baz from global',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        true,
      ),
    ],
    [
      'foo bar baz from "./other"',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
        './other',
      ),
    ],
    [
      'foo, bar, baz from "./other"',
      new Composition(
        [new Ident('foo'), new Ident('bar'), new Ident('baz')],
        false,
        './other',
      ),
    ],
    [
      'foo, sm\\:bar, baz from "./other"',
      new Composition(
        [new Ident('foo'), new Ident('sm:bar'), new Ident('baz')],
        false,
        './other',
      ),
    ],
    [
      'foo, sm:bar baz from global',
      new Composition(
        [new Ident('foo'), new Ident('sm:bar'), new Ident('baz')],
        true,
      ),
    ],
  ])('%s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it('throws on trailing comma ', () => {
    expect(() =>
      parse(`foo, bar, from global`),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Expected end of input but \\",\\" found."`,
    );
  });
});
