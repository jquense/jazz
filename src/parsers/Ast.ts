/* eslint-disable max-classes-per-file */

import { isValid } from 'khroma';

import interleave from '../utils/interleave';
import conversions from '../utils/unit-conversions';

const tag = `@@typeof/Node`;

function cloneNode(obj: Node, parent?: Node) {
  // @ts-ignore
  const cloned = obj.constructor ? new obj.constructor() : Object.create(null);

  for (let [key, value] of Object.entries(obj)) {
    const type = typeof value;

    if (key === 'parent' && type === 'object') {
      if (parent) cloned[key] = parent;
    } else if (Array.isArray(value)) {
      cloned[key] = value.map((j) => cloneNode(j, cloned));
    } else {
      if (type === 'object' && value !== null) {
        value = cloneNode(value);
      }
      cloned[key] = value;
    }
  }
  // console.log(cloned, parent);
  return cloned;
}

export abstract class Node<T extends string = any> {
  abstract type: T;

  parent: Container | null = null;

  [Symbol.hasInstance](inst: any) {
    return inst && inst[Symbol.for(tag)] === true;
  }

  replaceWith(nodes: Node | Node[]) {
    this.parent!.insertAfter(this, nodes);
    this.parent!.removeChild(this);
  }

  remove() {
    this.parent?.removeChild(this);
    return this;
  }

  clone(): this {
    const cloned = cloneNode(this);

    return cloned;
  }
}

// @ts-ignore
Node.prototype[Symbol.for(tag)] = true;

export const isNode = (node: any): node is Node => node instanceof Node;

export type Value =
  | Color
  | Numeric
  | StringLiteral
  | StringTemplate
  | Url
  | Calc
  | MathFunction
  | Function
  | Variable
  | InterpolatedIdent
  | Ident;

export type ExpressionTerm =
  | Operator
  | Variable
  | StringTemplate
  | StringLiteral
  | Numeric
  | Color
  | Calc
  | Function
  | Ident
  | InterpolatedIdent
  | Url
  | Interpolation;

export type ReducedExpression =
  | StringLiteral
  | Numeric
  | Color
  | Calc
  | Operator
  | Ident
  | Url;

// export enum NodeKind {
//   Ident = 'ident',
//   Numeric = 'numeric',
//   StringTemplate = 'string-template',
//   StringLiteral = 'string',
//   Url = 'url',
//   Expression = 'expression',
//   Block = 'block',
//   NotKeyword = 'not-keyword',
//   OrKeyword = 'or-keyword',
//   Variable =
// }

export type ChildNode =
  | Operator
  | Variable
  | Color
  | StringTemplate
  | StringLiteral
  | Numeric
  | Function
  | Ident
  | InterpolatedIdent
  | Url
  | Interpolation
  | Expression;

type WalkerIterable = Iterable<[ChildNode, { index: number; skip(): void }]>;

export abstract class Container<T extends Node = Node> extends Node {
  protected _nodes: T[] = [];

  private currentIndices: Record<number, number> = Object.create(null);

  private id = 0;

  constructor(nodes?: T | readonly T[]) {
    super();

    if (nodes) this.push(...([] as T[]).concat(nodes));
  }

  get nodes(): readonly T[] {
    return this._nodes;
  }

  set nodes(nodes: readonly T[]) {
    this._nodes = this.normalize(nodes as T[]);
  }

  push(...children: T[]) {
    for (const child of children) {
      if (child == null) continue;
      child.parent = this;

      this._nodes.push(child);
    }

    return this;
  }

  *children(): Iterable<[T, number]> {
    if (!this.nodes) {
      return;
    }

    const id = ++this.id;

    this.currentIndices[id] = 0;

    let index: number;

    try {
      while (this.currentIndices[id] < this.nodes.length) {
        index = this.currentIndices[id];

        yield [this.nodes[index], index];

        this.currentIndices[id]++;
      }
    } finally {
      delete this.currentIndices[id];
    }
  }

  *ancestors(): WalkerIterable {
    for (const [child, index] of this.children()) {
      let skipped = false;
      yield [
        child as any,
        {
          index,
          skip() {
            skipped = true;
          },
        },
      ];
      const next = !skipped && (child as any).ancestors?.();
      // console.log('i:', next);
      if (next) yield* next;
    }
  }

  append(...children: T[]) {
    for (const child of children) {
      const nodes = this.normalize(child);
      for (const node of nodes) this._nodes.push(node);
    }
    return this;
  }

  insertAfter(node: T, itemsToAdd: T | T[]) {
    const current = this.nodes.indexOf(node);

    const nodes = this.normalize(itemsToAdd).reverse();
    for (const next of nodes) {
      this._nodes.splice(current + 1, 0, next);
    }

    for (const [id, index] of Object.entries(this.currentIndices)) {
      if (current < index) {
        this.currentIndices[id as any] = index + nodes.length;
      }
    }

    return this;
  }

  removeChild(child: T) {
    const idx = this.nodes.indexOf(child);
    child.parent = null;
    this._nodes.splice(idx, 1);

    for (const [id, index] of Object.entries(this.currentIndices)) {
      if (index >= idx) {
        this.currentIndices[id as any] = index - 1;
      }
    }

    return this;
  }

  private normalize(nodes: T | T[]) {
    if (!Array.isArray(nodes)) nodes = [nodes];
    for (const node of nodes) {
      if (node == null) continue;
      if (node.parent) node.parent.removeChild(node);
      node.parent = this;
    }
    return nodes;
  }

  toString() {
    let result = '';

    for (const [idx, node] of this.nodes.entries()) {
      const last = idx > 0 ? this.nodes[idx - 1] : null;

      result +=
        last && node.type !== 'separator'
          ? ` ${node.toString()}`
          : node.toString();
    }

    return result;
  }
}

export type ListItem = Value | Operator | List;

export class List extends Container<ListItem> {
  type = 'list' as const;

  constructor(nodes: readonly ListItem[], public separator?: Separator) {
    super(nodes);
  }

  static fromTokens(head: Value, tail: Array<[Separator, Value]>) {
    let list = new List([head]);
    for (const [separator, item] of tail) {
      if (!list.separator) {
        list.separator = separator;
      } else if (list.separator !== separator) {
        list = new List([list], separator);
      }

      list.push(item);
    }

    return list;
  }

  toString() {
    let result = '';

    let sep: string = this.separator || ' ';
    if (this.separator === '/') sep = ' / ';
    if (this.separator === ',') sep += ' ';

    for (const [idx, node] of this.nodes.entries()) {
      result +=
        idx !== this.nodes.length - 1
          ? `${node.toString()}${sep}`
          : node.toString();
    }

    return result;
  }
}

export class Expression extends Container<ExpressionTerm | Expression> {
  type = 'expression' as const;
}

export class Root<T extends Node = ChildNode> extends Container<T> {
  type = 'root' as const;

  get body() {
    return this.nodes[0];
  }
}

export class Numeric extends Node {
  type = 'numeric' as const;

  constructor(public value: number, public unit: string | null = null) {
    super();

    this.unit = unit?.toLowerCase() ?? null;
  }

  static compatible(a: Numeric, b: Numeric) {
    if (a.unit && b.unit) {
      if (a.unit === b.unit) return true;
      if (!(b.unit in conversions)) return false;
      if (!(a.unit in conversions[b.unit])) return false;
    }

    return true;
  }

  toString() {
    return `${this.value}${this.unit || ''}`;
  }

  convert(toUnit: string | null, precision = 5) {
    if (!toUnit || this.unit === toUnit) return this;

    const targetNormal = toUnit.toLowerCase();
    if (!this.unit) {
      this.unit = targetNormal;
      return this;
    }

    if (
      !(targetNormal in conversions) ||
      !(this.unit in conversions[targetNormal])
    ) {
      throw new Error(`Cannot convert from ${this.unit} to ${toUnit}`);
    }

    let converted = conversions[targetNormal][this.unit] * this.value;

    if (precision != null) {
      // eslint-disable-next-line no-bitwise
      precision = 10 ** (precision >>> 0);
      converted = Math.round(converted * precision) / precision;
    }

    return new Numeric(converted, toUnit);
  }
}

export class Color extends Node {
  type = 'color' as const;

  constructor(public value: string) {
    super();
  }

  static isValidColor(name: string) {
    return isValid(name);
  }

  toString() {
    return `${this.value}`;
  }
}

export class Url extends Node {
  type = 'url' as const;

  constructor(public value: string, public quoted: boolean) {
    super();
  }
}

export const SINGLE = "'" as const;
export const DOUBLE = '"' as const;

export class StringLiteral extends Node {
  type = 'string' as const;

  constructor(public value: string, public quote: '"' | "'") {
    super();
  }

  toString() {
    return `${this.quote}${this.value}${this.quote}`;
  }
}

export class StringTemplate extends Container<ListItem> {
  type = 'string-template' as const;

  constructor(
    public quasis: string[],
    expressions: ListItem[] = [],
    public quote: '"' | "'",
  ) {
    super(expressions);
  }

  get expressions() {
    return this.nodes;
  }

  static fromTokens(parts: Array<string | Interpolation>, quote: '"' | "'") {
    const strings = [];
    const values = [];
    let current = '';

    for (const item of parts) {
      if (typeof item === 'string') current += item;
      else {
        strings.push(current);
        values.push(item.value);
        current = '';
      }
    }
    strings.push(current);

    if (!values.length) {
      return new StringLiteral(strings.join(''), quote);
    }
    return new StringTemplate(strings, values, quote);
  }

  toString(): string {
    const inner = interleave(this.quasis, this.nodes)
      .map((e) => e.toString())
      .join('');

    return `${this.quote}${inner}${this.quote}`;
  }
}

export type ArthimeticOperators = '+' | '-' | '*' | '/' | '%' | '**';

export type RelationalOperators = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type LogicalOperators = 'not' | 'and' | 'or';

export type UnaryOperators = '+' | '-' | 'not';

export type Operators =
  | ArthimeticOperators
  | RelationalOperators
  | LogicalOperators;

export class Operator extends Node {
  type = 'operator' as const;

  constructor(public value: Operators) {
    super();
  }

  toString() {
    return `${this.value}`;
  }
}

export type Comma = ',';
export type Space = ' ';
export type Slash = '/';

export type Separator = Comma | Space | Slash;

// export class Separator extends Node {
//   type = 'separator' as const;

//   constructor(public value: ',' | ' ' | '/') {
//     super();
//   }

//   toString() {
//     return `${this.value}`;
//   }
// }

export class Variable extends Node {
  type = 'variable' as const;

  constructor(public name: string, public namespace?: string) {
    super();
  }

  toString() {
    return `${this.namespace ? `${this.namespace}.` : ''}$${this.name}`;
  }
}

export class NotKeyword extends Node {
  type = 'not-keyword' as const;
}

export class OrKeyword extends Node {
  type = 'or-keyword' as const;
}

export class Ident extends Node {
  type = 'ident' as const;

  constructor(public name: string, public namespace?: string) {
    super();
  }

  get isCustomProperty() {
    return this.name.startsWith('--');
  }

  toString() {
    return this.namespace ? `${this.namespace}.${this.name}` : this.name;
  }
}

export class Function extends Container<ListItem> {
  type = 'function' as const;

  separator: Separator | undefined;

  constructor(public name: Ident, params: List) {
    super(params.nodes);
    this.separator = params.separator;
  }

  separateArgumentsBy(sep: Separator) {
    const current = this.separator;

    this.separator = sep;

    if (current === sep) return;
    if (!current && this.nodes.length <= 1) return;

    this._nodes = [];
    this.push(new List(this.nodes, current));
  }

  get isVar() {
    return (
      this.name.toString() === 'var' &&
      this.nodes[0].type === 'ident' &&
      this.nodes[0].isCustomProperty
    );
  }

  toString() {
    return `${this.name}(${List.prototype.toString.call(this)})`;
  }

  // split(sep: ' ' | ',' | '/' = ','): Expression[] {
  //   const result = [] as Expression[];
  //   let current = new Expression([]);

  //   for (const [node] of this.children()) {
  //     if (node.type === 'separator' && node.value === sep) {
  //       result.push(current);
  //       current = new Expression([]);
  //     } else {
  //       current.push(node);
  //     }
  //   }
  //   result.push(current);
  //   return result;
  // }
}

export class MathFunction extends Container<BinaryExpressionTerm> {
  type = 'math-function' as const;

  readonly separator: Separator | undefined = ',';

  constructor(
    public name: 'clamp' | 'min' | 'max',
    params: BinaryExpressionTerm[],
  ) {
    // unwrap nested calcs
    super(params?.map((p) => (p.type === 'calc' ? p.expression : p)));
  }

  toString(): string {
    return `${this.name}(${List.prototype.toString.call(this)})`;
  }
}

export class Calc extends Container<BinaryExpressionTerm> {
  type = 'calc' as const;

  constructor(expression: BinaryExpressionTerm) {
    super([expression]);
  }

  get expression() {
    return this.nodes[0];
  }

  set expression(expr: BinaryExpressionTerm) {
    this.nodes[0].replaceWith(expr);
  }

  toString(): string {
    return `calc(${this.expression.toString()})`;
  }
}

export class Interpolation extends Container<ListItem> {
  type = 'interpolation' as const;

  constructor(public value: ListItem) {
    super(value);
  }

  toString() {
    return `#{${super.toString()}}`;
  }
}

export const PARENS = ['(', ')'] as const;
export const SQUARE = ['[', ']'] as const;
export const CURLY = ['{', '}'] as const;

// export class Block extends Container {
//   type = 'block' as const;

//   constructor(
//     nodes: Expression | BinaryExpression,
//     public brackets: typeof CURLY | typeof SQUARE | typeof PARENS = PARENS,
//   ) {
//     super(nodes);
//   }

//   toString() {
//     return `${this.brackets[0]}${super.toString()}${this.brackets[1]}`;
//   }
// }

export class InterpolatedIdent extends Container<ListItem> {
  type = 'interpolated-ident' as const;

  constructor(public quasis: string[], expressions: Array<ListItem> = []) {
    super(expressions);
  }

  static fromTokens(tokens: Array<string | Interpolation>) {
    const strings = [];
    const values = [];
    let current = '';

    for (const item of tokens) {
      if (typeof item === 'string') current += item;
      else {
        strings.push(current);
        values.push(item.value);
        current = '';
      }
    }
    strings.push(current);

    if (
      values.length === 1 &&
      strings.length === 2 &&
      strings[0] === '' &&
      strings[1] === ''
    ) {
      return values[0];
    }

    if (!values.length && strings.length === 1) {
      const str = strings[0];
      return Color.isValidColor(str) ? new Color(str) : new Ident(str);
    }

    return !values.length && strings.length === 1
      ? new Ident(strings[0])
      : new InterpolatedIdent(strings, values);
  }

  get expressions() {
    return this.nodes;
  }

  toString(): string {
    return interleave(this.quasis, this.nodes)
      .map((e) => e.toString())
      .join('');
  }
}

export type BinaryExpressionTerm = Value | BinaryExpression | UnaryExpression;

export class UnaryExpression extends Container<BinaryExpressionTerm> {
  type = 'unary-expression' as const;

  constructor(
    public operator: UnaryOperators,
    argument: BinaryExpressionTerm,
  ) {
    super([argument]);
  }

  get argument() {
    return this.nodes[0];
  }

  set argument(argument: BinaryExpressionTerm) {
    this.nodes[0].replaceWith(argument);
  }

  toString(): string {
    const { argument, operator: op } = this;
    let str = argument.toString();

    if (argument.type === 'binary-expression') str = `(${str})`;
    if (argument.type === 'numeric' && argument.value < 0) return str;
    return `${op === 'not' ? 'not ' : op}${str}`;
  }
}

export class BinaryExpression extends Container {
  type = 'binary-expression' as const;

  readonly nodes!: [BinaryExpressionTerm, Operator, BinaryExpressionTerm];

  constructor(
    left: BinaryExpressionTerm,
    operator: Operator,
    right: BinaryExpressionTerm,
  ) {
    super([left, operator, right]);
  }

  get left(): BinaryExpressionTerm {
    return this.nodes[0] as any;
  }

  set left(left: BinaryExpressionTerm) {
    this.nodes[0].replaceWith(left);
  }

  get operator(): Operator {
    return this.nodes[1] as any;
  }

  set operator(op: Operator) {
    this.nodes[1].replaceWith(op);
  }

  get right(): BinaryExpressionTerm {
    return this.nodes[2] as any;
  }

  set right(right: BinaryExpressionTerm) {
    this.nodes[2].replaceWith(right);
  }

  toString(): string {
    const leftStr = this.left.toString();
    const left =
      this.left.type === 'binary-expression' ? `(${leftStr})` : leftStr;

    const rightStr = this.right.toString();
    const right =
      this.right.type === 'binary-expression' ? `(${rightStr})` : rightStr;
    return `${left} ${this.operator.toString()} ${right}`;
  }

  static fromTokens(
    head: BinaryExpressionTerm,
    tail: Array<[Operator, BinaryExpressionTerm]>,
  ) {
    let result = head;

    for (let [op, right] of tail) {
      if (right.type === 'calc') right = right.nodes[0] as BinaryExpression;

      result =
        op.value === '**'
          ? new BinaryExpression(right, op, result)
          : new BinaryExpression(result, op, right);
    }
    return result;
  }
}

export type ClassName = {
  type: 'class';
  name: 'string';
};

export class ImportNamespaceSpecifier extends Node {
  type = 'namespace' as const;

  constructor(public imported: Ident, public local: Ident = imported) {
    super();
  }
}

export class ImportNamedSpecifier extends Node {
  type = 'named' as const;

  constructor(
    public imported: Variable | Ident,
    public local: Variable | Ident,
  ) {
    super();
  }
}

export class Import extends Container {
  type = 'import' as const;

  constructor(
    public source: string,
    specifiers: Array<ImportNamespaceSpecifier | ImportNamedSpecifier>,
  ) {
    super(specifiers);
  }

  get specifiers() {
    return this.nodes as Array<
      ImportNamespaceSpecifier | ImportNamedSpecifier
    >;
  }
}

export class ExportAllSpecifier extends Node {
  type = 'all' as const;
}

export class ExportSpecifier extends Node {
  type = 'named' as const;

  constructor(public exported: Variable, public local: Variable) {
    super();
  }
}

export class Export extends Container {
  type = 'export' as const;

  constructor(
    specifiers:
      | ExportSpecifier
      | ExportAllSpecifier
      | Array<ExportSpecifier | ExportAllSpecifier>,
    public source?: string,
  ) {
    super(specifiers);
  }

  get specifiers() {
    return this.nodes as Array<ExportSpecifier | ExportAllSpecifier>;
  }
}
