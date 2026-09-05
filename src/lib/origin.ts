export const ORIGIN_MARK = "\n\n〃原文〃\n";

export function splitOrigin(content: string): { plain: string; original: string } {
  const i = content.indexOf(ORIGIN_MARK);
  if (i < 0) return { plain: content, original: "" };
  return { plain: content.slice(0, i).trim(), original: content.slice(i + ORIGIN_MARK.length).trim() };
}

export function withOrigin(plain: string, original?: string) {
  const src = (original ?? "").trim();
  if (!src || src === plain.trim()) return plain;
  return `${plain.trim()}${ORIGIN_MARK}${src}`;
}
