import type { DeliveryStatus, StatsDto } from "@hookrelay/shared";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { getStats } from "@/apis/stats.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useRequest } from "@/lib/use-request";
import { cn } from "@/lib/utils";

// Bar and legend order: finished outcomes first, then what is still in flight.
const SEGMENTS: {
  status: DeliveryStatus;
  label: string;
  bar: string;
  hint: string;
}[] = [
  {
    status: "success",
    label: "Success",
    bar: "bg-ok",
    hint: "Answered with a 2xx",
  },
  {
    status: "dead",
    label: "Dead",
    bar: "bg-fail",
    hint: "Out of attempts or endpoint disabled",
  },
  {
    status: "pending",
    label: "Pending",
    bar: "bg-wait",
    hint: "Waiting for the next attempt",
  },
];

const numberFormat = new Intl.NumberFormat();

/** Rounded down, so 99.96% shows as 99.9% and only a perfect run reads 100%. */
function formatRate(rate: number): string {
  if (rate === 1) return "100%";
  return `${(Math.floor(rate * 1000) / 10).toFixed(1)}%`;
}

function rateSummary(stats: StatsDto): string {
  const { success, dead, pending } = stats.last24h;
  const finished = success + dead;
  if (finished === 0) {
    return `None of the ${numberFormat.format(pending)} deliveries has finished yet.`;
  }
  return `${numberFormat.format(success)} of ${numberFormat.format(finished)} finished deliveries succeeded.`;
}

function DeliveryBreakdown({ stats }: { stats: StatsDto }) {
  const total =
    stats.last24h.success + stats.last24h.dead + stats.last24h.pending;
  const description = SEGMENTS.map(
    (segment) =>
      `${segment.label} ${numberFormat.format(stats.last24h[segment.status])}`,
  ).join(", ");

  return (
    <section
      aria-labelledby="overview-rate"
      className="rounded-xl border bg-card"
    >
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <div className="flex flex-col gap-1">
            <h2 id="overview-rate" className="text-sm text-muted-foreground">
              Success rate
            </h2>
            <p className="text-4xl leading-none font-semibold tracking-tight tabular-nums">
              {stats.successRate === null ? "—" : formatRate(stats.successRate)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{rateSummary(stats)}</p>
        </div>

        <div
          role="img"
          aria-label={`${numberFormat.format(total)} deliveries: ${description}`}
          className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
        >
          {SEGMENTS.map((segment) => {
            const count = stats.last24h[segment.status];
            if (count === 0) return null;
            return (
              <div
                key={segment.status}
                className={cn("min-w-1", segment.bar)}
                style={{ flexGrow: count }}
              />
            );
          })}
        </div>
      </div>

      <ul className="grid border-t sm:grid-cols-3 sm:divide-x max-sm:divide-y">
        {SEGMENTS.map((segment) => (
          <li key={segment.status}>
            <Link
              to={`/deliveries?status=${segment.status}`}
              className="group flex h-full items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6"
            >
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className={cn("size-2 rounded-full", segment.bar)}
                  />
                  {segment.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {segment.hint}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-xl font-semibold tabular-nums">
                  {numberFormat.format(stats.last24h[segment.status])}
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OverviewPage() {
  const { data: stats, loading } = useRequest(getStats);
  const total = stats
    ? stats.last24h.pending + stats.last24h.success + stats.last24h.dead
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        description="Deliveries created in the last 24 hours, by their current status."
      />

      {stats === null ? (
        loading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Could not load stats"
            description="Try again in a moment."
          />
        )
      ) : total === 0 ? (
        <EmptyState
          title="No deliveries in the last 24 hours"
          description="Deliveries appear here when an event matches one of your endpoints."
          action={
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/endpoints" />}
            >
              View endpoints
            </Button>
          }
        />
      ) : (
        <DeliveryBreakdown stats={stats} />
      )}
    </div>
  );
}
