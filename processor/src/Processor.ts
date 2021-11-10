/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */

import path from 'path';

import type { ProcessOptions } from 'postcss';

import Graph, { FileDependency, Options, relative } from './Graph';
import type { Member } from './ModuleMembers';
import postcssParser from './parsers/jazz-postcss';
import type { File } from './types';

const memberId = (member: Member) => {
  if (member.type === 'class') return member.identifier;
  if (member.type === 'variable') return `$${member.identifier}`;
};

export type { Options, FileDependency };

class Processor extends Graph {
  // Check if a file exists in the currently-processed set
  has(input: string) {
    return this.files.has(this.normalize(input));
  }

  // Mark a file and everything that depends on it as invalid so
  // it can be overwritten
  invalidate(input: string) {
    if (!input) {
      throw new Error('invalidate() requires a file argument');
    }

    // Only want files actually in the array
    const source = this.normalize(input);

    if (!this.graph.hasNode(source)) {
      throw new Error(`Unknown file: ${input}`);
    }

    const deps = this.dependents(source);

    [...deps, source].forEach((file) => {
      this.log('invalidate()', file);
      this.files.get(file)!.valid = false;
    });
  }

  // Get the dependency order for a file or the entire tree
  dependencies(
    file: string,
    options: { leavesOnly?: boolean } = {},
  ): string[] {
    const { leavesOnly } = options;

    if (file) {
      const id = this.normalize(file);

      return this.graph.dependenciesOf(id, leavesOnly);
    }

    return this.graph.overallOrder(leavesOnly);
  }

  // Get the dependant files for a file
  dependents(file: string, options: { leavesOnly?: boolean } = {}) {
    if (!file) {
      throw new Error('Must provide a file to processor.dependants()');
    }

    const id = this.normalize(file);
    const { leavesOnly } = options;

    return this.graph.dependantsOf(id, leavesOnly);
  }

  // Get the ultimate output for specific files or the entire tree
  output(args: { to?: string; files?: string[] } = {}) {
    const result = super.output(args);

    Object.defineProperty(result, 'exports', {
      get: () => {
        const json: Record<string, Record<string, string>> = {};
        this.files.forEach(({ module }, key) => {
          if (module.type !== 'jazzscript')
            json[relative(this.options.cwd, key)] = module.exports.toJSON();
        });

        return json;
      },
    });

    return result as any;
  }

  async add(_id: string, content?: string): Promise<File> {
    await super.add(_id, content);

    const id = this.normalize(_id);

    const file = this.files.get(id)!;
    const { module, result, valid } = file;

    const values: Record<string, string> = {};
    const selectors: Record<string, string[]> = {};

    module.exports.forEach((member) => {
      if (member.type === 'class')
        selectors[member.identifier] = [
          String(member.selector.name),
          ...member.composes.map((c) => String(c.name)),
        ];
      else if (member.type === 'variable') {
        values[member.identifier] = String(member.node);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const processor = this;

    return {
      id,
      type: module.type,
      module,
      valid,
      values,
      selectors,
      get result() {
        return result.toResult();
      },
      get exports() {
        return module.exports.toJSON();
      },
      get imports() {
        return processor.imports(id);
      },
    };
  }

  imports(id: string): string[] {
    // @ts-ignore
    return (this.graph.outgoingEdges[id] || []).filter((dep) => {
      return this.files.get(dep)!.module.type !== 'jazzscript';
    });
  }

  icssOutput(_id: string) {
    const id = this.normalize(_id);
    const imports = this.imports(id);
    const { result, module } = this.files.get(id)!;
    const { css } = result.toResult();

    const grouped: Record<string, string[]> = {};

    let icssExports = module.exports.toCSS('\t').join('\n');

    // XXX: this is weird b/c reexports use the compiled value here;
    // for (const member of module.exports.values()) {
    //   if (!member || !member.from) continue;

    //   grouped[member.from.request] = grouped[member.from.request] || [];
    //   // FIXME this assumes it wasn't renamed
    //   const mid = memberId(member)!;
    //   grouped[member.from.request].push(
    //     `\t${mid}: ${member.from.original || mid};`,
    //   );
    // }

    if (icssExports) icssExports = `@icss-export {\n${icssExports}\n}\n`;

    let icssImports = '';
    for (const dep of imports) {
      let relpath = path.relative(path.dirname(id), dep);
      if (!relpath.startsWith('.')) relpath = `./${relpath}`;
      if (grouped[dep]) {
        icssImports += `@icss-import '${relpath}' {\n`;
        icssImports += grouped[dep].join(';\n');
        icssImports += '\n}\n';
      } else {
        icssImports += `@icss-import '${relpath}';\n`;
      }
    }

    return `${icssImports}\n${icssExports}\n${css}`;
  }

  generateFileOutput(_id: string) {
    const id = this.normalize(_id);
    const { module } = this.files.get(id)!;

    const imports = this.imports(id);

    const exports = [] as string[];
    const grouped: Record<string, string[]> = {};

    for (const member of module.exports.values()) {
      const identifier = memberId(member);
      if (!identifier) continue;

      if (member.source) {
        grouped[member.source] = grouped[member.source] || [];
        // FIXME this assumes it wasn't renamed
        grouped[member.source].push(memberId(member)!);
        continue;
      }

      if (member.type === 'class') {
        const classes = [
          `${member.selector.name}`,
          ...member.composes.map((c) => String(c.name)),
        ].join(' ');
        exports.push(`export const ${identifier} = '${classes}';`);
      } else if (member.type === 'variable') {
        exports.push(`export const ${identifier} = ${member.node.toJSON()};`);
      }
    }

    for (const dep of imports) {
      let relpath = path.relative(path.dirname(id), dep);
      if (!relpath.startsWith('.')) relpath = `./${relpath}`;
      if (grouped[dep]) {
        exports.push(
          `export { ${grouped[dep].join(', ')} } from '${relpath}';`,
        );
      } else {
        exports.unshift(`import '${relpath}';`);
      }
    }
    exports.push('');
    return exports.join('\n');
  }
}

type ParseOptions = {
  filename?: string;
  map?: ProcessOptions['map'];
};

export function parse(content: string, { filename, map }: ParseOptions = {}) {
  return postcssParser(content, { from: filename, map });
}

export async function render(file: string, content?: string, opts?: Options) {
  const p = new Processor(opts);
  await p.add(file, content);

  return p.output();
}

export default Processor;
