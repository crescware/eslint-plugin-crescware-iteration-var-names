const arr = [
  [1, 2],
  [3, 4],
];
const out = arr.map((r) => {
  let total = 0;
  for (const v of r) {
    total += v;
  }
  return total;
});
export const sums = out;
