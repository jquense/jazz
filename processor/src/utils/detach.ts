import postcss from 'postcss';

import type { Root, StatementNode } from '../Ast';

export default (node: StatementNode) => {
  const { nodes } = node.clone();
  const container = postcss.root();
  container.append(...nodes!);
  return (container as any) as Root;
};
