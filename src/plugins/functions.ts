/* eslint-disable no-param-reassign */
import postcss, { plugin } from 'postcss';
import valueParser from 'postcss-value-parser';

export type MaybePromise<T> = T | Promise<T>;

export type CssFunctions = Record<
  string,
  (...args: any[]) => MaybePromise<string | number>
>;

export interface Options {
  functions: CssFunctions;
}

export default plugin('postcss-functions', (opts: Options) => {
  const { functions } = opts;

  async function transformValueNodes(
    node: valueParser.Node,
  ): Promise<valueParser.Node> {
    if (node.type !== 'function' || !functions[node.value]) {
      return node;
    }

    const func = functions[node.value];
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const fnArgs = await extractArguments(node.nodes);

    const val = await func(...fnArgs);

    (node as valueParser.Node).type = 'word';

    node.value = String(val);
    return node as valueParser.Node;
  }

  async function transformValue(value: string) {
    const results = [] as PromiseLike<any>[];

    const values = valueParser(value).walk((part) => {
      results.push(transformValueNodes(part));
    });

    await Promise.all(results);
    // by this point the function node has been mutated
    return values.toString();
  }

  async function extractArguments(nodes: valueParser.Node[]) {
    const values = await Promise.all(nodes.map(transformValueNodes));
    const args = [] as string[];

    const last = values.reduce((prev, node) => {
      if (node.type === 'div' && node.value === ',') {
        args.push(prev);
        return '';
      }
      return prev + valueParser.stringify(node);
    }, '');

    if (last) args.push(last);

    return args;
  }

  function transform(node: postcss.Node) {
    switch (node.type) {
      case 'decl':
        return transformValue(node.value).then((str) => {
          node.value = str;
        });
      case 'atrule':
        return transformValue(node.params).then((str) => {
          node.params = str;
        });
      case 'rule':
        return transformValue(node.selector).then((str) => {
          node.selector = str;
        });
      default:
        return null;
    }
  }

  return (css) => {
    const results = [] as Array<Promise<void> | null>;

    css.walk((node) => {
      results.push(transform(node));
    });

    return Promise.all(results);
  };
});
