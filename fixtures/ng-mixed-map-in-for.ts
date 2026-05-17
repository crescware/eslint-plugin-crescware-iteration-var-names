const arr = [
  [1, 2],
  [3, 4],
];
let total = 0;
for (let i = 0; i < arr.length; i++) {
  (arr[i] ?? []).forEach((value) => {
    total += value;
  });
}
export const sum = total;
