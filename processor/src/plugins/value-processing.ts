/* eslint-disable @typescript-eslint/no-use-before-define */

import path from 'path';

// @ts-ignore
import slug from 'unique-slug';

import Evaluator from '../Evaluate';
import Parser from '../parsers';
// @ts-ignore
import { PostcssPlugin } from '../types';

const defaultNamer = (filename: string, selector: string) => {
  // return `i_${selector}`;
  return `mc${slug(
    path.relative(process.cwd(), filename!).replace(/\\/g, '/'),
  )}_${selector}`;
};

const valueProcessingPlugin: PostcssPlugin = (css, { opts }) => {
  const {
    modules,
    from,
    resolve,
    identifierScope,
    icssCompatible,
    namer = defaultNamer,
  } = opts;

  const file = modules.get(from!)!;

  const parser = Parser.get(css, opts);

  const members = Evaluator.evaluate(css, {
    outputIcss: icssCompatible,
    namer: (str: string) => namer(from!, str),
    loadModuleMembers: (request: string) => {
      const resolved = resolve(request);

      // console.log(request, modules, from, resolve(from, request));
      return resolved ? modules.get(resolved)?.exports : undefined;
    },
    initialScope: file.scope,
    identifierScope,
    parser,
  });

  file.exports.addAll(members);
};

// importsPlugin.postcssPlugin = 'modular-css-values-local';

export default valueProcessingPlugin;
