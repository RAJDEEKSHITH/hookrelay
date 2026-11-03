import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned on wide screens, below the title on phones. */
  actions?: ReactNode;
  /** The list page a detail page came from. */
  back?: { to: string; label: string };
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          to={back.to}
          className="-ml-0.5 flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl leading-7 font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
