import { Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SortMode = "date" | "confidence";

const SORT_LABEL: Record<SortMode, string> = {
  date: "Ordenar por fecha",
  confidence: "Ordenar por confianza",
};

interface Props {
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  onlyPredicted: boolean;
  onOnlyPredicted: (v: boolean) => void;
}

export default function MatchToolbar({ sort, onSort, onlyPredicted, onOnlyPredicted }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select value={sort} onValueChange={(v) => onSort(v as SortMode)}>
        <SelectTrigger aria-label="Ordenar partidos" size="sm" className="text-xs">
          {SORT_LABEL[sort]}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Ordenar por fecha</SelectItem>
          <SelectItem value="confidence">Ordenar por confianza</SelectItem>
        </SelectContent>
      </Select>

      <button
        type="button"
        role="checkbox"
        aria-checked={onlyPredicted}
        onClick={() => onOnlyPredicted(!onlyPredicted)}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400",
          onlyPredicted
            ? "border-acento-500/60 bg-acento-500/15 text-acento-200"
            : "border-neutro-700 text-neutro-400 hover:text-neutro-200",
        )}
      >
        <Filter className="size-3.5" aria-hidden="true" />
        Solo con predicción
      </button>
    </div>
  );
}