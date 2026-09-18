const SIZE = {
  sm: "size-6 rounded-md text-[10px]",
  md: "size-9 rounded-lg text-xs",
  lg: "size-14 rounded-xl text-lg",
} as const;

function hueFor(slug: string): number {
  let hue = 0;
  for (const ch of slug) hue = (hue * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return hue;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// Each client gets a stable colour from its slug so brands are easy to tell apart at a glance.
export function ClientMark({ name, slug, size = "md" }: { name: string; slug: string; size?: keyof typeof SIZE }) {
  const hue = hueFor(slug);
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center font-display font-bold ${SIZE[size]}`}
      style={{
        backgroundColor: `light-dark(oklch(0.92 0.05 ${hue}), oklch(0.33 0.06 ${hue}))`,
        color: `light-dark(oklch(0.38 0.09 ${hue}), oklch(0.88 0.06 ${hue}))`,
      }}
    >
      {initialsFor(name)}
    </span>
  );
}
