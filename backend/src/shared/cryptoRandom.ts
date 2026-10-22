export function cryptoRandom(): string {
  return [...Array(4)].map(() => Math.floor(Math.random() * 0xffffffff).toString(16)).join("");
}
