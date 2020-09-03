/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';

import * as MemFS from 'memfs';
import postcss from 'postcss';

import {
  ClassSelector,
  IdSelector,
  Ident,
  TypeSelector,
  UniversalSelector,
} from '../src/Ast';
import ModuleMembers from '../src/ModuleMembers';
import Processor from '../src/Processor';
import Scope from '../src/Scope';
import valuePlugin from '../src/plugins/value-processing';
import { createResolver } from '../src/resolvers/node';
import { Module, PostcssProcessOptions } from '../src/types';
import interleave from '../src/utils/interleave';
// @ts-ignore
import hrx from './hrx';

export const css = (strings: TemplateStringsArray, ...values: any[]) => {
  return interleave(strings, values).join('');
};

interface Options {
  hash?: boolean;
  scope?: Scope;
  exports?: ModuleMembers;
  modules?: [string, Module][];
}

export async function process(cssStr: string, options: Options = {}) {
  const {
    scope = new Scope(),
    exports = new ModuleMembers(),
    hash = false,
    modules = [],
  } = options;

  const postcssOptions: Partial<PostcssProcessOptions> = {
    parser: require('../src/parsers/postcss').default,
    from: './test.mcss',
    source: false,
    trace: true,
    evaluationScope: 'preprocess',
    identifierScope: hash ? 'local' : 'global',
    resolve: (url: string) => {
      return path.join(path.dirname('./test.mcss'), url);
    },
    namer: (_: string, s: string) => (hash ? `h_${s}` : s),
    modules: new Map([
      [
        './test.mcss',
        {
          scope,
          exports,
        },
      ],
      ...modules,
    ]),
  };

  const result = await postcss([valuePlugin]).process(cssStr, postcssOptions);
  return { css: result.css, scope, exports };
}

export async function evaluate(
  cssStr: string,
  scopeOrOptions?: Scope | Options,
) {
  const { css: result } = await process(
    cssStr,
    scopeOrOptions instanceof Scope
      ? { scope: scopeOrOptions }
      : scopeOrOptions || {},
  );

  return result;
}

export const Selectors = {
  type: ([str]: TemplateStringsArray) => new TypeSelector(new Ident(str)),
  id: ([str]: TemplateStringsArray) => new IdSelector(new Ident(str)),
  class: ([str]: TemplateStringsArray) => new ClassSelector(new Ident(str)),
  star: () => new UniversalSelector(),
};

const pathName = (str: string) => path.basename(str, path.extname(str));

function parseFixtures(
  hrxFile: string,
  cb: (obj: {
    fs: typeof MemFS.vol;
    name: string;
    input: string;
    output?: string;
    options?: any;
    exports?: {
      values: Record<string, string>;
      classes: Record<string, string[]>;
    };
    error?: string;
  }) => void,
) {
  const base = pathName(hrxFile);

  const [json, _] = hrx(fs.readFileSync(hrxFile).toString());

  const memFs = MemFS.Volume.fromJSON(json);
  let fired: boolean = false;
  let callback = (obj: any) => {
    fired = true;
    return cb(obj);
  };

  function run(dir: string) {
    const files = memFs.readdirSync(dir) as string[];
    let output, input, exports, error, options;

    for (const file of files) {
      const absFile = path.join(dir, file);
      const baseName = pathName(file);

      if (baseName === 'input') input = absFile;
      else if (baseName === 'output')
        output = memFs.readFileSync(absFile).toString();
      else if (baseName === 'exports')
        exports = JSON.parse(memFs.readFileSync(absFile).toString());
      else if (baseName === 'error')
        error = memFs.readFileSync(absFile).toString();
      else if (file === 'options.json') {
        options = JSON.parse(memFs.readFileSync(absFile).toString());
      } else if (memFs.statSync(absFile).isDirectory()) {
        let ran = run(absFile);
      }
    }

    if (input) {
      callback({
        fs: memFs,
        name: dir === './' ? base : dir,
        input,
        output,
        exports,
        options,
        error,
      });
    }
  }

  run('./');
  if (!fired) {
    throw new Error(
      `HRX fixture "${hrxFile}" did not produce any tests, at least one directory or sub directory must have an 'input' file`,
    );
  }
}

export function runFixture(hrxFile: string) {
  try {
    parseFixtures(
      hrxFile,
      ({ fs: memFs, name, input, output, exports, error, options }) => {
        it(name, async () => {
          const processor = new Processor({
            ...options,
            namer: (file, id) => `${pathName(file)}_${id}`,
            loadFile: (id) => memFs.readFileSync(id, 'utf8') as string,
            resolvers: [createResolver({ fileSystem: memFs })],
          });

          try {
            await processor.file(input);
            const result = await processor.output({ to: 'output.css' });

            if (output) {
              expect(result.css).toMatchCss(output);
            }
            if (exports) {
              expect(result.exports).toEqual(exports);
            }
          } catch (err) {
            if (error) expect(err.message).toMatch(error);
            else throw err;
          }
        });
      },
    );
  } catch (err) {
    throw err;
  }
}
