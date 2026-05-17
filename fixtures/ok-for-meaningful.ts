const items = ["a", "b", "c"];
let acc = 0;
for (let index = 0; index < items.length; index++) {
  acc += (items[index] ?? "").length;
}
for (const item of items) {
  acc += item.length;
}
for (const key in items) {
  acc += key.length;
}
export const total = acc;
