import type { Plugin } from 'postcss';

import { Root } from './Ast';
import Graph from './Graph';

const processed = Symbol('jazz');

const plugin = (opts = {}): Plugin => ({
  postcssPlugin: 'jazz',
  OnceExit: async (root, { result }) => {
    // @ts-ignore
    if (root[processed]) {
      return;
    }

    const postcssPlugins = [] as any[];

    for (const p of result.processor.plugins) {
      if ((p as any).postcssPlugin === 'jazz') break;
      postcssPlugins.push(p);
    }

    const graph = new Graph({
      ...opts,
      ...result.opts,
      postcssPlugins,
    } as any);

    await graph.add(result.opts.from!, (root as any) as Root);

    const output = graph.output();

    // @ts-ignore
    root[processed] = true;
    root.removeAll();
    root.append(...output.nodes);
  },
});

plugin.jazz = true;
plugin.postcss = true;

export default plugin;
