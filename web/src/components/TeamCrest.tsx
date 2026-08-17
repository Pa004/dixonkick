import { useState } from "react";
import { cn } from "../utils";

interface Props {
  name: string;
  short: string;
  logo: string | null;
  className?: string;
  imgClassName?: string;
  monoClassName?: string;
}

function initials(name: string, short: string): string {
  const s = short.trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  const words = name.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "").toUpperCase();
}

export default function TeamCrest({ name, short, logo, className, imgClassName, monoClassName }: Props) {
  const [failed, setFailed] = useState(false);
  const showImg = logo && !failed;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-base bg-neutro-800",
        className ?? "h-10 w-10",
      )}
    >
      {showImg ? (
        <img
          src={logo!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-contain p-1", imgClassName)}
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br from-acento-900 to-acento-950 font-display text-xs font-bold text-acento-200",
            monoClassName,
          )}
        >
          {initials(name, short)}
        </span>
      )}
    </span>
  );
}