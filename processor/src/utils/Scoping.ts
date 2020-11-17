import type { ModuleType } from '../types';

export type IdentifierScope = 'global' | 'local';

// export type EvaluationScope = 'preprocess' | 'css' | 'modular-css';

export const topLevelExtension = '.jazz';

export const extensions = [
  `.global${topLevelExtension}`,
  `.module${topLevelExtension}`,
  topLevelExtension,
];

export function inferIdentifierScope(filename: string): IdentifierScope {
  if (filename.endsWith('.module.css')) return 'local';

  return filename.endsWith(`.global${topLevelExtension}`) ||
    filename.endsWith(`.icss${topLevelExtension}`) ||
    filename.endsWith('.css')
    ? 'global'
    : 'local';
}

export function inferModuleType(filename: string): ModuleType {
  if (
    filename.endsWith(`.icss${topLevelExtension}`) ||
    filename.endsWith(`.css`)
  )
    return 'css';

  if (filename.endsWith(topLevelExtension)) return 'jazzcss';
  return 'jazzscript';
}

export const isStyleFile = (file: string) =>
  file.endsWith(topLevelExtension) || file.endsWith('.css');
