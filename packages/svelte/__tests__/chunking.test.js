import { rollup } from 'rollup';
import cssChunksPlugin from 'rollup-plugin-css-chunks';

import rollupPlugin from '../rollup';

describe('chunking', () => {
  // function run() {
  //   rollup();
  // }

  it('should work', async () => {
    const bundle = await rollup({
      input: require.resolve('../__fixtures__/entry1'),
      plugins: [rollupPlugin()],
    });

    const { output } = await bundle.generate({ format: 'es' });
    output.forEach((o) =>
      expect(o.code || o.source).toMatchSnapshot(o.fileName),
    );
  });

  it('multiple entries', async () => {
    const bundle = await rollup({
      input: [
        require.resolve('../__fixtures__/entry1'),
        require.resolve('../__fixtures__/entry2'),
      ],
      plugins: [rollupPlugin()],
    });

    const { output } = await bundle.generate({ format: 'es' });
    output.forEach((o) =>
      expect(o.code || o.source).toMatchSnapshot(o.fileName),
    );
  });

  it('should play nice with plugin-css-chunks', async () => {
    const bundle = await rollup({
      input: require.resolve('../__fixtures__/entry1'),
      plugins: [rollupPlugin(), cssChunksPlugin()],
    });

    const { output } = await bundle.generate({ dir: 'chunks', format: 'es' });
    output.forEach((o) =>
      expect(o.code || o.source).toMatchSnapshot(o.fileName),
    );
  });
});
