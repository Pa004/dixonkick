import type { ReactNode } from "react";
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  label: ReactNode;
  children: ReactNode;
}

export default function Tooltip({ label, children }: Props) {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger render={<span />} className="inline-flex">
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          {label}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}