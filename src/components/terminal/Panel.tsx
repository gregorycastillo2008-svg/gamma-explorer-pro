import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Props {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}

export function Panel({ title, subtitle, right, children, className, noPad }: Props) {
  return (
    <div className={cn("rounded-md border border-border bg-card overflow-hidden flex flex-col", className)}>
      {(title || right) && (
        <div className="h-9 shrink-0 px-3 flex items-center justify-between border-b border-border bg-secondary/40">
          <div className="flex items-baseline gap-2">
            {title && <span className="text-[11px] font-bold tracking-widest uppercase text-foreground">{title}</span>}
            {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
          </div>
          {right}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", noPad ? "" : "p-4")}>{children}</div>
    </div>
  );
}

export function StatBlock({ label, value, sub, tone = "default" }: {
  label: string; value: string | number; sub?: string;
  tone?: "default" | "call" | "put" | "warning" | "primary";
}) {
  const toneClass = {
    default: "text-foreground",
    call: "text-call",
    put: "text-put",
    warning: "text-warning",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded border border-border bg-card/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold font-mono mt-0.5", toneClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
