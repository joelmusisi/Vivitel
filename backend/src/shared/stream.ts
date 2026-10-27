export function isReadableStream(value: any): value is NodeJS.ReadableStream {
  return Boolean(value && typeof value.pipe === "function");
}
