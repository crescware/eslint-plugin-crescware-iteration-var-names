const obj: Record<string, number> = { a: 1, b: 2 };
let total = 0;
for (const x in obj) {
  total += obj[x] ?? 0;
}
export const sum = total;
