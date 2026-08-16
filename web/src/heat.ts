export function heatColor(p: number): string {
  if (p < 0.03) return "bg-neutro-850 text-neutro-500";
  if (p < 0.08) return "bg-neutro-800 text-neutro-400";
  if (p < 0.15) return "bg-acento-950 text-acento-300";
  return "bg-acento-400 text-neutro-950";
}