export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
