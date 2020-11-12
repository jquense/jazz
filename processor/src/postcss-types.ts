/* eslint-disable @typescript-eslint/ban-types */
import type {
  CssSyntaxError,
  NodeErrorOptions,
  NodeRaws,
  NodeSource,
  Result,
  Stringifier,
  Syntax,
  WarningOptions,
} from 'postcss';

import type { AtRule, Comment, Declaration, Root, Rule } from './Ast';

export interface NodeBase<TChild, TNode> {
  /**
   * Returns the input source of the node. The property is used in source
   * map generation. If you create a node manually
   * (e.g., with postcss.decl() ), that node will not have a source
   * property and will be absent from the source map. For this reason, the
   * plugin developer should consider cloning nodes to create new ones
   * (in which case the new node's source will reference the original,
   * cloned node) or setting the source property manually.
   */
  source?: NodeSource;
  /**
   * Contains information to generate byte-to-byte equal node string as it
   * was in origin input.
   */
  raws: NodeRaws;

  root(): Root;

  /**
   * @returns A CSS string representing the node.
   */
  toString(stringifier?: Stringifier | Syntax): string;
  /**
   * This method produces very useful error messages. If present, an input
   * source map will be used to get the original position of the source, even
   * from a previous compilation step (e.g., from Sass compilation).
   * @returns The original position of the node in the source, showing line
   * and column numbers and also a small excerpt to facilitate debugging.
   */
  error(
    /**
     * Error description.
     */
    message: string,
    options?: NodeErrorOptions,
  ): CssSyntaxError;
  /**
   * Creates an instance of Warning and adds it to messages. This method is
   * provided as a convenience wrapper for Result#warn.
   * Note that `opts.node` is automatically passed to Result#warn for you.
   * @param result The result that will receive the warning.
   * @param text Warning message. It will be used in the `text` property of
   * the message object.
   * @param opts Properties to assign to the message object.
   */
  warn(result: Result, text: string, opts?: WarningOptions): void;
  /**
   * @returns The next child of the node's parent; or, returns undefined if
   * the current node is the last child.
   */
  next(): TChild | undefined;
  /**
   * @returns The previous child of the node's parent; or, returns undefined
   * if the current node is the first child.
   */
  prev(): TChild | undefined;
  /**
   * Insert new node before current node to current node’s parent.
   *
   * Just an alias for `node.parent.insertBefore(node, newNode)`.
   *
   * @returns this node for method chaining.
   *
   * @example
   * decl.before('content: ""');
   */
  before(newNode: TNode | object | string | TNode[]): this;
  /**
   * Insert new node after current node to current node’s parent.
   *
   * Just an alias for `node.parent.insertAfter(node, newNode)`.
   *
   * @returns this node for method chaining.
   *
   * @example
   * decl.after('color: black');
   */
  after(newNode: TNode | object | string | TNode[]): this;

  /**
   * Removes the node from its parent and cleans the parent property in the
   * node and its children.
   * @returns This node for chaining.
   */
  remove(): this;
  /**
   * Inserts node(s) before the current node and removes the current node.
   * @returns This node for chaining.
   */
  replaceWith(...nodes: (TNode | object)[]): this;
  /**
   * @param overrides New properties to override in the clone.
   * @returns A clone of this node. The node and its (cloned) children will
   * have a clean parent and code style properties.
   */
  clone(overrides?: object): this;
  /**
   * Shortcut to clone the node and insert the resulting cloned node before
   * the current node.
   * @param overrides New Properties to override in the clone.
   * @returns The cloned node.
   */
  cloneBefore(overrides?: object): this;
  /**
   * Shortcut to clone the node and insert the resulting cloned node after
   * the current node.
   * @param overrides New Properties to override in the clone.
   * @returns The cloned node.
   */
  cloneAfter(overrides?: object): this;
  /**
   * @param prop Name or code style property.
   * @param defaultType Name of default value. It can be easily missed if the
   * value is the same as prop.
   * @returns A code style property value. If the node is missing the code
   * style property (because the node was manually built or cloned), PostCSS
   * will try to autodetect the code style property by looking at other nodes
   * in the tree.
   */
  raw(prop: string, defaultType?: string): string;
}

export interface ContainerBase<TChild, TNode> extends NodeBase<TChild, TNode> {
  /**
   * Contains the container's children.
   */
  nodes?: TChild[];
  /**
   * @returns The container's first child.
   */
  first?: TChild;
  /**
   * @returns The container's last child.
   */
  last?: TChild;
  /**
   * @param overrides New properties to override in the clone.
   * @returns A clone of this node. The node and its (cloned) children will
   * have a clean parent and code style properties.
   */
  clone(overrides?: object): this;
  /**
   * @param child Child of the current container.
   * @returns The child's index within the container's "nodes" array.
   */
  index(child: TChild | number): number;
  /**
   * Determines whether all child nodes satisfy the specified test.
   * @param callback A function that accepts up to three arguments. The
   * every method calls the callback function for each node until the
   * callback returns false, or until the end of the array.
   * @returns True if the callback returns true for all of the container's
   * children.
   */
  every(
    callback: (node: TChild, index: number, nodes: TChild[]) => boolean,
  ): boolean;
  /**
   * Determines whether the specified callback returns true for any child node.
   * @param callback A function that accepts up to three arguments. The some
   * method calls the callback for each node until the callback returns true,
   * or until the end of the array.
   * @returns True if callback returns true for (at least) one of the
   * container's children.
   */
  some(
    callback: (node: TChild, index: number, nodes: TChild[]) => boolean,
  ): boolean;
  /**
   * Iterates through the container's immediate children, calling the
   * callback function for each child. If you need to recursively iterate
   * through all the container's descendant nodes, use container.walk().
   * Unlike the for {} -cycle or Array#forEach() this iterator is safe if
   * you are mutating the array of child nodes during iteration.
   * @param callback Iterator. Returning false will break iteration. Safe
   * if you are mutating the array of child nodes during iteration. PostCSS
   * will adjust the current index to match the mutations.
   * @returns False if the callback returns false during iteration.
   */
  each(callback: (node: TChild, index: number) => void): void;
  each(callback: (node: TChild, index: number) => boolean): boolean;
  /**
   * Traverses the container's descendant nodes, calling `callback` for each
   * node. Like container.each(), this method is safe to use if you are
   * mutating arrays during iteration. If you only need to iterate through
   * the container's immediate children, use container.each().
   * @param callback Iterator.
   */
  walk(callback: (node: TChild, index: number) => void): void;
  walk(callback: (node: TChild, index: number) => boolean): boolean;
  /**
   * Traverses the container's descendant nodes, calling `callback` for each
   * declaration. Like container.each(), this method is safe to use if you
   * are mutating arrays during iteration.
   * @param propFilter Filters declarations by property name. Only those
   * declarations whose property matches propFilter will be iterated over.
   * @param callback Called for each declaration node within the container.
   */
  walkDecls(
    propFilter: string | RegExp,
    callback: (decl: Declaration, index: number) => void,
  ): void;
  walkDecls(callback: (decl: Declaration, index: number) => void): void;
  walkDecls(
    propFilter: string | RegExp,
    callback: (decl: Declaration, index: number) => boolean,
  ): boolean;
  walkDecls(callback: (decl: Declaration, index: number) => boolean): boolean;
  /**
   * Traverses the container's descendant nodes, calling `callback` for each
   * at-rule. Like container.each(), this method is safe to use if you are
   * mutating arrays during iteration.
   * @param nameFilter Filters at-rules by name. If provided, iteration
   * will only happen over at-rules that have matching names.
   * @param callback Iterator called for each at-rule node within the
   * container.
   */
  walkAtRules(
    nameFilter: string | RegExp,
    callback: (atRule: AtRule, index: number) => void,
  ): void;
  walkAtRules(callback: (atRule: AtRule, index: number) => void): void;
  walkAtRules(
    nameFilter: string | RegExp,
    callback: (atRule: AtRule, index: number) => boolean,
  ): boolean;
  walkAtRules(callback: (atRule: AtRule, index: number) => boolean): boolean;
  /**
   * Traverses the container's descendant nodes, calling `callback` for each
   * rule. Like container.each(), this method is safe to use if you are
   * mutating arrays during iteration.
   * @param selectorFilter Filters rules by selector. If provided,
   * iteration will only happen over rules that have matching names.
   * @param callback Iterator called for each rule node within the
   * container.
   */
  walkRules(
    selectorFilter: string | RegExp,
    callback: (atRule: Rule, index: number) => void,
  ): void;
  walkRules(callback: (atRule: Rule, index: number) => void): void;
  walkRules(
    selectorFilter: string | RegExp,
    callback: (atRule: Rule, index: number) => boolean,
  ): boolean;
  walkRules(callback: (atRule: Rule, index: number) => boolean): boolean;
  /**
   * Traverses the container's descendant nodes, calling `callback` for each
   * comment. Like container.each(), this method is safe to use if you are
   * mutating arrays during iteration.
   * @param callback Iterator called for each comment node within the container.
   */
  walkComments(callback: (comment: Comment, indexed: number) => void): void;
  walkComments(
    callback: (comment: Comment, indexed: number) => boolean,
  ): boolean;

  replaceValues(
    pattern: string | RegExp,
    options: {
      /**
       * Property names. The method will only search for values that match
       * regexp  within declarations of listed properties.
       */
      props?: string[];
      /**
       * Used to narrow down values and speed up the regexp search. Searching
       * every single value with a regexp can be slow. If you pass a fast
       * string, PostCSS will first check whether the value contains the fast
       * string; and only if it does will PostCSS check that value against
       * regexp. For example, instead of just checking for /\d+rem/ on all
       * values, set fast: 'rem' to first check whether a value has the rem
       * unit, and only if it does perform the regexp check.
       */
      fast?: string;
    },
    callbackOrReplaceValue:
      | string
      | {
          (substring: string, ...args: any[]): string;
        },
  ): this;
  replaceValues(
    pattern: string | RegExp,
    callbackOrReplaceValue:
      | string
      | {
          (substring: string, ...args: any[]): string;
        },
  ): this;
  /**
   * Inserts new nodes to the beginning of the container.
   * Because each node class is identifiable by unique properties, use the
   * following shortcuts to create nodes in insert methods:
   *     root.prepend({ name: '@charset', params: '"UTF-8"' }); // at-rule
   *     root.prepend({ selector: 'a' });                       // rule
   *     rule.prepend({ prop: 'color', value: 'black' });       // declaration
   *     rule.prepend({ text: 'Comment' })                      // comment
   * A string containing the CSS of the new element can also be used. This
   * approach is slower than the above shortcuts.
   *     root.prepend('a {}');
   *     root.first.prepend('color: black; z-index: 1');
   * @param nodes New nodes.
   * @returns This container for chaining.
   */
  prepend(...nodes: (TNode | object | string)[]): this;
  /**
   * Inserts new nodes to the end of the container.
   * Because each node class is identifiable by unique properties, use the
   * following shortcuts to create nodes in insert methods:
   *     root.append({ name: '@charset', params: '"UTF-8"' }); // at-rule
   *     root.append({ selector: 'a' });                       // rule
   *     rule.append({ prop: 'color', value: 'black' });       // declaration
   *     rule.append({ text: 'Comment' })                      // comment
   * A string containing the CSS of the new element can also be used. This
   * approach is slower than the above shortcuts.
   *     root.append('a {}');
   *     root.first.append('color: black; z-index: 1');
   * @param nodes New nodes.
   * @returns This container for chaining.
   */
  append(...nodes: (TNode | object | string)[]): this;
  /**
   * Insert newNode before oldNode within the container.
   * @param oldNode Child or child's index.
   * @returns This container for chaining.
   */
  insertBefore(
    oldNode: TChild | number,
    newNode: TChild | object | string,
  ): this;
  /**
   * Insert newNode after oldNode within the container.
   * @param oldNode Child or child's index.
   * @returns This container for chaining.
   */
  insertAfter(
    oldNode: TChild | number,
    newNode: TChild | object | string,
  ): this;
  /**
   * Removes the container from its parent and cleans the parent property in the
   * container and its children.
   * @returns This container for chaining.
   */
  remove(): this;
  /**
   * Removes child from the container and cleans the parent properties
   * from the node and its children.
   * @param child Child or child's index.
   * @returns This container for chaining.
   */
  removeChild(child: TChild | number): this;
  /**
   * Removes all children from the container and cleans their parent
   * properties.
   * @returns This container for chaining.
   */
  removeAll(): this;
}

// ---- Redefinitions
