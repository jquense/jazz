import { PostcssPlugin } from '../types';

const importsPlugin: PostcssPlugin = (css, { opts }) => {
  const { files, from } = opts;
  const file = files[from!];

  const values = file.values || Object.create(null);

  css.walkDecls(/^\$.+/, (decl) => {
    const name = decl.prop.slice(1);

    if (name in values) {
      throw decl.error(`Cannot redefine an existing variable: ${decl.prop}`, {
        word: decl.prop,
      });
    }

    values[name] = {
      name,
      value: decl.value,
    };

    decl.remove();
  });

  file.values = values;
};

importsPlugin.postcssPlugin = 'modular-css-values-local';

export default importsPlugin;
