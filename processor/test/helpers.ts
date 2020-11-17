/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';

// @ts-ignore
import dedent from 'dedent';
import * as MemFS from 'memfs';
import { Volume } from 'memfs/lib/volume';
import postcss from 'postcss';

import {
  ClassSelector,
  IdSelector,
  Ident,
  TypeSelector,
  UniversalSelector,
} from '../src/Ast';
import ModuleMembers from '../src/ModuleMembers';
import Processor, { Resolver } from '../src/Processor';
import Scope from '../src/Scope';
import valuePlugin from '../src/plugins/value-processing';
import { createResolver } from '../src/resolvers/node';
import { Module, PostcssProcessOptions } from '../src/types';
import interleave from '../src/utils/interleave';
// @ts-ignore
import hrx from './hrx';

export const css = (strings: TemplateStringsArray, ...values: any[]) => {
  return dedent(interleave(strings, values).join(''));
};

interface Options {
  hash?: boolean;
  scope?: Scope;
  exports?: ModuleMembers;
  modules?: [string, Partial<Module>][];
}

export async function process(cssStr: string, options: Options = {}) {
  const {
    scope = new Scope(),
    exports = new ModuleMembers(),
    hash = false,
    modules = [],
  } = options;

  const postcssOptions: Partial<PostcssProcessOptions> = {
    parser: require('../src/parsers/jazz-postcss').default,
    from: './test.jazz',
    source: false,
    trace: true,
    // evaluationScope: 'preprocess',
    identifierScope: hash ? 'local' : 'global',
    resolve: (url: string) => {
      return path.join(path.dirname('./test.jazz'), url);
    },
    namer: (_: string, s: string) => (hash ? `h_${s}` : s),
    modules: new Map([
      [
        './test.jazz',
        {
          type: 'jazzcss',
          scope,
          exports,
        },
      ],
      ...modules.map(
        ([key, m]) =>
          [
            key,
            {
              scope: new Scope(),
              exports: new ModuleMembers(),
              type: 'jazzcss',
              ...m,
            },
          ] as [string, Module],
      ),
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

const pathName = (str: string) =>
  path.basename(str).replace(/(\.module|\.global)?\.(css|jazz)/, '');

export function parseFixtures(
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
  let fired = false;
  const callback = (obj: any) => {
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
        run(absFile);
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

export function createMemoryResolver(memFs: Volume): Resolver {
  const fileResolver = createResolver({ fileSystem: memFs });
  return (url, opts) => {
    const r = fileResolver(url, opts);
    return r
      ? {
          ...r,
          content: memFs.readFileSync(r.file, 'utf8') as string,
        }
      : false;
  };
}

export function runFixture(hrxFile: string) {
  parseFixtures(
    hrxFile,
    ({ fs: memFs, name, input, output, exports, error, options }) => {
      it(name, async () => {
        const processor = new Processor({
          ...options,
          namer: (file, id) => `${pathName(file)}_${id}`,
          resolvers: [createMemoryResolver(memFs)],
        });

        try {
          await processor.add(
            input,
            memFs.readFileSync(input, 'utf8') as string,
          );
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
}
