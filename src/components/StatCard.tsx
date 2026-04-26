import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/gex";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "call" | "put" | "warning" | "primary";
  isCurrency?: boolean;
  formatLarge?: boolean;
}

export function StatCard({ label, value, hint, icon: Icon, tone = "default", formatLarge }: Props) {
  const toneClass: Record<string, string> = {
    default: "text-foreground",
    call: "text-call",
    put: "text-put",
    warning: "text-flip",
    primary: "text-primary",
  };
  const display = typeof value === "number" && formatLarge ? formatNumber(value) : value;
  return (
    <Card className="p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
          <div className={`text-2xl font-bold mt-1 ${toneClass[tone]}`}>{display}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        {Icon && <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center"><Icon className="h-4 w-4 text-primary" /></div>}
      </div>
    </Card>
  );
}
