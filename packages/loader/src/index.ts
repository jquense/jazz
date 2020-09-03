import { promisify } from 'util';
import type webpack from 'webpack';
import Processor, { Options, Resolver } from 'unnamed-css-preprocessor';
import { createResolver } from 'unnamed-css-preprocessor/lib/resolvers/node';
import { getOptions } from 'loader-utils';

import getLocalName from './getLocalName';

const PROCESSOR = Symbol('@modular-css processor');
const CACHE = Symbol('loadModule cache module');

function createResolve() {
  createResolver.async
}

function getLoadFilePrefix(loaderContext: webpack.loader.LoaderContext) {
  // loads a file with all loaders configured after this one
  const loadersRequest = loaderContext.loaders
    .slice(loaderContext.loaderIndex + 1)
    .map((x) => x.request)
    .join('!');

  return `-!${require.resolve('./stringifyLoader')}!${loadersRequest}!`;
}

function loader(
  this: webpack.loader.LoaderContext,
  src: string,
  _prevMap: any,
  meta: any,
) {
  const { resourcePath, _compilation: compilation } = this;
  const cb = this.async()!;
  const fs = this._compilation.inputFileSystem;

  const options = getOptions(this) || {};
  const prefix = getLoadFilePrefix(this);

  const loadFile = promisify<string, string>((file: string, done: any) => {
    if (compilation[CACHE].has(file)) {
      done(null, compilation[CACHE].get(file));
      return;
    }

    this.loadModule(`${prefix}${file}`, (err, moduleSource) => {
      let content = '';
      if (moduleSource) {
        content = JSON.parse(moduleSource.toString());
        compilation[CACHE].set(file, content);
      }

      done(err, content);
    });
  });

  if (!compilation[CACHE]) {
    compilation[CACHE] = new Map();
  }

  if (!compilation[PROCESSOR]) {
    // spread this out now, b/c sometimes the namer runs later after the context
    // is in a weird spot and it's getters don't work anymore
    const namerContext = { ...this };

    const processorOptions: Partial<Options> = {
      ...options,
      loadFile,
      icssCompatible: true,
      namer: (filename, localName) =>
        getLocalName(filename, localName, namerContext, options),
    };

    compilation[PROCESSOR] = new Processor(processorOptions);
  }

  const processor = compilation[PROCESSOR] as Processor;

  let root;
  if (meta) {
    const { ast } = meta;
    if (ast && ast.type === 'postcss') {
      root = ast.root;
    }
  }

  const processing = root
    ? processor.root(resourcePath, root)
    : processor.string(resourcePath, src);

  return processing.then(
    (file) => {
      const { result } = file;

      cb(
        null,
        result.css,
        result.map,
        // @ts-ignore
        {
          messages: result.messages,
          ast: {
            type: 'postcss',
            version: result.processor?.version,
            root: result.root,
          },
        },
      );
    },
    (err: any) => {
      if (err.file) {
        this.addDependency(err.file);
      }

      return err.name === 'CssSyntaxError'
        ? cb(new SyntaxError(err))
        : cb(err);
    },
  );
}

export default loader;
