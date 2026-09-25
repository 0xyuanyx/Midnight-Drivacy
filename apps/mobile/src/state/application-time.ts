/** Display recorded times only; old demo progress may have no timestamp. */
export function applicationTime(value: string | number | null | undefined): string {
  if (value == null) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}.${two(date.getMonth() + 1)}.${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}
