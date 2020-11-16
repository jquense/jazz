import { Volume } from 'memfs';

import { createMemoryResolver, css, runFixture } from '../../test/helpers';
import Compiler, { Options } from '../Processor';

function trimLineEnd(str: string) {
  return str
    .split(/\n/)
    .map((l) => l.trimEnd())
    .join('\n');
}

describe('Compiler', () => {
  function get(options: Partial<Options> = {}) {
    const fs = Volume.fromJSON({
      '/colors.jazz': `
        $red: red;
        $blue: blue;

        @export $red, $blue;
      `,
      '/config.js': `
        module.exports = {
          PI: Math.PI
        }
      `,
    });

    return new Compiler({
      ...options,
      // loadFile: (file: string) => fs.readFileSync(file).toString(),
      namer: (_: string, selector: string) => `m_${selector}`,
      resolvers: [createMemoryResolver(fs)],
    });
  }

  it('should work', async () => {
    const processor = get();

    const details = await processor.add(
      '/entry.jazz',
      `
        @use 'string' as string;
        @use './colors.jazz' import $red;

        $name: child;

        .foo {
          color: $red;
          background-color: url($red/'hi');

          & > .#{$name} {
            color: $red
          }
        }
      `,
    );

    expect(details.result.css).toMatchCss(`
      .m_foo {
        color: red;
        background-color: url(red/'hi');
      }

      .m_foo > .m_child {
        color: red
      }
    `);
  });

  it('should import non styles', async () => {
    const processor = get();

    const details = await processor.add(
      '/entry.jazz',
      `
        @use './config.js' import $PI;

        .foo {
          color: $PI
        }
      `,
    );

    expect(details.result.css).toMatchCss(`
      .m_foo {
        color: ${Math.PI}
      }

    `);
  });

  it('should have good evaluation errors', async () => {
    const processor = get();
    try {
      await processor.add(
        '/entry.jazz',
        `
        .foo /* hi */ :global(
          .foo,
          .bar
        ) {

        }
      `,
      );
    } catch (err) {
      // console.log(err);
      expect(trimLineEnd(err.showSourceCode(false))).toMatchInlineSnapshot(`
        "  1 |
        > 2 |         .foo /* hi */ :global(
            |                        ^
          3 |           .foo,
          4 |           .bar"
      `);
    }
  });

  it('should have good parsing errors', async () => {
    const processor = get();
    try {
      await processor.add(
        '/entry.jazz',
        `
        @if 1
          +   {

        }
      `,
      );
    } catch (err) {
      // @prettier-ignore
      expect(trimLineEnd(err.showSourceCode(false))).toMatchInlineSnapshot(`
        "  1 |
          2 |         @if 1
        > 3 |           +   {
            |            ^
          4 |
          5 |         }"
      `);
    }
  });

  it('should import namespaces', async () => {
    const processor = get();

    const details = await processor.add(
      '/entry.jazz',
      css`
        @use './colors.jazz' as colors;

        $baz: blue;

        .foo {
          color: colors.$red;
        }

        @export $baz;
      `,
    );

    expect(details.selectors).toEqual({
      foo: ['m_foo'],
    });
    expect(details.values).toEqual({
      baz: 'blue',
    });

    expect(details.result.css).toMatchCss(`
      .m_foo {
        color: red;
      }
    `);
  });

  it('should output ICSS ', async () => {
    const processor = get();

    const details = await processor.add(
      '/entry.jazz',
      css`
        @use './colors.jazz' as colors;

        $baz: blue;

        .foo {
          color: colors.$red;
        }

        @export $baz;
      `,
    );

    expect(details.toICSS().css).toMatchInlineSnapshot(`
      "@icss-import \\"colors.jazz\\";
      .m_foo {
                color: red;
              }
      @icss-export {$baz: 'blue';foo: m_foo;
      }
            "
    `);
  });

  it('should generate per file JS ', async () => {
    const processor = get();

    await processor.add(
      '/entry.jazz',
      css`
        @use 'string' as string;
        @use './colors.jazz' as colors;

        $baz: blue;

        .foo {
          color: colors.$red;
        }

        @export $baz;
      `,
    );

    expect(processor.generateFileOutput('/entry.jazz')).toMatchInlineSnapshot(`
      "import '/colors.jazz';
      export const $baz = 'blue';
      export const foo = 'm_foo';
      "
    `);
  });

  describe('Importing files', () => {
    runFixture(`${__dirname}/../__fixtures__/imports.hrx`);
  });

  describe('ICSS', () => {
    runFixture(`${__dirname}/../__fixtures__/icss.hrx`);
  });

  describe('Css imports', () => {
    runFixture(`${__dirname}/../__fixtures__/css.hrx`);
    runFixture(`${__dirname}/../__fixtures__/css-modules.hrx`);
  });
});
