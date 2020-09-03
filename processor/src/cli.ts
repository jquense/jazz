import yargs from 'yargs';

import Processor from './Processor';

const {
  _: [input, output],
} = yargs
  .usage('$0 <input> <output>')
  .help()
  .alias('h', 'help')
  .parse(process.argv.slice(2));

const processor = new Processor();

(async () => {
  await processor.file(input);

  // processor.o
})();
