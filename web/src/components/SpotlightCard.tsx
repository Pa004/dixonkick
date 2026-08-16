import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { cn } from "../utils";

// Spotlight que sigue el cursor (patrón magic-ui adaptado, sin next-themes).
// Solo estético: el contenido queda por encima con z-40.
interface Props {
  children: ReactNode;
  className?: string;
}

export default function SpotlightCard({ children, className }: Props) {
  const [enabled, setEnabled] = useState(false);
  const mouseX = useMotionValue(-300);
  const mouseY = useMotionValue(-300);
  const x = useSpring(mouseX, { stiffness: 220, damping: 30, mass: 0.6 });
  const y = useSpring(mouseY, { stiffness: 220, damping: 30, mass: 0.6 });
  const sizeRef = useRef(280);

  const reset = useCallback(() => {
    mouseX.set(-sizeRef.current * 2);
    mouseY.set(-sizeRef.current * 2);
  }, [mouseX, mouseY]);

  useEffect(() => {
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) reset();
    };
    const onBlur = () => reset();
    window.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
    };
  }, [reset]);

  return (
    <div
      className="relative isolate overflow-hidden rounded-base"
      onPointerMove={(e) => {
        setEnabled(true);
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      onPointerLeave={reset}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: useMotionTemplate`radial-gradient(${sizeRef.current}px circle at ${x}px ${y}px, oklch(0.72 0.155 170 / 0.14), transparent 70%)`,
          opacity: enabled ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />
      <div className={cn("relative z-40", className)}>{children}</div>
    </div>
  );
}