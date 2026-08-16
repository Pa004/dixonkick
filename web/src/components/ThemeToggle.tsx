import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Sistema", Icon: Laptop },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

export default function ThemeToggle() {
  const { preference, resolved, setTheme } = useTheme();
  const CurrentIcon = OPTIONS.find((o) => o.value === resolved)?.Icon ?? Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Cambiar tema de la app"
            className={cn(
              "inline-flex min-h-11 w-11 items-center justify-center rounded-base border border-neutro-700 text-neutro-300 transition-colors hover:border-acento-500/60 hover:text-acento-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400",
            )}
          />
        }
      >
        <CurrentIcon className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={preference} onValueChange={(v) => setTheme(v as ThemePreference)}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="mr-1.5" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}