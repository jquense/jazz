import postcss from 'postcss';

export default (node: postcss.Container) => {
  const { nodes } = node.clone();
  const container = postcss.root();
  container.append(...nodes!);
  return container;
};
