const path = require('path');

const dedent = require('dedent');
// const identifierfy = require('identifierfy');
const Processor = require('jazzjs').default;
const utils = require('rollup-pluginutils');

const DEFAULT_EXT = '.css';
// const DEFAULT_VALUES = '$values';

// const sepRegex = /\\/g;
// const relative = (cwd: string, file: string) =>
//   path.relative(cwd, file).replace(sepRegex, '/');

// sourcemaps for css-to-js don't make much sense, so always return nothing
// https://github.com/rollup/rollup/wiki/Plugins#conventions
const emptyMappings = {
  mappings: '',
};

const DEFAULTS = {
  dev: false,
  empties: false,
  json: false,
  map: false,
  meta: false,
  styleExport: false,
  verbose: true,

  namedExports: {
    rewriteInvalid: true,
    warn: true,
  },

  // Regexp to work around https://github.com/rollup/rollup-pluginutils/issues/39
  include: /\.jazz$/i,
};

module.exports = (
  /* istanbul ignore next: too painful to test */
  opts = {},
) => {
  const options = {
    // __proto__: null,
    ...DEFAULTS,
    ...opts,
  };

  const { processor = new Processor(options) } = options;

  const filter = utils.createFilter(options.include, options.exclude);

  // eslint-disable-next-line no-console, no-empty-function
  const log = options.verbose
    ? console.log.bind(console, '[rollup]')
    : () => {};

  // istanbul ignore if: too hard to test this w/ defaults
  if (typeof options.map === 'undefined') {
    // Sourcemaps don't make much sense in styleExport mode
    // But default to true otherwise
    options.map = !options.styleExport;
  }

  const { graph } = processor;
  const transformed = new Set();

  return {
    name: '@jazzcss/rollup',

    buildStart() {
      log('build start');

      // Watch any files already in the procesor
      processor.files.forEach(([file]) => {
        this.addWatchFile(file);
      });
    },

    watchChange(file) {
      if (!processor.has(file)) {
        return;
      }

      log('file changed', file);

      // TODO: should the file be removed if it's gone?
      processor.invalidate(file);
    },

    // resolveId(source, importer) {
    //   return null;
    // },

    async transform(code, id) {
      if (!filter(id) && !code.includes('@icss-')) {
        return null;
      }

      log('transform', id);

      let processed;

      try {
        processed = await processor.add(id, code);
      } catch (e) {
        // Replace the default message with the much more verbose one
        e.message = e.toString();

        return this.error(e);
      }

      const { module } = processed;

      // const relativeId = relative(processor.options.cwd, id);
      const out = [];
      graph.outgoingEdges[processor.normalize(id)].forEach((dep) => {
        const file = processor.files.get(dep);
        if (file.type !== 'jazzscript') {
          out.push(`import '${dep}';\n`);
        }
      });

      out.push(
        dedent(`
          export default ${JSON.stringify(module.exports, null, 2)};
        `),
      );

      out.push('');
      transformed.add(id);
      // Return JS representation to rollup
      return {
        code: out.join('\n'),
        map: emptyMappings,
        moduleSideEffects: 'no-treeshake',
      };
    },

    async generateBundle(outputOptions, bundle) {
      // styleExport disables all output file generation
      if (options.styleExport) {
        return;
      }

      const {
        file,
        dir,
        // TODO: why doesn't rollup provide this? :(
        assetFileNames = 'assets/[name]-[hash][extname]',
      } = outputOptions;

      const chunks = new Map();
      const used = new Set();

      // Determine the correct to option for PostCSS by doing a bit of a dance
      const to =
        !file && !dir
          ? path.join(processor.options.cwd, assetFileNames)
          : path.join(dir || path.dirname(file), assetFileNames);

      // Walk bundle, determine CSS output files
      // TODO: remove any files that only export @values but no classes?

      for (const [entry, chunk] of Object.entries(bundle)) {
        const { type, modules, name } = chunk;

        if (type === 'asset') {
          continue;
        }

        const deps = Object.keys(modules).reduce((acc, f) => {
          if (processor.has(f)) {
            const css = processor.normalize(f);

            used.add(css);
            acc.push(css);
            // chunk[rename(f)];
          }

          return acc;
        }, []);

        if (!deps.length) {
          continue;
        }

        chunks.set(entry, { deps, name });
      }

      // Add any bare CSS files to be output
      processor.dependencies().forEach((css) => {
        if (used.has(css)) {
          return;
        }

        const { name } = path.parse(css);

        chunks.set(name, { deps: [css], name });
      });

      // If assets are being hashed then the automatic annotation has to be disabled
      // because it won't include the hashed value and will lead to badness
      let mapOpt = options.map;

      if (assetFileNames.includes('[hash]') && typeof mapOpt === 'object') {
        mapOpt = {
          __proto__: null,
          ...mapOpt,
          annotation: false,
        };
      }

      // Track specified name -> output name for writing out metadata later
      const names = new Map();

      // Track chunks that don't actually need to be output
      const duds = new Set();

      for (const [entry, { deps, name }] of chunks) {
        /* eslint-disable-next-line no-await-in-loop */
        const result = await processor.output({
          // Can't use this.getAssetFileName() here, because the source hasn't been set yet
          //  Have to do our best to come up with a valid final location though...
          to: to.replace(/\[(name|extname)\]/g, (match, field) =>
            field === 'name' ? name : DEFAULT_EXT,
          ),
          map: mapOpt,

          files: deps,
        });

        // Don't output empty files if empties is falsey
        if (!options.empties && !result.css.length) {
          duds.add(entry);

          continue;
        }

        const id = this.emitFile({
          type: 'asset',
          name: `${name}${DEFAULT_EXT}`,
          source: result.css,
        });

        // Save off the final name of this asset for later use
        const dest = this.getFileName(id);

        names.set(entry, dest);

        log('css output', dest);

        if (result.map) {
          // Make sure to use the rollup name as the base, otherwise it won't
          // automatically handle duplicate names correctly
          const fileName = dest.replace(DEFAULT_EXT, `${DEFAULT_EXT}.map`);

          log('map output', fileName);

          this.emitFile({
            type: 'asset',
            source: result.map.toString(),

            // Use fileName instead of name because this has to follow the parent
            // file naming and can't be double-hashed
            fileName,
          });

          // Had to re-add the map annotation to the end of the source files
          // if the filename had a hash, since we stripped it out up above
          if (assetFileNames.includes('hash')) {
            bundle[dest].source += `\n/*# sourceMappingURL=${path.basename(
              fileName,
            )} */`;
          }
        }
      }

      for (const [entry] of chunks) {
        const chunk = bundle[entry];

        if (!chunk) {
          continue;
        }

        // Attach info about this asset to the bundle
        const { assets = [] } = chunk;

        const name = names.get(entry);

        assets.push(name);

        chunk.assets = assets;
        chunk.modules[name] = {};
      }
    },
  };
};
