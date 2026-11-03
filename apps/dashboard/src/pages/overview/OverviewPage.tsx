import type { DeliveryStatus } from "@hookrelay/shared";
import { Link } from "react-router-dom";
import { getStats } from "@/apis/stats.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRequest } from "@/lib/use-request";

const STATUSES: DeliveryStatus[] = ["pending", "success", "dead"];

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function OverviewPage() {
  const { data: stats, loading } = useRequest(getStats);
  const total = stats
    ? stats.last24h.pending + stats.last24h.success + stats.last24h.dead
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Deliveries created in the last 24 hours, by current status.
        </p>
      </div>

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
          description="Send an event to an endpoint and its deliveries are counted here."
          action={
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/endpoints" />}
            >
              Go to endpoints
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Success rate</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatRate(stats.successRate)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Success out of success + dead
              </p>
            </CardHeader>
          </Card>
          {STATUSES.map((status) => (
            <Link
              key={status}
              to={`/deliveries?status=${status}`}
              className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardDescription>
                    <StatusBadge status={status} />
                  </CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {stats.last24h[status].toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
