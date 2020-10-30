import Parser from '..';
import {
  Ident,
  Import,
  ImportNamedSpecifier,
  ImportNamespaceSpecifier,
  Variable,
} from '../../Ast';

describe('parser: uses', () => {
  let parse: (input: string) => any;

  beforeEach(() => {
    const parser = new Parser();
    parse = (input: string) =>
      parser.parse(input, { startRule: 'uses', source: false });
  });

  it('should handle bare import', () => {
    expect(parse(`"bootstrap"`)).toEqual(new Import('bootstrap', []));
  });

  it('should handle namespace', () => {
    expect(parse(`"bootstrap" as foo`)).toEqual(
      new Import('bootstrap', [
        new ImportNamespaceSpecifier(new Ident('foo')),
      ]),
    );
  });

  it('should handle a named variable specifier', () => {
    expect(parse(`"bootstrap" import $foo`)).toEqual(
      new Import('bootstrap', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('foo')),
      ]),
    );
  });

  it('should handle a named ident specifier', () => {
    expect(parse(`"bootstrap" import foo`)).toEqual(
      new Import('bootstrap', [
        new ImportNamedSpecifier(new Ident('foo'), new Ident('foo')),
      ]),
    );
  });

  it('should handle named specifiers', () => {
    expect(parse(`"bootstrap" import $foo, $bar`)).toEqual(
      new Import('bootstrap', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('foo')),
        new ImportNamedSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('should handle renamed specifiers', () => {
    expect(parse(`'./helpers' import $foo as $local, $bar`)).toEqual(
      new Import('./helpers', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('local')),
        new ImportNamedSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('should handle multiple lines', () => {
    expect(
      parse(`'./helpers'
      import
        $foo as $local,
        $bar
    `),
    ).toEqual(
      new Import('./helpers', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('local')),
        new ImportNamedSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('should handle inline comment', () => {
    expect(
      parse(`'./helpers' import $foo as $local, /* $baz */  $bar`),
    ).toEqual(
      new Import('./helpers', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('local')),
        new ImportNamedSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('should handle optional parens', () => {
    expect(
      parse(`'./helpers'
      import (
        $foo as $local,
        $bar
      )
    `),
    ).toEqual(
      new Import('./helpers', [
        new ImportNamedSpecifier(new Variable('foo'), new Variable('local')),
        new ImportNamedSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('throws on unmatched parens', () => {
    expect(() =>
      parse(`'./helpers' import ($bar `),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Expected \\")\\", \\",\\", or \\"as\\" but end of input found."`,
    );
  });

  it('throws on mismatched types', () => {
    expect(() =>
      parse(`'./helpers' import $bar as bar `),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Cannot import a variable as an identifier."`,
    );

    expect(() =>
      parse(`'./helpers' import bar as $bar `),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Cannot import an identifier as a variable."`,
    );

    expect(() =>
      parse(`'./helpers' import bar as $bar `),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Cannot import an identifier as a variable."`,
    );
  });
});
