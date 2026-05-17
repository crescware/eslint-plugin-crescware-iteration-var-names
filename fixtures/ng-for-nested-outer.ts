const arr = [
  [1, 2],
  [3, 4],
];
let total = 0;
for (let i = 0; i < arr.length; i++) {
  for (let j = 0; j < (arr[i]?.length ?? 0); j++) {
    total += arr[i]?.[j] ?? 0;
  }
}
export const sum = total;
