import postcss from 'postcss';

import Scope from '../src/utils/Scope';
import interleave from '../src/utils/interleave';

export const css = (strings: TemplateStringsArray, ...values: any[]) => {
  return interleave(strings, values).join('');
};

export async function evaluate(cssStr: string, scope = new Scope()) {
  const { css } = await postcss([
    require('../src/plugins/at-from').default,
    require('../src/plugins/value-processing').default,
  ]).process(cssStr, {
    parser: require('postcss-scss'),
    from: './test.js',
    source: false,
    trace: true,
    files: { './test.js': { scope } },
  } as any);

  return css;
}
