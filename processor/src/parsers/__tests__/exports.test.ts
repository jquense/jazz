import Parser from '..';
import {
  Export,
  ExportAllSpecifier,
  ExportNamedDeclaration,
  ExportSpecifier,
  Ident,
  Variable,
} from '../../Ast';

describe('parser: exports', () => {
  let parse: (input: string) => any;

  beforeEach(() => {
    const parser = new Parser();
    parse = (input: string) =>
      parser.parse(input, { startRule: 'exports', source: false });
  });

  // it('should handle bare import', () => {
  //   expect(parse(`"bootstrap"`)).toEqual({
  //     source: 'bootstrap',
  //     specifiers: [],
  //   });
  // });

  it('should handle namespace', () => {
    expect(parse(`* from 'bootstrap'`)).toEqual(
      new Export(new ExportAllSpecifier(), 'bootstrap'),
    );
  });

  it('should not allow all from global', () => {
    expect(() => parse(`* from global`)).toThrowErrorMatchingInlineSnapshot(
      `"Expected string but \\"g\\" found."`,
    );
  });

  it('should handle bare named specifier', () => {
    expect(parse(`$foo, $bar`)).toEqual(
      new Export([
        new ExportSpecifier(new Variable('foo'), new Variable('foo')),
        new ExportSpecifier(new Variable('bar'), new Variable('bar')),
      ]),
    );
  });

  it('should handle exported declarations', () => {
    expect(parse(`$foo: bar`)).toEqual(
      new ExportNamedDeclaration(new Variable('foo'), new Ident('bar')),
    );
  });

  it('should handle foreign named specifier', () => {
    expect(parse(`$foo, $bar from './foo'`)).toEqual(
      new Export(
        [
          new ExportSpecifier(new Variable('foo'), new Variable('foo')),
          new ExportSpecifier(new Variable('bar'), new Variable('bar')),
        ],
        './foo',
      ),
    );
  });

  it('should handle renamed specifier', () => {
    expect(parse(`$foo as $baz, $bar from './foo'`)).toEqual(
      new Export(
        [
          new ExportSpecifier(new Variable('baz'), new Variable('foo')),
          new ExportSpecifier(new Variable('bar'), new Variable('bar')),
        ],
        './foo',
      ),
    );
  });
});
