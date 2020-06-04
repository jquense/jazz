import path from 'path';

import { Volume } from 'memfs';

import Compiler from '../Compiler';

describe('Compiler', () => {
  function get() {
    const fs = Volume.fromJSON({
      '/colors.css': `
        $red: red;
        $blue: blue;

        @export $red, $blue;
      `,
    });

    return new Compiler({
      loadFile: (file: string) => fs.readFileSync(file).toString(),
      namer: (_: string, selector: string) => `m_${selector}`,
      resolvers: [
        (from: string, to: string) => {
          return path.join(path.dirname(from), to);
        },
      ],
    });
  }

  it('should work', async () => {
    const processor = get();

    const details = await processor.string(
      '/entry.css',
      `
        @from './colors.css' import $red;

        .foo {
          color: $red;
        }
      `,
    );

    expect(details.result.css).toMatchCss(`
      .m_foo {
        color: red;
      }
    `);
  });

  it('should import namespaces', async () => {
    const processor = get();

    const details = await processor.string(
      '/entry.css',
      `
        @from './colors.css' import * as colors;

        $baz: blue;

        .foo {
          color: colors.$red;
        }

        @export $baz;
      `,
    );
    expect(details.classes).toEqual({
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
});
