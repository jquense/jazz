import postcss from 'postcss';
import { PostcssPlugin } from '../types';

// We need a dummy value here so css-loader doesn't remove it
// need to pick something that is not likely to match a word in the css tho
export const DUMMY_LOCAL_NAME = '____a';

const plugin: PostcssPlugin = (css, { opts }) => {
  const { modules, moduleGraph, from, resolve } = opts;

  const file = modules.get(from!)!;

  // We only want direct dependencies, since those will be required
  // in the css-loader output, the dep tree will be realized
  const imported = moduleGraph.outgoingEdges[from];
  const exported = file.exports.toJSON();

  for (const dep of imported) {
    console.log(from, dep, resolve(dep));
    css.prepend(
      postcss.rule({
        selector: `:import("${resolve(dep)}")`,
        nodes: [postcss.decl({ prop: DUMMY_LOCAL_NAME, value: 'a' })],
      }),
    );
  }

  css.append(
    postcss.rule({
      selector: ':export',
      nodes: Object.entries(exported).map(([prop, value]) =>
        postcss.decl({ prop, value }),
      ),
    }),
  );
};
export default plugin;
