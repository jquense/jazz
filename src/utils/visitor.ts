import postcss, { Declaration, ChildNode, AtRule } from 'postcss';

import Parser from '../parsers';
import { ProcessingFile } from '../types';
import Scope from './Scope';
import { Expression } from '../parsers/Ast';

export type WalkApi = {
  skip(): void;
};

export type VisitorFn = (
  this: WalkApi,
  node: postcss.ChildNode,
  index: number,
) => void;

export type NormalVisitor = { enter?: VisitorFn; leave?: VisitorFn };

export type Visitor = VisitorFn | NormalVisitor;

export type VisitorMap = Record<string, Visitor>;

type NormalVisitorMap = Record<Expression['type'] | string, NormalVisitor[]>;

const buildError = (child: postcss.Node, e: any) => {
  e.postcssNode = child;
  if (e.stack && child.source && /\n\s{4}at /.test(e.stack)) {
    const s = child.source;
    e.stack = e.stack.replace(
      /\n\s{4}at /,
      `$&${s.input.from}:${s.start!.line}:${s.start!.column}$&`,
    );
  }
  return e;
};

function walkImpl(root: postcss.Container, visitors: NormalVisitorMap) {
  root.each((child, i) => {
    const visitor = visitors[child.type];

    let skipped = false;
    const skip = () => {
      skipped = true;
    };

    try {
      visitor?.forEach((v) => v.enter?.call({ skip }, child, i));
    } catch (e) {
      throw buildError(child, e);
    }
    if (!skipped && 'walk' in child) {
      walkImpl(child, visitors);
    }
    try {
      visitor?.forEach((v) => v.leave?.call({ skip }, child, i));
    } catch (e) {
      throw buildError(child, e);
    }
  });
}

export default class Walker {
  parser: Parser;

  private rootScope: Scope;

  scope: Scope;

  constructor(public root: postcss.Root, public file: ProcessingFile) {
    this.parser = Parser.get(root);

    this.rootScope = file.scope || (file.scope = new Scope());
    this.scope = this.rootScope;
  }

  walk(node = this.root) {
    node.each((child, i) => {
      let skipped = false;
      const skip = () => {
        skipped = true;
      };

      if (child.type === 'atrule' || )
      try {
        visitor?.forEach((v) => v.enter?.call({ skip }, child, i));
      } catch (e) {
        throw buildError(child, e);
      }
      if (!skipped && 'walk' in child) {
        walkImpl(child, visitors);
      }
      try {
        visitor?.forEach((v) => v.leave?.call({ skip }, child, i));
      } catch (e) {
        throw buildError(child, e);
      }
    });
  }

  walkDeclaraion(decl: Declaration);

  rule(node: Rule) {
    this.scope()
  }

  ifRule(node: AtRule) {
    let current: ChildNode | undefined = node;
    let result = false;

    while (current && current.type === 'atrule') {
      const next = fixElseIfAtRule(current.next());

      if (current.name.endsWith('if')) {
        result = getAtRuleBoolean(current, reducer);
        if (result) {
          this.scope(() => {
            this.walk(node)
          })
        }
      }
      if (current.name === 'else') {
        if (!result) {
          this.scope(() => {
            this.walk(node)
          }
        }

      }

      current.remove();
      current = next;
    }
  }
}


// function* walker(css, scope) {
//   let currentNode = css.nodes[0];

//   while (currentNode) {
//     if (currentNode.type === 'rule' || 'atRule') {
//       scope = scope.createChildScope
//     }
//     if (iftr())
//       currentNode = currentNode.next();

//       scope.close()
//   }

// }

function walk(root: postcss.Container, visitor: VisitorMap) {
  const rootVisitor: Record<string, NormalVisitor[]> = {};

  for (const key of Object.keys(visitor)) {
    const value = visitor[key];

    for (const type of key.split('|')) {
      const normalized =
        typeof value === 'function' ? { enter: value } : value;

      rootVisitor[type] = rootVisitor[type] || [];
      rootVisitor[type].push(normalized);
    }
  }

  walkImpl(root, rootVisitor);
}
