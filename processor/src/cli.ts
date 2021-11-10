#!/usr/bin/env node

// import { promises as fs } from 'fs';
// import path from 'path';

// import yargs from 'yargs';

// import Processor from './Processor';

// const {
//   _: [input, output],
// } = yargs
//   .usage('$0 <input> <output>')
//   .help()
//   .alias('h', 'help')
//   .parse(process.argv.slice(2));

// // let tsCompiler: Register;

// const processor = new Processor({
//   // loadFile: async (id) => {
//   //   let content = await fs.readFile(id, 'utf-8');
//   //   if (path.extname(id).match(/\.tsx?/)) {
//   //     // eslint-disable-next-line @typescript-eslint/no-var-requires
//   //     tsCompiler = tsCompiler || require('ts-node').create();
//   //     content = tsCompiler.compile(`require('ts-node')();\n${content}`, id);
//   //   }
//   //   return content;
//   // },
// });

// (async () => {
//   await processor.add(input);

//   const { css, exports } = await processor.output();

//   fs.mkdir(path.dirname(output), { recursive: true });

//   fs.writeFile(output, css);
//   if (exports) {
//     fs.writeFile(
//       output.replace(path.extname(output), '.json'),
//       JSON.stringify(exports, null, 2),
//     );
//   }
// })();
