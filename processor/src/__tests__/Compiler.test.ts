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
      '/colors.mcss': `
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
      '/entry.mcss',
      `
        @use './colors.mcss' import $red;

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
      '/entry.mcss',
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
        '/entry.mcss',
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
        '/entry.mcss',
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
      '/entry.mcss',
      css`
        @use './colors.mcss' as colors;

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

  describe('Importing files', () => {
    runFixture(`${__dirname}/../__fixtures__/imports.hrx`);
  });

  describe('ICSS', () => {
    runFixture(`${__dirname}/../__fixtures__/icss.hrx`);
  });
});
