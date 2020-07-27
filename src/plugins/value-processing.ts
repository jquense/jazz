/* eslint-disable @typescript-eslint/no-use-before-define */

import path from 'path';

// @ts-ignore
import slug from 'unique-slug';

import Evaluator from '../Evaluate';
import Parser from '../parsers';
// @ts-ignore
import { PostcssPlugin } from '../types';
import inferScope from '../utils/infer-scope';

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
    identifierScope = inferScope(from!),
    namer = defaultNamer,
  } = opts;

  const file = modules.get(from!)!;

  const parser = Parser.get(css, opts);

  const members = Evaluator.evaluate(css, {
    namer: (str: string) => namer(from!, str),
    loadModuleMembers: (request: string) => {
      return modules.get(resolve(from, request))?.exports;
    },
    initialScope: file.scope,
    identifierScope,
    parser,
  });

  file.exports.addAll(members);
};

// importsPlugin.postcssPlugin = 'modular-css-values-local';

export default valueProcessingPlugin;
