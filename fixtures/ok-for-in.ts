const obj: Record<string, number> = { a: 1, b: 2 };
let total = 0;
for (const k in obj) {
  total += obj[k] ?? 0;
}
export const sum = total;
