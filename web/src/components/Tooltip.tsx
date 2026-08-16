import { useId, type ReactNode } from "react";

interface Props {
  label: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ label, children }: Props) {
  const id = useId();
  return (
    <span className="group/tt relative inline-flex">
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-56 -translate-x-1/2 rounded-base bg-neutro-800 px-2.5 py-1.5 text-xs leading-snug text-neutro-100 opacity-0 shadow-elevated ring-1 ring-neutro-700 transition-opacity duration-150 motion-reduce:transition-none group-hover/tt:opacity-100 group-focus-within/tt:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}