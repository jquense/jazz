/* eslint-disable no-restricted-syntax */
import postcss, { ChildNode } from 'postcss';

import Parser from '../parsers';
import {
  DeclarationValue,
  EachCondition,
  Expression,
  Nodes,
  SelectorList,
} from '../parsers/Ast';

export type Path<T = AnyNode> = {
  node: T;
  parent?: AnyNode;
  parser: Parser;
  remove(): void;
  skip(): void;
  replaceWith(nodes: AnyNode | AnyNode[]): void;
  visit(key: keyof T): void;
  visitChildren(): void;
  key: string | undefined;
  index: number | undefined;
};

export type VisitorFn<TContext, TNode = AnyNode> = (
  this: TContext,
  api: Path<TNode>,
) => void | AnyNode | AnyNode[];

// export type NormalVisitor = { enter?: VisitorFn; leave?: VisitorFn };

// export type Visitor = VisitorFn | NormalVisitor;

// export type VisitorMap = Record<string, Visitor>;

// type NormalVisitorMap = {} & Record<string, NormalVisitor[]>;

// const buildError = (child: postcss.Node, e: any) => {
//   e.postcssNode = child;
//   if (e.stack && child.source && /\n\s{4}at /.test(e.stack)) {
//     const s = child.source;
//     e.stack = e.stack.replace(
//       /\n\s{4}at /,
//       `$&${s.input.from}:${s.start!.line}:${s.start!.column}$&`,
//     );
//   }
//   return e;
// };

// function walkImpl(root: postcss.Container, visitors: NormalVisitorMap) {
//   root.each((child, i) => {
//     const visitor = visitors[child.type];

//     let skipped = false;
//     const skip = () => {
//       skipped = true;
//     };

//     try {
//       visitor?.forEach((v) => v.enter?.call({ skip }, child, i));
//     } catch (e) {
//       throw buildError(child, e);
//     }
//     if (!skipped && 'walk' in child) {
//       walkImpl(child, visitors);
//     }
//     try {
//       visitor?.forEach((v) => v.leave?.call({ skip }, child, i));
//     } catch (e) {
//       throw buildError(child, e);
//     }
//   });
// }

export type EachAtRule = postcss.AtRule & {
  conditionNodes: EachCondition;
};

export type ParsedAtRule<T = any> = postcss.AtRule & {
  paramNodes?: T;
};

export type ParsedRule = postcss.Rule & { selectorNodes: SelectorList };

export type ParsedDeclaration = postcss.Declaration & {
  valueNodes: DeclarationValue;
  propNodes: Expression;
};

export type AnyNode =
  | Nodes
  | postcss.Root
  | ParsedAtRule
  | EachAtRule
  | ParsedRule
  | ParsedDeclaration
  | postcss.Comment;

function remove(parent: any, prop: string, index?: number) {
  if (!parent) return;

  if (index != null) {
    parent[prop].splice(index, 1);
  } else {
    delete parent[prop];
  }
}

function replaceWith(
  parent: any,
  prop: string,
  index: number | undefined,
  nodes: AnyNode | AnyNode[],
) {
  if (!parent) return;

  if (index != null) {
    if (Array.isArray(nodes)) {
      nodes = nodes.concat().reverse();

      for (const next of nodes) {
        parent[prop].splice(index + 1, 0, next);
      }
      remove(parent, prop, index);
    } else {
      parent[prop][index] = nodes;
    }
  } else {
    parent[prop] = nodes;
  }
}

type Types = AnyNode['type'];

type Visitors<T> = Partial<{ [P in Types]: VisitorFn<T> }>;

const isKeyframes = (node?: AnyNode) =>
  node && node.type === 'atrule' && node.name === 'keyframes';

export default class Walker<T> {
  constructor(private context: T, public parser: Parser) {}

  visit(
    root: AnyNode,
    visitors: Visitors<T>,
    parent?: AnyNode,
    prop?: string,
    index?: number,
  ) {
    let called = false;
    let skipped = false;
    let removed = false;

    let replacement: AnyNode | AnyNode[] | null | undefined = null;

    const seen = new WeakSet<AnyNode>();

    const visit = (key: string) => {
      const value = (root as any)[key];

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          if (
            value[i] != null &&
            typeof value[i].type === 'string' &&
            !seen.has(value[i])
          ) {
            seen.add(value[i]);
            // console.log('H', value);
            if (!this.visit(value[i], visitors, root, key, i)) {
              // removed
              i--;
            }
          }
        }
      } else if (
        value != null &&
        typeof value.type === 'string' &&
        !seen.has(value)
      ) {
        seen.add(value);
        this.visit(value, visitors, root, key, undefined);
      }
    };

    const visitChildren = () => {
      called = true;

      // we micro optimizing here
      // eslint-disable-next-line guard-for-in
      for (const key in root) {
        if (key === 'parent' || typeof (root as any)[key] !== 'object') {
          continue;
        }
        visit(key);
      }
    };

    const visitor = visitors[root.type];

    if (root.type === 'decl') {
      if (!root.propNodes) root.propNodes = this.parser.prop(root);
      if (!root.valueNodes) root.valueNodes = this.parser.value(root);
    }
    // if (root.type === 'atrule' && root.name === 'each') {
    //   (root as EachAtRule).conditionNodes = this.parser.eachCondition(root);
    // }
    if (root.type === 'rule' && !root.selectorNodes && !isKeyframes(parent)) {
      root.selectorNodes = this.parser.selector(root.selector);
    }

    if (visitor) {
      const result = visitor.call(this.context, {
        node: root,
        visit,
        visitChildren,
        parent,
        index,
        key: prop,
        parser: this.parser,
        replaceWith(nodes: AnyNode | AnyNode[]) {
          replacement = nodes;
        },
        skip() {
          skipped = true;
        },
        remove() {
          removed = true;
        },
      });

      // @ts-ignore
      replacement = replacement || result;

      if (replacement) {
        replaceWith(parent, prop!, index, replacement);
      }
      if (removed) {
        remove(parent, prop!, index);
      }

      if (removed) return null;
    }

    if (!called && !skipped) {
      visitChildren();
    }

    if (root.type === 'rule' && root.selectorNodes) {
      root.selector = root.selectorNodes.toString();
    }
    if (root.type === 'decl') {
      root.prop = root.propNodes.toString();
      root.value = root.valueNodes.toString();
    }

    return skipped ? root : replacement ?? root;
  }
}

// function walk(root: postcss.Container, visitor: VisitorMap) {
//   const rootVisitor: Record<string, NormalVisitor[]> = {};

//   for (const key of Object.keys(visitor)) {
//     const value = visitor[key];

//     for (const type of key.split('|')) {
//       const normalized =
//         typeof value === 'function' ? { enter: value } : value;

//       rootVisitor[type] = rootVisitor[type] || [];
//       rootVisitor[type].push(normalized);
//     }
//   }

//   walkImpl(root, rootVisitor);
// }
