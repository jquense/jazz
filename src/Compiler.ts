import Processor from '@modular-css/processor';
import mapValues from 'lodash/mapValues';
import postcss from 'postcss';

import { EXPORTS } from './utils/Symbols';

class Compiler extends Processor {
  constructor(opts: any = {}) {
    super({
      ...opts,
      exportValues: false,
      postcss: {
        parser: require('postcss-scss'),
      },
    });

    this._before = postcss([require('./plugins/dependency-graph').default]);

    this._process = postcss([
      require('./plugins/at-from').default,
      require('./plugins/value-processing').default,
      // require('./plugins/variable-replace').default,
      require('@modular-css/processor/plugins/scoping.js'),
      require('@modular-css/processor/plugins/externals.js'),
      require('@modular-css/processor/plugins/composition.js'),
      require('@modular-css/processor/plugins/keyframes.js'),
      require('./plugins/at-export').default,
    ]);
  }

  // async file(file: string): any {}

  // async root(file: string, root: postcss.Root): any {}

  async string(file: string, text: string) {
    const { details } = await super.string(file, text);

    // console.log(details);
    return {
      values: mapValues(details[EXPORTS].variables, (v) => v.node.toString()),
      classes: details.exports,
      result: details.result,
    };
  }
}

export default Compiler;
