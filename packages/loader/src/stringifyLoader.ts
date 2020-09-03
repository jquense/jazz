// Borrowed from less-loader, prevents webpack from complaining that the file type is unknown by ensuring any output is
// turned into a valid JSON string
function stringifyLoader(content: string) {
  return JSON.stringify(content);
}

module.exports = stringifyLoader;
