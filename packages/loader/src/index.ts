/* eslint-disable consistent-return */
import path from 'path';
import { promisify } from 'util';

import Processor, { AsyncResolver, File, Options } from 'jazzjs';
import { getOptions } from 'loader-utils';
import type webpack from 'webpack';

import SyntaxError from './SyntaxError';
import getLocalName from './getLocalName';

const PROCESSOR = Symbol('@modular-css processor');
const CACHE = Symbol('loadModule cache module');

function getLoadFilePrefix(loaderContext: webpack.loader.LoaderContext) {
  // loads a file with all loaders configured after this one
  const loadersRequest = loaderContext.loaders
    .slice(loaderContext.loaderIndex + 1)
    .map((x) => x.request)
    .join('!');

  return `-!${require.resolve('./stringifyLoader')}!${loadersRequest}!`;
}

function loadStyle(request: string, ctx: webpack.loader.LoaderContext) {
  const prefix = getLoadFilePrefix(ctx);

  return new Promise((resolve, reject) => {
    ctx.loadModule(`${prefix}${request}`, (err, moduleSource) => {
      if (err) return reject(err);

      let content = '';
      if (moduleSource) {
        content = moduleSource.toString();

        content = JSON.parse(moduleSource.toString());
      }

      resolve(content);
    });
  });
}

function loadScript(request: string, ctx: webpack.loader.LoaderContext) {
  return Promise.resolve(ctx.fs.readFileSync(request).toString());
}

function getResolve(ctx: webpack.loader.LoaderContext): AsyncResolver {
  const resolve = promisify(
    // @ts-ignore
    ctx.getResolve({
      alias: [],
      aliasFields: [],
      conditionNames: [],
      descriptionFiles: [],
      extensions: [
        '.global.jazz',
        '.module.jazz',
        '.jazz',
        '.css',
        '.js',
        '.ts',
      ],
      exportsFields: [],
      mainFields: [],
      mainFiles: ['index'],
      modules: [],
      restrictions: [/\.(jazz|js|ts|css)$/i],
    }),
  );

  return async (url, { from }) => {
    const file = await resolve(path.dirname(from), url);
    return file ? { file } : false;
  };
}

function loader(
  this: webpack.loader.LoaderContext,
  src: string,
  _prevMap: any,
  meta: any,
) {
  const { resourcePath, _compilation: compilation } = this;
  const cb = this.async()!;

  const options = getOptions(this) || {};

  // const loadFile = promisify<string, string>((file: string, done: any) => {
  //   if (compilation[CACHE].has(file)) {
  //     done(null, compilation[CACHE].get(file));
  //     return;
  //   }

  //   const isCss = file.endsWith('.jazz') || file.endsWith('.css');

  //   const result = isCss ? loadStyle(file, this) : loadScript(file, this);

  //   result.then((content) => {
  //     compilation[CACHE].set(file, content);
  //     done(null, content);
  //   }, done);
  // });

  // if (!compilation[CACHE]) {
  //   compilation[CACHE] = new Map();
  // }

  if (!compilation[PROCESSOR]) {
    // spread this out now, b/c sometimes the namer runs later after the context
    // is in a weird spot and it's getters don't work anymore
    const namerContext = { ...this };

    const processorOptions: Partial<Options> = {
      ...options,
      // loadFile,
      icssCompatible: true,
      resolvers: [getResolve(this)],
      namer: (filename, localName) =>
        getLocalName(filename, localName, namerContext, options),
    };

    compilation[PROCESSOR] = new Processor(processorOptions);
  }

  const processor = compilation[PROCESSOR] as Processor;

  return processor.add(resourcePath, src).then(
    (file: File) => {
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
