import { parse } from '../at_composes';

describe('parser: @composes', () => {
  it('should handle local composes', () => {
    expect(parse(`foo, bar`)).toEqual({
      type: 'local',
      classes: [
        { type: 'class', name: 'foo' },
        { type: 'class', name: 'bar' },
      ],
    });
  });

  it('should handle global composes', () => {
    expect(parse(`foo, bar from global`)).toEqual({
      type: 'global',
      classes: [
        { type: 'class', name: 'foo' },
        { type: 'class', name: 'bar' },
      ],
    });
  });

  it('should handle import composes', () => {
    expect(parse(`foo, bar from "./foo"`)).toEqual({
      type: 'import',
      source: './foo',
      classes: [
        { type: 'class', name: 'foo' },
        { type: 'class', name: 'bar' },
      ],
    });
  });

  it('should handle variable composes', () => {
    expect(parse(`foo, bar from "#{$quz}"`)).toEqual({
      type: 'import',
      source: '#{$quz}',
      classes: [
        { type: 'class', name: 'foo' },
        { type: 'class', name: 'bar' },
      ],
    });
  });
});
