/* eslint-disable */

declare module '@modular-css/processor' {
  import type postcss from 'postcss';

  class Processor {
    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(options: any) {}

    resolve: (src: string, file: string) => string;

    normalize: (path: string) => string;

    options: any;

    files: Map<string, File>;

    graph: Graph<string>;

    protected _before: postcss.Processor;

    protected _process: postcss.Processor;

    protected _after: postcss.Processor;

    protected _done: postcss.Processor;

    // Add a file on disk to the dependency graph
    async file(file: string): any {}

    // Add a file by name + contents to the dependency graph
    async string(file: string, text: string): any {}

    // Add an existing postcss Root object by name
    async root(file: string, root: postcss.Root): any {}
  }

  export default Processor;
}

declare namespace jest {
  interface Matchers<R> {
    toMatchCss(css: string): R;
  }
}

declare module 'postcss/lib/input' {
  import type { ParserInput } from 'postcss';

  export default class Input {
    constructor(css: string);
  }
}

declare module 'postcss-values-parser/lib/ValuesParser' {
  import type { Input, Parser } from 'postcss';
  import type { ParseOptions, Root } from 'postcss-values-parser';

  export type Token = [string, string, number, number, number, number];

  declare class ValuesParser extends Parser {
    constructor(input: Input, opts: ParseOptions);

    unknownWord(tokens: Token[]): void;

    root: Root;

    parse(): void;
  }

  export default ValuesParser;
}

declare module 'postcss-values-parser/lib/ValuesStringifier' {
  import type { Stringifier } from 'postcss';
  declare class ValuesStringifier extends Stringifier {
    static stringify(...args: any[]): any;
  }

  export default ValuesStringifier;
}

declare module 'postcss-values-parser/lib/nodes/Operator' {
  import type { Parser, Node } from 'postcss';
  import type { NodeOptions } from 'postcss-selector-parser';

  declare class Operator extends Node {
    constructor(options: NodeOptions) {}

    static chars: string[];

    static fromTokens(tokens: Token, parser: any): Void;

    static get regex(): RegExp;

    static tokenize(tokens: Token[], parser: any): void;
  }

  export default Operator;
}
