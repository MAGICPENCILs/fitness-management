/** ตรวจ SyntaxError จาก JSON parser ให้ได้แม้ error จะถูกสร้างใน JavaScript realm คนละตัว เช่น test runner */
export function isJsonSyntaxError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "SyntaxError")
  );
}
