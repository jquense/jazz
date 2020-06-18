// import * as Other from 'postcss-values-parser';

import Parser from '..';
import {
  AttributeSelector,
  BinaryExpression,
  ClassSelector,
  Combinator,
  ComplexSelector,
  CompoundSelector,
  DOUBLE,
  IdSelector,
  Ident,
  InterpolatedIdent,
  Interpolation,
  Node,
  Numeric,
  Operator,
  ParentSelector,
  PseudoSelector,
  SelectorList,
  StringLiteral,
  StringTemplate,
  TypeSelector,
  UniversalSelector,
  Variable,
} from '../Ast';

const t = ([str]: TemplateStringsArray) => new TypeSelector(new Ident(str));
const i = ([str]: TemplateStringsArray) => new IdSelector(new Ident(str));
const c = ([str]: TemplateStringsArray) => new ClassSelector(new Ident(str));
const star = () => new UniversalSelector();

describe('parser: values', () => {
  let parser: Parser;
  let startRule = 'values';

  beforeEach(() => {
    parser = new Parser({ trace: true });
    startRule = 'selector';
  });

  function processTestCases(input: string, expected: Node) {
    expect(parser.parse(input, { startRule, source: false })).toEqual(
      expected,
    );
  }

  function shouldThrow(input: string, expected: string | RegExp | Error) {
    expect(() =>
      parser.parse(input, { startRule, tracer: { trace() {} } }),
    ).toThrow(expected);
  }

  describe('simple selectors', () => {
    it.each([
      ['div', new SelectorList(new CompoundSelector(t`div`))],
      ['div#a', new SelectorList(new CompoundSelector([t`div`, i`a`]))],
      ['div.a', new SelectorList(new CompoundSelector([t`div`, c`a`]))],
      ['.a', new SelectorList(new CompoundSelector([c`a`]))],
      ['#a', new SelectorList(new CompoundSelector([i`a`]))],
    ])('%s -> %s', processTestCases);

    describe('attributes', () => {
      const draggable = (op: any) =>
        [
          `[draggable${op}"true"]`,
          new SelectorList(
            new CompoundSelector([
              new AttributeSelector(
                new Ident('draggable'),
                op,
                new StringLiteral('true', DOUBLE),
              ),
            ]),
          ),
        ] as [string, Node];

      it.each([
        [
          '[disabled]',
          new SelectorList(
            new CompoundSelector([
              new AttributeSelector(new Ident('disabled')),
            ]),
          ),
        ],
        [
          '*[disabled]',
          new SelectorList(
            new CompoundSelector([
              star(),
              new AttributeSelector(new Ident('disabled')),
            ]),
          ),
        ],
        [
          'div[disabled]',
          new SelectorList(
            new CompoundSelector([
              t`div`,
              new AttributeSelector(new Ident('disabled')),
            ]),
          ),
        ],
        [
          'div.foo#bar[disabled]',
          new SelectorList(
            new CompoundSelector([
              t`div`,
              c`foo`,
              i`bar`,
              new AttributeSelector(new Ident('disabled')),
            ]),
          ),
        ],
        draggable('='),
        draggable('*='),
        draggable('|='),
        draggable('^='),
        draggable('$='),
        draggable('~='),
        [
          `[my-#{~'el'}="true"]`,
          new SelectorList(
            new CompoundSelector([
              new AttributeSelector(
                new InterpolatedIdent(['my-', ''], [new StringLiteral('el')]),
                '=',
                new StringLiteral('true', DOUBLE),
              ),
            ]),
          ),
        ],
        [
          `[#{$foo}="a #{1 + 2} c"]`,
          new SelectorList(
            new CompoundSelector([
              new AttributeSelector(
                new Interpolation(new Variable('foo')),
                '=',
                new StringTemplate(
                  ['a ', ' c'],
                  [
                    new BinaryExpression(
                      new Numeric(1),
                      new Operator('+'),
                      new Numeric(2),
                    ),
                  ],
                  DOUBLE,
                ),
              ),
            ]),
          ),
        ],
      ])('%s', processTestCases);
    });

    describe('pseudos', () => {
      it.each([
        [
          ':not(a.b#c)',
          new SelectorList(
            new CompoundSelector([
              new PseudoSelector(
                new Ident('not'),
                false,
                new StringLiteral('a.b#c'),
              ),
            ]),
          ),
        ],
        [
          '::before',
          new SelectorList(
            new CompoundSelector([
              new PseudoSelector(new Ident('before'), true),
            ]),
          ),
        ],
      ])('%s -> %s', processTestCases);
    });
  });

  describe('compound selectors', () => {
    test.each([
      [
        'a.foo  #b',
        new SelectorList(
          new ComplexSelector([
            new CompoundSelector([t`a`, c`foo`]),
            new CompoundSelector(i`b`),
          ]),
        ),
      ],
      [
        'a.foo +  div',
        new SelectorList(
          new ComplexSelector([
            new CompoundSelector([t`a`, c`foo`]),
            new Combinator('+'),
            new CompoundSelector(t`div`),
          ]),
        ),
      ],
      [
        '+ a.foo',
        new SelectorList(
          new ComplexSelector([
            new Combinator('+'),
            new CompoundSelector([t`a`, c`foo`]),
          ]),
        ),
      ],

      [
        '+ foo bar',
        new SelectorList(
          new ComplexSelector([
            new Combinator('+'),
            new CompoundSelector(t`foo`),
            new CompoundSelector(t`bar`),
          ]),
        ),
      ],
      [
        'span.a  .b > #c',
        new SelectorList(
          new ComplexSelector([
            new CompoundSelector([t`span`, c`a`]),
            new CompoundSelector(c`b`),
            new Combinator('>'),
            new CompoundSelector(i`c`),
          ]),
        ),
      ],
      [
        '.b &',
        new SelectorList(
          new ComplexSelector([
            new CompoundSelector(c`b`),
            new CompoundSelector(new ParentSelector()),
          ]),
        ),
      ],
      [
        '&-foo',
        new SelectorList(
          new CompoundSelector([
            new ParentSelector(undefined, new Ident('-foo')),
          ]),
        ),
      ],
    ])('%s -> %s', processTestCases);

    test.each([
      ['&&', 'Expected end of input'],
      ['+ ', 'A selector combinator must preceed a selector'],
    ])('%  throws  %s', shouldThrow);
  });

  describe('selector lists', () => {
    it.each([
      [
        'a.foo  #b, a.foo +  div',
        new SelectorList([
          new ComplexSelector([
            new CompoundSelector([t`a`, c`foo`]),
            new CompoundSelector([i`b`]),
          ]),
          new ComplexSelector([
            new CompoundSelector([t`a`, c`foo`]),
            new Combinator('+'),
            new CompoundSelector([t`div`]),
          ]),
        ]),
      ],
    ])('%s -> %s', processTestCases);
  });
});
