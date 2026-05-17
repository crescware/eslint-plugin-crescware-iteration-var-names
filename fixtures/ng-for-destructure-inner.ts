const map = new Map<string, number>([
  ["a", 1],
  ["b", 2],
]);
let total = 0;
for (const [k, x] of map) {
  total += k.length + x;
}
export const sum = total;
