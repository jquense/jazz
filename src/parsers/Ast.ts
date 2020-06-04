/* eslint-disable max-classes-per-file */

import { hex, hsla, isValid, rgba } from 'khroma';

import interleave from '../utils/interleave';
import conversions from '../utils/unit-conversions';

const tag = `@@typeof/Node`;

export type Identifier = {
  type: 'identifier';
  name: 'string';
};

// export type Variable = {
//   type: 'variable';
//   name: 'string';
// };

function cloneNode(obj: Node, parent?: Node) {
  // @ts-ignore
  const cloned = new obj.constructor();

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

  clone(): this {
    const cloned = cloneNode(this);

    return cloned;
  }
}

// @ts-ignore
Node.prototype[Symbol.for(tag)] = true;

type iterator = (node: Node | Container, idx: number) => void | false;

export const isNode = (node: any): node is Node => node instanceof Node;

export type ExpressionTerm =
  | Operator
  | Separator
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
  | Block
  | Interpolation;

export type ReducedExpression =
  | Separator
  | StringLiteral
  | Numeric
  | Color
  | Function
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
  | Block
  | Interpolation
  | Expression;

type WalkerIterable = Iterable<[ChildNode, { index: number; skip(): void }]>;

export abstract class Container<T extends Node = Node> extends Node {
  nodes: T[] = [];

  private currentIndices: Record<number, number> = Object.create(null);

  private id = 0;

  constructor(nodes?: T | T[]) {
    super();
    if (nodes) ([] as T[]).concat(nodes).forEach((n) => this.push(n));
  }

  push(child: T) {
    child.parent = this;
    this.nodes.push(child);
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
      for (const node of nodes) this.nodes.push(node);
    }
    return this;
  }

  insertAfter(node: T, itemsToAdd: T | T[]) {
    const current = this.nodes.indexOf(node);

    const nodes = this.normalize(itemsToAdd).reverse();
    for (const next of nodes) {
      this.nodes.splice(current + 1, 0, next);
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
    this.nodes.splice(idx, 1);

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

export class Expression extends Container<ExpressionTerm | Expression> {
  type = 'expression' as const;
}

export type BinaryExpressionTerm = ExpressionTerm | BinaryExpression;

export class BinaryExpression extends Container<
  BinaryExpressionTerm | Operator
> {
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

  static fromTokens(
    head: BinaryExpressionTerm,
    tail: Array<[Operator, BinaryExpressionTerm]>,
  ) {
    let result = head;
    for (let [op, right] of tail) {
      if (right.type === 'calc')
        right = right.nodes[0] as BinaryExpressionTerm;

      result = new BinaryExpression(result, op, right);
    }
    return result;
  }
}

export class Root extends Container {
  type = 'root' as const;

  get body() {
    return this.nodes[0] as ChildNode;
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
      if (!(b.unit in conversions)) return false;
      if (!(a.unit in conversions[b.unit])) return false;
    }

    return true;
  }

  toString() {
    return `${this.value}${this.unit || ''}`;
  }

  add(b: Numeric) {
    const result = new Numeric(this.value, this.unit).convert(b.unit);
    result.value += b.value;
    return result;
  }

  subtract(b: Numeric) {
    const result = new Numeric(this.value, this.unit).convert(b.unit);
    result.value -= b.value;
    return result;
  }

  multiply(b: Numeric) {
    if (b.unit)
      throw new Error(
        `cannot multiply ${this} with ${b} because the units are incompatible`,
      );

    const result = new Numeric(this.value, this.unit);
    return new Numeric(result.value * b.value, result.unit);
  }

  divide(b: Numeric) {
    if (b.unit)
      throw new Error(
        `cannot divide ${this} and ${b} because the units are incompatible`,
      );

    const result = new Numeric(this.value, this.unit);
    return new Numeric(result.value / b.value, result.unit);
  }

  convert(toUnit: string | null, precision = 5) {
    if (!toUnit) return this;

    const targetNormal = toUnit.toLowerCase();
    if (!this.unit) {
      this.unit = targetNormal;
      return this;
    }

    if (!(targetNormal in conversions)) {
      throw new Error(`Cannot convert to ${toUnit}`);
    }
    if (!(this.unit in conversions[targetNormal])) {
      throw new Error(`Cannot convert from ${this.unit} to ${toUnit}`);
    }

    const converted = conversions[targetNormal][this.unit] * this.value;

    if (precision != null) {
      // eslint-disable-next-line no-bitwise
      precision = 10 ** (precision >>> 0);

      this.value = Math.round(converted * precision) / precision;
      return this;
    }

    this.value = converted;
    return this;
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

export class StringTemplate extends Container<
  StringLiteral | Expression | ExpressionTerm
> {
  type = 'string-template' as const;

  constructor(
    public quasis: string[],
    expressions: Array<StringLiteral | Expression | ExpressionTerm> = [],
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

export type Operators =
  | ','
  | '+'
  | '-'
  | '*'
  | '/'
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | '!=';

export class Operator extends Node {
  type = 'operator' as const;

  constructor(public value: Operators) {
    super();
  }

  toString() {
    return `${this.value}`;
  }
}

export class Separator extends Node {
  type = 'separator' as const;

  constructor(public value: string) {
    super();
  }

  toString() {
    return `${this.value}`;
  }
}

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

export class Function extends Container<ExpressionTerm | Expression> {
  type = 'function' as const;

  constructor(public name: Ident, params: Expression) {
    super(params.nodes);
  }

  toString() {
    return `${this.name}(${super.toString()})`;
  }

  split(sep: ' ' | ',' | '/' = ','): Expression[] {
    const result = [] as Expression[];
    let current = new Expression([]);

    for (const [node] of this.children()) {
      if (node.type === 'separator' && node.value === sep) {
        result.push(current);
        current = new Expression([]);
      } else {
        current.push(node);
      }
    }
    result.push(current);
    return result;
  }
}

export class Calc extends Container {
  type = 'calc' as const;

  get expression() {
    return this.nodes[0] as MathExpressionTerm;
  }

  set expression(expr: MathExpressionTerm) {
    this.nodes[0].replaceWith(expr);
  }

  toString() {
    return `calc(${super.toString()})`;
  }
}

export class Interpolation extends Container<Expression> {
  type = 'interpolation' as const;

  constructor(public value: Expression) {
    super(value);
  }

  toString() {
    return `#{${super.toString()}}`;
  }
}

export const PARENS = ['(', ')'] as const;
export const SQUARE = ['[', ']'] as const;
export const CURLY = ['{', '}'] as const;

export class Block extends Container {
  type = 'block' as const;

  constructor(
    nodes: Expression | MathExpression,
    public brackets: typeof CURLY | typeof SQUARE | typeof PARENS = PARENS,
  ) {
    super(nodes);
  }

  toString() {
    return `${this.brackets[0]}${super.toString()}${this.brackets[1]}`;
  }
}

export class InterpolatedIdent extends Container {
  type = 'interpolated-ident' as const;

  constructor(
    public quasis: string[],
    expressions: Array<Expression | ExpressionTerm> = [],
  ) {
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
      return new Interpolation(values[0]);
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

  toString() {
    return interleave(this.quasis, this.nodes)
      .map((e) => e.toString())
      .join('');
  }
}

export class List extends Container {
  type = 'list' as const;

  constructor(public nodes: Node[], public separator: string = ',') {
    super(nodes);
  }
}

export type MathExpressionTerm =
  | MathExpression
  | Numeric
  | Variable
  | Calc
  | Variable
  | Block
  | Function;

export class MathExpression extends Container {
  type = 'math-expression' as const;

  readonly nodes!: [MathExpressionTerm, Operator, MathExpressionTerm];

  constructor(
    left: MathExpressionTerm,
    operator: Operator,
    right: MathExpressionTerm,
  ) {
    super([left, operator, right]);
  }

  get left(): MathExpressionTerm {
    return this.nodes[0] as any;
  }

  set left(left: MathExpressionTerm) {
    this.nodes[0].replaceWith(left);
  }

  get operator(): Operator {
    return this.nodes[1] as any;
  }

  set operator(op: Operator) {
    this.nodes[1].replaceWith(op);
  }

  get right(): MathExpressionTerm {
    return this.nodes[2] as any;
  }

  set right(right: MathExpressionTerm) {
    this.nodes[2].replaceWith(right);
  }

  static fromTokens(
    head: MathExpressionTerm,
    tail: Array<[Operator, MathExpressionTerm]>,
  ) {
    let result = head;
    for (let [op, right] of tail) {
      if (right.type === 'calc') right = right.nodes[0] as MathExpression;

      result = new MathExpression(result, op, right);
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
