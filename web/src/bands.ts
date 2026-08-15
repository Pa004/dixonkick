// Escala de intensidad (no de color): más intenso = más confianza, sin semántica de apuestas
export const BAND_COLORS: Record<string, string> = {
  seguro: "bg-acento-500/20 text-acento-200 ring-acento-400/40",
  probable: "bg-acento-500/10 text-acento-300 ring-acento-500/30",
  ajustado: "bg-acento-600/10 text-acento-500 ring-acento-600/25",
  incierto: "bg-neutro-500/10 text-neutro-400 ring-neutro-500/30",
};

export const BAND_DOT: Record<string, string> = {
  seguro: "bg-acento-400",
  probable: "bg-acento-500",
  ajustado: "bg-acento-600",
  incierto: "bg-neutro-500",
};
