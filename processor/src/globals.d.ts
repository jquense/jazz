/* eslint-disable */

declare module '@modular-css/processor' {
  import type postcss, { CssSyntaxError } from 'postcss';

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

declare module 'postcss/lib/css-syntax-error' {
  import type { CssSyntaxError as ICssSyntaxError } from 'postcss';

  declare class CssSyntaxError implements ICssSyntaxError {
    constructor(msg: string);
  }

  export default CssSyntaxError;
}

declare module 'postcss/lib/input' {
  import type { ParserInput, CssSyntaxError } from 'postcss';

  export default class Input {
    public readonly css: string;
    constructor(css: ParserInput, opts?: any);
    error(msg: string, line: number, col: number): CssSyntaxError;
  }
}

declare module 'postcss-scss/lib/scss-parser' {
  import type { Container, Declaration, ChildNode } from 'postcss';
  import type Input from 'postcss/lib/input';

  export type Token = [
    tokenType: string,
    token: string,
    startLine?: number,
    startCol?: number,
    endLine?: number,
    endCol?: number,
  ];

  interface Tokenizer {
    nextToken(): Token | undefined;
    back(token: Token): void;
    position(): number;
  }

  class NestedDeclaration extends Declaration {
    type: 'decl';

    isNested: true;

    nodes?: ChildNode[];
    first?: ChildNode;
    last?: ChildNode;
  }

  class Parser {
    constructor(input: Input, opts: any);

    current: Container | NestedDeclaration;

    tokenizer: Tokenizer;

    readonly input: Input;

    rule(tokens: Token): void;
    atrule(tokens: Token): void;
    decl(tokens: Token): void;

    root: Root;

    parse(): void;
  }

  export default Parser;
}

declare module '@csstools/convert-colors' {
  type Tuple3<T> = [T, T, T];

  export declare function rgb2hwb(
    r: number,
    g: number,
    b: number,
  ): Tuple3<number>;

  export declare function hwb2rgb(
    h: number,
    w: number,
    b: number,
  ): Tuple3<number>;

  export declare function rgb2hsl(
    r: number,
    g: number,
    b: number,
  ): Tuple3<number>;

  export declare function hsl2rgb(
    h: number,
    s: number,
    l: number,
  ): Tuple3<number>;
}
