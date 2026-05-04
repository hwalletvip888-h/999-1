let counter = 0;

export function makeId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}
