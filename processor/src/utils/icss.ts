import * as postcss from 'postcss';

import * as Ast from '../Ast';
import {
  ClassReferenceMember,
  VariableMember,
  deserializeClassMember,
} from '../ModuleMembers';
import { StringValue } from '../Values';

const importPattern = /^:import\(("[^"]*"|'[^']*'|[^"']+)\)$/;
const balancedQuotes = /^("[^"]*"|'[^']*'|[^"']+)$/;

type Rule = postcss.AtRule | postcss.Rule;
const getDeclsObject = (rule: Rule) => {
  const object: Record<string, string> = Object.create(null);

  rule.walkDecls((decl) => {
    const before = decl.raws.before ? decl.raws.before.trim() : '';

    object[before + decl.prop] = decl.value;
  });

  return object;
};

export const createImports = (
  imports: Record<string, Record<string, string>>,
  mode: 'atrule' | 'rule' = 'rule',
) => {
  return Object.keys(imports).map((path) => {
    const aliases = imports[path];
    const declarations = Object.keys(aliases).map((key) =>
      postcss.decl({
        prop: key,
        value: aliases[key],
        // @ts-ignore
        raws: { before: '\n  ' },
      }),
    );

    const hasDeclarations = declarations.length > 0;

    const rule =
      mode === 'rule'
        ? postcss.rule({
            selector: `:import('${path}')`,
            raws: { after: hasDeclarations ? '\n' : '' },
          })
        : postcss.atRule({
            name: 'icss-import',
            params: `'${path}'`,
            raws: { after: hasDeclarations ? '\n' : '' },
          });

    if (hasDeclarations) {
      rule.append(declarations);
    }

    return rule;
  });
};

export const createExports = (
  exports: Record<string, string>,
  mode: 'atrule' | 'rule' = 'atrule',
) => {
  const declarations = Object.keys(exports).map((key) =>
    postcss.decl({
      prop: key,
      value: exports[key],
      // @ts-ignore
      raws: { before: '\n  ' },
    }),
  );

  if (declarations.length === 0) {
    return [];
  }
  const rule =
    mode === 'rule'
      ? postcss.rule({
          selector: `:export`,
          raws: { after: '\n' },
        })
      : postcss.atRule({
          name: 'icss-export',
          raws: { after: '\n' },
        });

  rule.append(declarations);

  return [rule];
};

const unquote = (str: string) => str.replace(/'|"/g, '');

export function requestFromIcssImportRule(node: Rule) {
  if (node.type === 'atrule' && node.name === 'icss-import') {
    const matches = balancedQuotes.exec(node.params.trim());
    return unquote(matches![1]);
  }
}

export function importToUsedRule(node: Rule) {
  const specifiers: Ast.ImportNamedSpecifier[] = [];
  node.walkDecls((decl) => {
    const { prop, value } = decl;
    let local, imported;
    switch (value[0]) {
      case '$':
        local = new Ast.Variable(prop.slice(1));
        imported = new Ast.Variable(value.slice(1));
        break;
      case '%':
        local = new Ast.ClassReference(prop.slice(1));
        imported = new Ast.ClassReference(value.slice(1));
        break;
      default:
        local = new Ast.Ident(prop);
        imported = new Ast.Ident(value);
        break;
    }
    specifiers.push(new Ast.ImportNamedSpecifier(imported, local));
  });

  const atRule: Ast.UseAtRule = postcss.atRule({ name: 'use' }) as any;

  atRule.request = requestFromIcssImportRule(node)!;
  atRule.specifiers = specifiers;
  return atRule;
}

export function exportToMembers(node: Rule) {
  const exportMembers: [string, VariableMember | ClassReferenceMember][] = [];

  node.walkDecls((decl) => {
    const { prop, value } = decl;

    if (prop.startsWith('$')) {
      exportMembers.push([
        prop,
        {
          type: 'variable',
          identifier: prop.slice(1),
          node: new StringValue(value),
        },
      ]);
    } else {
      exportMembers.push([`%${prop}`, deserializeClassMember(value, prop)]);
    }
  });

  return exportMembers;
}

export function extract(
  css: postcss.Root,
  removeRules = true,
  mode: 'auto' | 'atrule' | 'rule' = 'auto',
) {
  const icssImports: Record<string, Record<string, string>> = Object.create(
    null,
  );
  const icssExports: Record<string, string> = Object.create(null);

  function addImports(node: Rule, path: string) {
    const unquoted = path.replace(/'|"/g, '');
    icssImports[unquoted] = Object.assign(
      icssImports[unquoted] || {},
      getDeclsObject(node),
    );

    if (removeRules) {
      node.remove();
    }
  }

  function addExports(node: Rule) {
    Object.assign(icssExports, getDeclsObject(node));
    if (removeRules) {
      node.remove();
    }
  }

  css.each((node: Rule) => {
    if (node.type === 'rule' && mode !== 'atrule') {
      if (node.selector.slice(0, 7) === ':import') {
        const matches = importPattern.exec(node.selector);

        if (matches) {
          addImports(node, matches[1]);
        }
      }

      if (node.selector === ':export') {
        addExports(node);
      }
    }

    if (node.type === 'atrule' && mode !== 'rule') {
      if (node.name === 'icss-import') {
        const matches = balancedQuotes.exec(node.params.trim());

        if (matches) {
          addImports(node, matches[1]);
        }
      }
      if (node.name === 'icss-export') {
        addExports(node);
      }
    }
  });

  return { icssImports, icssExports };
}
