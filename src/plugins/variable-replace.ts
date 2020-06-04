import { DepGraph } from 'dependency-graph';
import postcss from 'postcss';

import * as ValueParser from '../parsers/values';
import { PostcssPlugin, ProcessingFile } from '../types';
import { getVariables, replaceWithValue } from '../utils/Variables';

function replaceDeclarations(
  decl: postcss.Declaration,
  values: ProcessingFile['values'],
) {
  decl.prop = replaceWithValue(decl.prop, values, 'identifier');

  const parsed = ValueParser.parse(decl.value);

  parsed.walk((valueNode) => {
    const { value, type } = valueNode;

    switch (type) {
      case 'func':
      case 'unicodeRange':
        valueNode.value = replaceWithValue(value, values, 'identifier', decl);
        break;
      case 'quoted':
        valueNode.value = replaceWithValue(value, values, 'string', decl);
        break;
      case 'word':
        valueNode.value = replaceWithValue(value, values, 'value', decl);
        break;
      default:
    }
  });

  decl.value = parsed.toString();
}

const plugin: PostcssPlugin = (css, { opts }) => {
  const graph = new DepGraph();
  const { values } = opts.files[opts.from!];

  // Walk through all values & build dependency graph
  // this is a poor proxy for scope tracking but meh;
  for (const [name, details] of Object.entries(values)) {
    graph.addNode(name);

    for (const variableName of getVariables(details.value)) {
      graph.addNode(variableName);
      graph.addDependency(name, variableName);
    }
  }

  for (const name of graph.overallOrder()) {
    values[name].value = replaceWithValue(values[name].value, values);
  }

  css.walk((node) => {
    if (node.type === 'decl') {
      replaceDeclarations(node, values);
    }
    if (node.type === 'rule') {
      // TODO: parse the selector for more correct replacement
      node.selector = replaceWithValue(node.selector, values);
    }

    // node.name !== 'from' &&
    // node.name !== 'export' &&
    // node.name !== 'import'
    if (node.type === 'atrule') {
      switch (node.name) {
        case 'from':
        case 'export':
        case 'import':
          break;

        default:
          node.params = replaceWithValue(node.params, values);
      }
    }
  });
};

plugin.postcssPlugin = 'modular-css-values-replace';

export default plugin;
