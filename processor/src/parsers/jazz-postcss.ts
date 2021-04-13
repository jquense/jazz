import { Node } from 'postcss';
import CssParser, { Token } from 'postcss-scss/lib/scss-parser';
import Input from 'postcss/lib/input';

import * as Ast from '../Ast';
import Parser from './index';

function firstValueWord(tokens: Token[]) {
  let foundValue = false;

  for (const token of tokens) {
    if (token[0] === ':') foundValue = true;
    else if (foundValue && (token[0] === 'word' || token[0] === 'string'))
      return token;
  }
  return undefined;
}

function identIsLikelyCssVar(node: Ast.Expression) {
  if (node.type === 'ident') return node.value.startsWith('--');
  if (node.type === 'interpolated-ident')
    return node.quasis[0].startsWith('--');
  return false;
}

function prevNonComment(node?: any): Node | undefined {
  while (node?.type === 'comment') {
    node = node.prev();
  }

  return node;
}

const rawOrProp = (node: any, prop: string): string => {
  return node.raws[prop]?.raw ?? node[prop];
};

export const parseNode = (
  node: Ast.ChildNode,
  parser: Parser,
  offset?: any,
) => {
  const loc = { offset: offset || node.source?.start };

  if (node.type === 'rule') {
    const input = rawOrProp(node, 'selector');

    node.raws.jazz = { selector: input };

    node.selectorAst = parser.anyValue(input, loc);
  } else if (node.type === 'decl') {
    const prop = rawOrProp(node, 'prop');

    node.ident = parser.prop(prop, {
      offset: node.source?.start,
    });

    const value = rawOrProp(node, 'value');

    node.raws.jazz = { prop, value };

    if (identIsLikelyCssVar(node.ident)) {
      node.valueAst = parser.anyValue(value, loc);
    } else {
      node.valueAst = parser.value(value, loc);
    }
  } else if (node.type === 'atrule') {
    const { name } = node;
    const params = rawOrProp(node, 'params');

    node.raws.jazz = { params };

    switch (name) {
      case 'if':
      case 'else if':
        (node as Ast.IfAtRule).test = parser.expression(params, loc);
        break;
      case 'each': {
        const { variables, expr } = parser.eachCondition(params, loc);

        (node as Ast.EachAtRule).variables = variables;
        (node as Ast.EachAtRule).expression = expr;
        break;
      }
      case 'import': {
        (node as Ast.ImportAtRule).request = parser.import(params, loc);
        break;
      }
      case 'use': {
        const { request, specifiers } = parser.use(params, loc);

        (node as Ast.UseAtRule).request = request;
        (node as Ast.UseAtRule).specifiers = specifiers;
        break;
      }
      case 'export': {
        const exportNode = parser.export(params, loc);

        if (exportNode.type === 'export-named-declaration') {
          (node as Ast.ExportAtRule).declaration = exportNode;
        } else {
          (node as Ast.ExportAtRule).request = exportNode.request;
          (node as Ast.ExportAtRule).specifiers = exportNode.specifiers;
        }
        break;
      }
      case 'mixin': {
        const callable = parser.callable(params, loc);
        (node as Ast.MixinAtRule).mixin = callable.name;
        (node as Ast.MixinAtRule).parameterList = callable.params;
        break;
      }
      case 'function': {
        const callable = parser.callable(params, loc);
        (node as Ast.FunctionAtRule).functionName = callable.name;
        (node as Ast.FunctionAtRule).parameterList = callable.params;
        break;
      }
      case 'return': {
        (node as Ast.ReturnAtRule).returnValue = parser.expression(
          params,
          loc,
        );
        break;
      }
      case 'include': {
        const expr = parser.callExpressions(params, true, loc);
        (node as Ast.IncludeAtRule).callExpressions = expr;
        break;
      }
      case 'compose': {
        const composition = parser.composeList(params, loc);
        (node as Ast.ComposeAtRule).isGlobal = composition.isGlobal;
        (node as Ast.ComposeAtRule).request = composition.from;
        (node as Ast.ComposeAtRule).classList = composition.classList;
        break;
      }
      case 'debug':
      case 'warn':
      case 'error':
        (node as Ast.MetaAtRule).expression = parser.expression(params, loc);
        break;
      default:
        (node as Ast.CssAtRule).paramValue = parser.anyValue(params, loc);
    }
  }
};

export class JazzPostcssParser extends CssParser {
  private parser: Parser;

  constructor(input: Input, opts: any) {
    super(input, opts);
    this.parser = new Parser({ source: input, ...opts });
  }

  rule(tokens: any) {
    const [, , line, column] = tokens[0];
    super.rule(tokens);

    if (this.current.type === 'rule') {
      parseNode(this.current as any, this.parser, { line, column });
    }
  }

  decl(tokens: any) {
    // grab before b/c decls can be nested or not
    const [, , line = 0, column = 0] = firstValueWord(tokens)!;

    const { current } = this;

    super.decl(tokens);

    if (current.last?.type !== 'decl') return;

    const added = (current.last as any) as Ast.Declaration;

    parseNode(added, this.parser, { line, column });
  }

  atrule(tokens: any) {
    const tokenName: string = tokens[1]?.slice(1);

    if (tokens[1] === '@else') {
      this.ifElseRule(tokens);
    } else {
      super.atrule(tokens);
    }

    let current: any = this.current.type === 'atrule' && this.current;
    if (!current) {
      if (this.current.last?.type === 'atrule') current = this.current.last;
      else return;
    }
    if (tokenName === 'return' && current.name !== 'return') {
      current = current.nodes!.find(
        (n: any): n is Ast.AtRule =>
          n.type === 'atrule' && n.name === 'return',
      )!;
    }
    parseNode(current, this.parser);
  }

  ifElseRule(tokens: Token) {
    let next;
    const rest = [];

    const prev = prevNonComment(this.current.last) as any;

    if (
      !prev ||
      prev.type !== 'atrule' ||
      (prev.name !== 'if' && prev.name !== 'else if')
    ) {
      throw this.input.error(
        '@else rules must follow an @if',
        tokens[2]!,
        tokens[3]!,
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
  const parser = new JazzPostcssParser(new Input(input) as any, opts);
  parser.parse();

  return parser.root as Ast.Root;
}
