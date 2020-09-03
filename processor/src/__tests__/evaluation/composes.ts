import { Selectors, css, process } from '../../../test/helpers';
import ModuleMembers, { ClassReferenceMember } from '../../ModuleMembers';
import Scope from '../../Scope';

describe('@composes', () => {
  it('should compse local classes', async () => {
    const { css: result, exports } = await process(
      css`
        .d {
          a: a;
        }

        .a {
          a: a;
        }

        .b {
          @compose d;

          b: b;
        }

        .c {
          @compose b, a;
        }
      `,
      { hash: true },
    );

    expect(result).toMatchCss(`
      .h_d { a: a; }

      .h_a { a: a; }

      .h_b { b: b; }
    `);

    const cls = exports.get('%c') as ClassReferenceMember;

    expect(cls.composes).toHaveLength(3);

    expect(cls.composes.map((c) => `${c}`)).toEqual(['.h_b', '.h_d', '.h_a']);
  });

  it('should compose global classes', async () => {
    const { css: result, exports } = await process(
      css`
        .c {
          @compose b, a from global;
        }
      `,
      { hash: true },
    );

    expect(result).toMatchCss(``);

    const cls = exports.get('%c') as ClassReferenceMember;

    expect(cls.composes).toHaveLength(2);

    expect(cls.composes.map((c) => `${c}`)).toEqual(['.b', '.a']);
  });

  it('should throw on missing clasess', async () => {
    await expect(() =>
      process(
        css`
          .c {
            @compose b;
          }
        `,
        { hash: true },
      ),
    ).rejects.toThrow('CSS class "b" is not declared');
  });

  it('should throw on unresolved files', async () => {
    await expect(() =>
      process(
        css`
          .c {
            @compose b from './unknown';
          }
        `,
        { hash: true },
      ),
    ).rejects.toThrow('Could not resolve "./unknown"');
  });

  it('should throw on missing exports', async () => {
    await expect(() =>
      process(
        css`
          .d {
            @compose a, b from './other';
          }
        `,
        {
          modules: [
            ['other', { scope: new Scope(), exports: new ModuleMembers() }],
          ],
        },
      ),
    ).rejects.toThrow('"./other" has no exported class "a"');
  });

  it('should compose imported classes', async () => {
    const { css: result, exports } = await process(
      css`
        .d {
          @compose a, b from './other';
        }
      `,
      {
        hash: true,
        modules: [
          [
            'other',
            {
              scope: new Scope(),
              exports: new ModuleMembers([
                [
                  '%a',
                  {
                    type: 'class',
                    identifier: 'a',
                    selector: Selectors.class`h_a`,
                    composes: [Selectors.class`h_c`],
                  },
                ],
                [
                  '%b',
                  {
                    type: 'class',
                    identifier: 'b',
                    selector: Selectors.class`h_b`,
                    composes: [],
                  },
                ],
              ]),
            },
          ],
        ],
      },
    );

    expect(result).toMatchCss(``);

    const cls = exports.get('%d') as ClassReferenceMember;

    expect(cls.composes).toHaveLength(3);

    expect(cls.composes.map((c) => `${c}`)).toEqual(['.h_a', '.h_c', '.h_b']);
  });

  it('should dedupe classes', async () => {
    const { css: result, exports } = await process(
      css`
        .a {
          a: a;
        }

        .b {
          @compose a, a;

          b: b;
        }
      `,
      { hash: true },
    );

    expect(result).toMatchCss(`
      .h_a { a: a; }

      .h_b { b: b; }
    `);

    const cls = exports.get('%b') as ClassReferenceMember;

    expect(cls.composes.map((c) => `${c}`)).toEqual(['.h_a']);
  });
});
