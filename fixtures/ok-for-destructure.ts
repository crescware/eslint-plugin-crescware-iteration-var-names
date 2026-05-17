const map = new Map<string, number>([
  ["a", 1],
  ["b", 2],
]);
let total = 0;
for (const [k, v] of map) {
  total += k.length + v;
}
export const sum = total;
