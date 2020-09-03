import path from 'path';

import resolver, { ResolveOptions } from 'enhanced-resolve';

import { Resolver, AsyncResolver } from '../types';
import { extensions } from '../utils/Scoping';

function createResolver(opts?: Partial<ResolveOptions>): Resolver {
  const resolve = resolver.create.sync({
    symlinks: process.env.NODE_PRESERVE_SYMLINKS !== '1',
    ...opts,
    extensions: [...extensions, '.css', '.module.css'],
    mainFields: ['style'],
    mainFiles: [],
    exportsFields: [],
  });

  return function nodeResolver(url, { from }) {
    const result = resolve(path.dirname(from), url);
    return result;
  };
}

createResolver.async = (opts?: Partial<ResolveOptions>): AsyncResolver => {
  const resolve = resolver.create({
    symlinks: process.env.NODE_PRESERVE_SYMLINKS !== '1',
    ...opts,
    extensions: [...extensions, '.css', '.module.css'],
    mainFields: ['style'],
    mainFiles: [],
    exportsFields: [],
  });

  return function nodeAsyncResolver(url, { from }) {
    return new Promise((yes, no) => {
      resolve(path.dirname(from), url, (err: any, result: string | false) => {
        if (err) {
          no(err);
          return;
        }
        yes(result);
      });
    });
  };
};

export { createResolver };

export default createResolver();
