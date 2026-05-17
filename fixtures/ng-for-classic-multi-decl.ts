const arr = [1, 2, 3];
let total = 0;
for (let i = 0, j = arr.length - 1; i < j; i++, j--) {
  total += (arr[i] ?? 0) + (arr[j] ?? 0);
}
export const sum = total;
