import webpack from 'webpack';
import LibraryTemplatePlugin from 'webpack/lib/LibraryTemplatePlugin';
import SingleEntryPlugin from 'webpack/lib/SingleEntryPlugin';
import NodeTargetPlugin from 'webpack/lib/node/NodeTargetPlugin';
import NodeTemplatePlugin from 'webpack/lib/node/NodeTemplatePlugin';
import LimitChunkCountPlugin from 'webpack/lib/optimize/LimitChunkCountPlugin';

const pluginName = 'jazz-loader';

export function loadCompiledScript(
  request: string,
  ctx: webpack.loader.LoaderContext,
) {
  ctx.addDependency(request);

  const outputOptions = {
    filename: '*',
    publicPath: ctx._compilation.outputOptions.publicPath,
  };
  const childCompiler = ctx._compilation.createChildCompiler(
    `${pluginName} ${request}`,
    outputOptions,
  );

  new NodeTemplatePlugin(outputOptions).apply(childCompiler);
  new LibraryTemplatePlugin(null, 'commonjs2').apply(childCompiler);
  new NodeTargetPlugin().apply(childCompiler);
  new SingleEntryPlugin(ctx.context, `!!${request}`, pluginName).apply(
    childCompiler,
  );
  new LimitChunkCountPlugin({ maxChunks: 1 }).apply(childCompiler);

  let source: string;
  childCompiler.hooks.afterCompile.tap(
    pluginName,
    (compilation: webpack.compilation.Compilation) => {
      source = compilation.assets['*'] && compilation.assets['*'].source();

      // Remove all chunk assets
      compilation.chunks.forEach((chunk) => {
        chunk.files.forEach((file: string) => {
          delete compilation.assets[file];
        });
      });
    },
  );

  return new Promise((resolve, reject) => {
    childCompiler.runAsChild(
      (
        err: any,
        _entries: any,
        compilation: webpack.compilation.Compilation,
      ) => {
        if (err) {
          return reject(err);
        }

        if (compilation.errors.length > 0) {
          return reject(compilation.errors[0]);
        }

        compilation.fileDependencies.forEach((dep) => {
          ctx.addDependency(dep);
        });

        compilation.contextDependencies.forEach((dep) => {
          ctx.addContextDependency(dep);
        });

        if (!source) {
          return reject(new Error("Didn't get a result from child compiler"));
        }

        return resolve(source);
      },
    );
  });
}
