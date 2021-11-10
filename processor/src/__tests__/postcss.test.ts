import { Volume } from 'memfs';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

import { createMemoryResolver, css } from '../../test/helpers';
import postcssParser from '../parsers/jazz-postcss';
import Plugin from '../postcss-plugin';

function trimLineEnd(str: string) {
  return str
    .split(/\n/)
    .map((l) => l.trimEnd())
    .join('\n');
}

describe('postcss-plugin', () => {
  function get(options: Partial<any> = {}) {
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

    return (from: string, code: string) =>
      postcss([
        ...(options.pre || []),
        Plugin({
          ...options,
          cwd: '/',
          // loadFile: (file: string) => fs.readFileSync(file).toString(),
          namer: (_: string, selector: string) => `m_${selector}`,
          resolvers: [createMemoryResolver(fs)],
        }),
      ]).process(code, { from, parser: postcssParser as any });
  }

  it('should work', async () => {
    const processor = get();

    const details = await processor(
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

    expect(details.css).toMatchCss(`
      /* colors.jazz */
      /* entry.jazz */
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

    const details = await processor(
      '/entry.jazz',
      `
        @use './config.js' import $PI;

        .foo {
          color: $PI
        }
      `,
    );

    expect(details.css).toMatchCss(`
      /* entry.jazz */
      .m_foo {
        color: ${Math.PI}
      }

    `);
  });

  it('should have good evaluation errors', async () => {
    const processor = get();
    try {
      await processor(
        '/entry.jazz',
        `
        .foo /* hi */ :global(
          .foo,
          .bar
        ) {

        }
      `,
      );
    } catch (err: any) {
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
      await processor(
        '/entry.jazz',
        `
        @if 1
          +   {

        }
      `,
      );
    } catch (err: any) {
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

    const details = await processor(
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

    // expect(details.selectors).toEqual({
    //   foo: ['m_foo'],
    // });
    // expect(details.values).toEqual({
    //   baz: 'blue',
    // });

    expect(details.css).toMatchCss(`
      /* colors.jazz */
      /* entry.jazz */
      .m_foo {
        color: red;
      }
    `);
  });

  it('should work with plugins', async () => {
    const processor = get({ pre: [tailwind()] });

    const details = await processor(
      '/entry.jazz',
      `
        @use 'string' as string;
        @use './colors.jazz' import $red;

        $name: child;

        .foo {
          color: theme('colors.red.100');
          background-color: url($red/'hi');
          width: calc(theme('spacing.2') + 2rem);

          & > .#{$name} {
            color: $red
          }
        }
      `,
    );

    expect(details.css).toMatchCss(`
      /* colors.jazz */
      /* entry.jazz */
      .m_foo {
        color: #fee2e2;
        background-color: url(red/'hi');
        width: 2.5rem;
      }
      .m_foo > .m_child {
        color: red
      }
    `);
  });

  // it('should output ICSS ', async () => {
  //   const processor = get();

  //   const details = await processor.add(
  //     '/entry.jazz',
  //     css`
  //       @use './colors.jazz' as colors;

  //       $baz: blue;

  //       .foo {
  //         color: colors.$red;
  //       }

  //       @export $baz;
  //     `,
  //   );

  //   expect(details.toICSS().css).toMatchInlineSnapshot(`
  //     "@icss-import \\"colors.jazz\\";
  //     .m_foo {
  //       color: red;
  //     }
  //     @icss-export {
  //       $baz: 'blue';
  //       foo: m_foo;
  //     }"
  //   `);
  // });

  // it('should generate per file JS ', async () => {
  //   const processor = get();

  //   await processor.add(
  //     '/entry.jazz',
  //     css`
  //       @use 'string' as string;
  //       @use './colors.jazz' as colors;

  //       $baz: blue;

  //       .foo {
  //         color: colors.$red;
  //       }

  //       @export $baz;
  //     `,
  //   );

  //   expect(processor.generateFileOutput('/entry.jazz')).toMatchInlineSnapshot(`
  //     "import './colors.jazz';
  //     export const $baz = 'blue';
  //     export const foo = 'm_foo';
  //     "
  //   `);
  // });

  // it('should generate per file ICSS', async () => {
  //   const processor = get();

  //   await processor.add(
  //     '/entry.jazz',
  //     css`
  //       @use 'string' as string;
  //       @use './colors.jazz' import $red;

  //       $baz: blue;

  //       .foo {
  //         @compose sm:bg-color from global;

  //         color: $red;
  //       }

  //       @export $baz, $red;
  //     `,
  //   );

  //   expect(processor.icssOutput('/entry.jazz')).toMatchInlineSnapshot(`
  //     "@icss-import './colors.jazz';

  //     @icss-export {
  //     	$baz: blue;
  //     	$red: red;
  //     	foo: m_foo sm\\\\:bg-color;
  //     }

  //     .m_foo {

  //       color: red;
  //     }"
  //   `);
  // });

  // it('should hydrate file from icss', async () => {
  //   const processor = get();

  //   const { result, values, selectors } = await processor.add(
  //     '/entry.icss.jazz',
  //     css`
  //       @icss-import './colors.jazz' {
  //         $red: $red;
  //       }

  //       .m_foo {
  //         color: $red;
  //       }

  //       @icss-export {
  //         $baz: $baz;
  //         foo: m_foo px-1;
  //       }
  //     `,
  //   );

  //   expect(result.css).toMatchInlineSnapshot(`
  //     ".m_foo {
  //       color: red;
  //     }"
  //   `);

  //   expect(values).toMatchInlineSnapshot(`
  //     Object {
  //       "baz": "$baz",
  //     }
  //   `);
  //   expect(selectors).toMatchInlineSnapshot(`
  //     Object {
  //       "foo": Array [
  //         "m_foo",
  //         "px-1",
  //       ],
  //     }
  //   `);
  // });

  // describe('Importing files', () => {
  //   runFixture(`${__dirname}/../__fixtures__/imports.hrx`);
  // });

  // describe('ICSS', () => {
  //   runFixture(`${__dirname}/../__fixtures__/icss.hrx`);
  // });

  // describe('Css imports', () => {
  //   runFixture(`${__dirname}/../__fixtures__/css.hrx`);
  //   runFixture(`${__dirname}/../__fixtures__/css-modules.hrx`);
  // });
});
