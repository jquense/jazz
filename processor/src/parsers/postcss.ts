import postcss from 'postcss';
import CssParser, { Token } from 'postcss-scss/lib/scss-parser';
// @ts-expect-error
import tokenizer from './vendor/tokenize';
import Input from 'postcss/lib/input';

import * as Ast from '../Ast';
import Parser from './index';

function identIsLikelyCssVar(node: Ast.Expression) {
  if (node.type === 'ident') return node.value.startsWith('--');
  if (node.type === 'interpolated-ident')
    return node.quasis[0].startsWith('--');
  return false;
}

function prevNonComment(node?: postcss.Node): postcss.Node | undefined {
  while (node?.type === 'comment') {
    node = node.prev();
  }

  return node;
}

const rawOrProp = (node: postcss.Node, prop: string): string => {
  // @ts-ignore
  return node.raws[prop]?.raw ?? node[prop];
};

export class PostcssParser extends CssParser {
  private parser: Parser;

  constructor(input: Input, opts: any) {
    super(input, opts);
    this.parser = new Parser({ source: input, ...opts });
  }

  createTokenizer() {
    this.tokenizer = tokenizer(this.input);
  }

  rule(tokens: any) {
    const [, , line, column] = tokens[0];
    super.rule(tokens);

    if (this.current.type === 'rule') {
      const input = rawOrProp(this.current, 'selector');
      (this.current as Ast.Rule).selectorAst = this.parser.anyValue(input, {
        offset: { line, column },
      });
    }
  }

  decl(tokens: any) {
    // grab before b/c decls can be nested or not
    const [, , line, column] = tokens[
      tokens.findIndex((t: any) => t[0] === ':') + 1
    ];

    const current = this.current;

    super.decl(tokens);

    if (current.last?.type !== 'decl') return;

    const added = (current.last as any) as Ast.Declaration;

    let input = rawOrProp(added, 'prop');

    added.ident = this.parser.prop(input, {
      offset: added.source?.start,
    });

    input = rawOrProp(added, 'value');
    let offset = { line, column };
    // this logic is a bit weird but matches Sass, which doesn't evaluate the identifier
    // before deciding how to parse the value
    if (identIsLikelyCssVar(added.ident)) {
      added.valueAst = this.parser.anyValue(input, { offset });
    } else {
      added.valueAst = this.parser.value(input, { offset });
    }
  }

  atrule(tokens: any) {
    if (tokens[1] === '@else') {
      this.ifElseRule(tokens);
    } else {
      super.atrule(tokens);
    }

    let current = this.current.type === 'atrule' && this.current;
    if (!current) {
      if (this.current.last?.type === 'atrule') current = this.current.last;
      else return;
    }

    const { name } = current;
    const params = rawOrProp(current, 'params');

    const loc = { offset: current.source?.start };

    switch (name) {
      case 'if':
      case 'else if':
        (current as Ast.IfAtRule).test = this.parser.expression(params, loc);
        break;
      case 'each': {
        const { variables, expr } = this.parser.eachCondition(params, loc);

        (current as Ast.EachAtRule).variables = variables;
        (current as Ast.EachAtRule).expression = expr;
        break;
      }
      case 'use': {
        const { request, specifiers } = this.parser.import(params, loc);

        (current as Ast.UseAtRule).request = request;
        (current as Ast.UseAtRule).specifiers = specifiers;
        break;
      }
      case 'export': {
        const { request, specifiers } = this.parser.export(params, loc);

        (current as Ast.ExportAtRule).request = request;
        (current as Ast.ExportAtRule).specifiers = specifiers;
        break;
      }
      case 'mixin': {
        const callable = this.parser.callable(params, loc);
        (current as Ast.MixinAtRule).mixin = callable.name;
        (current as Ast.MixinAtRule).parameterList = callable.params;
        break;
      }
      case 'include': {
        const expr = this.parser.callExpressions(params, true, loc);
        (current as Ast.IncludeAtRule).callExpressions = expr;
        break;
      }
      case 'compose': {
        const composition = this.parser.composeList(params, loc);
        (current as Ast.ComposeAtRule).isGlobal = composition.isGlobal;
        (current as Ast.ComposeAtRule).request = composition.from;
        (current as Ast.ComposeAtRule).classList = composition.classList;
        break;
      }
      default:
        (current as Ast.CssAtRule).paramValue = this.parser.anyValue(
          params,
          loc,
        );
    }
  }

  ifElseRule(tokens: Token) {
    let next;
    const rest = [];

    const prev = prevNonComment(this.current.last);

    if (
      !prev ||
      prev.type !== 'atrule' ||
      (prev.name !== 'if' && prev.name !== 'else if')
    ) {
      throw this.input.error(
        '@else rules must follow an @if',
        tokens[2],
        tokens[3],
      );
    }
    // eslint-disable-next-line no-cond-assign
    do {
      next = this.tokenizer.nextToken();
      if (next) rest.push(next);
    } while (next && next[0] === 'space');

    const last = rest[rest.length - 1];
    if (last[0] === 'word' && last[1] === 'if') {
      tokens[1] += ' if';
    } else {
      rest.forEach(this.tokenizer.back);
    }

    super.atrule(tokens);
  }
}

export default function parse(input: string, opts: any) {
  const parser = new PostcssParser(new Input(input) as any, opts);
  parser.parse();

  return parser.root;
}
