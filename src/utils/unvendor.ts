const DASH = '-'.charCodeAt(0);

export default function unvendor(name: string) {
  if (name.length < 2) return name;
  if (name.charCodeAt(0) !== DASH) return name;
  if (name.charCodeAt(1) === DASH) return name;

  for (let i = 2; i < name.length; i++) {
    if (name.charCodeAt(i) === DASH) return name.substring(i + 1);
  }
  return name;
}
