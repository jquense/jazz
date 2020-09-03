import Processor from '@modular-css/processor';
import postcss from 'postcss';

import { EXPORTS } from './utils/Symbols';

class Compiler extends Processor {
  constructor(opts: any = {}) {
    super({
      ...opts,
      exportValues: false,
      postcss: {
        parser: require('./parsers/postcss').default,
      },
    });

    this._before = postcss([require('./plugins/dependency-graph').default]);

    this._process = postcss([
      require('./plugins/value-processing').default,
      // require('@modular-css/processor/plugins/scoping.js'),
      require('@modular-css/processor/plugins/externals.js'),
      require('@modular-css/processor/plugins/composition.js'),
      // require('@modular-css/processor/plugins/keyframes.js'),
      // require('./plugins/at-export').default,
    ]);
  }

  // async file(file: string): any {}

  // async root(file: string, root: postcss.Root): any {}

  async string(file: string, text: string) {
    const { details } = await super.string(file, text);
    const values = {} as any;
    Array.from(details[EXPORTS].members.entries(), ([key, { node }]) => {
      if (node) values[key] = node.toString();
    });
    // console.log(details);
    return {
      values,
      classes: details.exports,
      result: details.result,
    };
  }
}

export default Compiler;
