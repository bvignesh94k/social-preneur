// Em dashes read as machine-written in social posts, so generated text never contains them.
export function removeDashes(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/–/g, "-")
    .replace(/^,\s*/, "")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?;:])/g, "$1")
    .replace(/,\s*$/, "");
}

export function applyHouseStyle<T>(value: T): T {
  if (typeof value === "string") return removeDashes(value) as T;
  if (Array.isArray(value)) return value.map((item) => applyHouseStyle(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applyHouseStyle(item)])) as T;
  }
  return value;
}
