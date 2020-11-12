export type IdentifierScope = 'global' | 'local';

export type EvaluationScope = 'preprocess' | 'css' | 'modular-css';

export const topLevelExtension = '.jazz';

export const extensions = [
  `.global${topLevelExtension}`,
  `.module${topLevelExtension}`,
  topLevelExtension,
];

export function inferIdentifierScope(filename: string): IdentifierScope {
  if (filename.endsWith('.module.css')) return 'local';

  return filename.endsWith(`.global${topLevelExtension}`) ||
    filename.endsWith('.css')
    ? 'global'
    : 'local';
}

export const isStyleFile = (file: string) =>
  file.endsWith(topLevelExtension) || file.endsWith('.css');
