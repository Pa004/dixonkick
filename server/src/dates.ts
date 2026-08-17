import { TZ } from "./config.js";

// Fecha local formateada en la zona configurada (en-CA => YYYY-MM-DD).
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "Hoy" como fecha local (YYYY-MM-DD) en la zona configurada, no en UTC:
// evita que cerca de la medianoche la ventana se desplace un día entero.
export function localToday(): string {
  return dayFmt.format(new Date());
}

// YYYYMMDD del día local desplazado N días. Sumar días solares al instante
// UTC y volver a formatear en la zona mantiene la fecha de calendario correcta
// incluso en transiciones de DST.
export function isoDay(offsetDays: number): string {
  const target = new Date(Date.now() + offsetDays * 86_400_000);
  return dayFmt.format(target).replace(/-/g, "");
}
