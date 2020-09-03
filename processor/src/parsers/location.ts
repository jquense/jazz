export type Location = {
  line: number;
  column: number;
};

export function toOffset(src: string, { line, column }: Location) {
  const lines = src.split(/\n/);
  let offset = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    if (idx + 1 === line) {
      offset += column - 1;
      break;
    }
    offset += lines[idx].length + 1;
  }
  return offset;
}

export function getSubstring(css: string, start: Location, end: Location) {
  let lines = css.split(/\r?\n/);

  lines = lines.slice(start.line - 1, end.line - 1);

  lines[0] = lines[0].slice(start.column - 1, -1);
  lines[lines.length - 1] = lines[lines.length - 1].slice(0, end.column - 1);

  return lines.join('\n');
}

export function getPosition(offset: Location, pos: Location) {
  return pos.line === 1
    ? { line: offset.line, column: offset.column + pos.column }
    : { line: offset.line + pos.line - 1, column: pos.column };
}
