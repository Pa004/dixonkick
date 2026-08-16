import { useEffect, useState } from "react";

function diff(target: number): { h: number; m: number; s: number } {
  const d = Math.max(0, target - Date.now());
  return {
    h: Math.floor(d / 3_600_000),
    m: Math.floor((d % 3_600_000) / 60_000),
    s: Math.floor((d % 60_000) / 1000),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === 0) return null;

  const { h, m, s } = diff(target);
  return (
    <span className="font-display tabular-nums text-neutro-200">
      {h > 0 ? `${h}h ` : ""}
      {pad(m)}:{pad(s)}
    </span>
  );
}