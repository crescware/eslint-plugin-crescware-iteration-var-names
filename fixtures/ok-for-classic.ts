const arr = [1, 2, 3];
let total = 0;
for (let i = 0; i < arr.length; i++) {
  total += arr[i] ?? 0;
}
export const sum = total;
