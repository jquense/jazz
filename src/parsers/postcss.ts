import postcss from 'postcss';
import CssParser, { Token } from 'postcss-scss/lib/scss-parser';
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

export class PostcssParser extends CssParser {
  private parser: Parser;

  constructor(input: Input, opts: any) {
    super(input, opts);
    this.parser = new Parser(opts);
  }

  rule(tokens: any) {
    super.rule(tokens);

    if (this.current.type === 'rule') {
      (this.current as Ast.Rule).selectorAst = this.parser.anyValue(
        this.current.selector,
      );
    }
  }

  decl(tokens: any) {
    // grab before b/c decls can be nested or not
    const { current } = this;

    super.decl(tokens);

    if (current.last?.type !== 'decl') return;

    const added = (current.last as any) as Ast.Declaration;

    added.ident = this.parser.prop(added);

    // this logic is a bit weird but matches Sass, which doesn't evaluate the identifier
    // before deciding how to parse the value
    if (identIsLikelyCssVar(added.ident)) {
      added.valueAst = this.parser.anyValue(added.value);
    } else {
      added.valueAst = this.parser.value(added);
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

    const { name, params } = current;

    switch (name) {
      case 'if':
      case 'else if':
        (current as Ast.IfAtRule).test = this.parser.expression(params);
        break;
      case 'each': {
        const { variables, expr } = this.parser.eachCondition(current);

        (current as Ast.EachAtRule).variables = variables;
        (current as Ast.EachAtRule).expression = expr;
        break;
      }
      case 'from': {
        const { source, specifiers } = this.parser.import(current);

        (current as Ast.FromAtRule).request = source;
        (current as Ast.FromAtRule).specifiers = specifiers;
        break;
      }
      case 'export': {
        const { source, specifiers } = this.parser.export(current);

        (current as Ast.ExportAtRule).request = source;
        (current as Ast.ExportAtRule).specifiers = specifiers;
        break;
      }
      case 'mixin': {
        const callable = this.parser.callable(params);
        (current as Ast.MixinAtRule).mixin = callable.name;
        (current as Ast.MixinAtRule).parameterList = callable.params;
        break;
      }
      case 'include': {
        const expr = this.parser.callExpressions(params, true);
        (current as Ast.IncludeAtRule).callExpressions = expr;
        break;
      }
      case 'compose': {
        const composition = this.parser.composeList(params);
        (current as Ast.ComposeAtRule).isGlobal = composition.isGlobal;
        (current as Ast.ComposeAtRule).request = composition.from;
        (current as Ast.ComposeAtRule).classList = composition.classList;
        break;
      }
      default:
        (current as Ast.CssAtRule).paramValue = this.parser.anyValue(params);
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
