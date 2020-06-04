import { parse } from '../values-pcss';

export default class Interpolation extends Container {
  constructor(opts = {}) {
    super(opts);

    this.type = 'interpolation';
    this.nodes = [];
  }

  static test(tokens) {
    const [[, value]] = tokens;
    return value.startsWith('#{') && value.endsWith('}');
  }

  // static fromValue(value, line, char, parser) {
  //   const node = new Interpolation();

  //   parser.init(node, line, char);
  //   parser.current = node; // eslint-disable-line no-param-reassign

  //   const { nodes: children } = parse(value.slice(2, -1), parser.options);

  //   for (const child of children) {
  //     node.push(child);
  //   }
  // }

  static fromTokens(tokens, parser) {
    const [first, ...rest] = tokens;
    const [, value, startLine, startChar] = first;

    const node = new Interpolation();

    parser.init(node, startLine, startChar);
    parser.current = node; // eslint-disable-line no-param-reassign

    const { nodes: children } = parse(value.slice(2, -1), parser.options);

    for (const child of children) {
      node.push(child);
    }
    parser.end(first);
    parser.back(rest);
  }
}
