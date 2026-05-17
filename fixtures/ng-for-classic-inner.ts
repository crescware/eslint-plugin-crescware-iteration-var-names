const arr = [1, 2, 3];
let total = 0;
for (let x = 0; x < arr.length; x++) {
  total += arr[x] ?? 0;
}
export const sum = total;
