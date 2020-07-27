export type IdentifierScope = 'global' | 'local';

export const topLevelExtension = '.css';

export default function inferScope(filename: string): IdentifierScope {
  return filename.endsWith(`.global${topLevelExtension}`) ? 'global' : 'local';
}
