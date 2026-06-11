import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow sm:h-11 sm:w-11">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-start lg:justify-end [&>*]:min-w-0">
          {actions}
        </div>
      )}
    </div>
  );
}
