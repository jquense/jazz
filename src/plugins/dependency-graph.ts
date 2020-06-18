// @ts-ignore
import composes from '@modular-css/processor/parsers/composes';
// @ts-ignore
import external from '@modular-css/processor/parsers/external';
import type postcss from 'postcss';
import selector, { Pseudo } from 'postcss-selector-parser';

import Parser from '../parsers';
import { PostcssPlugin } from '../types';

const plugin = 'modular-css-graph-nodes';

const dependencyGraphPlugin: PostcssPlugin = (css, result) => {
  let current: postcss.Rule;
  const parser = Parser.get(css);

  const parse = (parsed: any, rule: postcss.Node) => {
    const { opts } = result;
    // try {
    //   parsed = _parse(value);
    // } catch (e) {
    //   throw rule.error(e.toString(), {
    //     word: e.location
    //       ? value.substring(e.location.start.offset, e.location.end.offset)
    //       : value,
    //   });
    // }

    if (!parsed.source) {
      return;
    }

    const dependency = opts.resolve(opts.from, parsed.source);

    if (!dependency) {
      throw rule.error(
        `Unable to locate "${parsed.source}" from "${opts.from}"`,
        { word: parsed.source },
      );
    }
    // console.log('DEP!', dependency);
    result.messages.push({
      type: 'modular-css',

      plugin,
      dependency,
    });
  };

  const externals = selector((selectors) =>
    selectors.walkPseudos((pseudo: Pseudo) => {
      // Need to ensure we only process :external pseudos, see #261
      if (pseudo.value !== ':external') {
        return;
      }

      parse(external.parse(pseudo.nodes.toString()), current);
    }),
  );

  // // @value <value> from <file>
  css.walkAtRules('from', (rule) => parse(parser.import(rule), rule));
  css.walkAtRules('export', (rule) => parse(parser.export(rule), rule));

  // { composes: <rule> from <file> }
  css.walkDecls('composes', (rule) => parse(composes.parse(rule.value), rule));

  // :external(<rule> from <file>) { ... }
  // Have to assign to current so postcss-selector-parser can reference the right thing
  // in errors
  css.walkRules(/:external/, (rule) => {
    current = rule;

    externals.processSync(rule);
  });
};

export default dependencyGraphPlugin;
