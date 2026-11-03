import type { DeliveryStatus } from "@hookrelay/shared";
import { useSearchParams } from "react-router-dom";
import { listDeliveries } from "@/apis/deliveries.api";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { DeliveriesTable } from "@/components/deliveries/DeliveriesTable";
import { Button } from "@/components/ui/button";
import { useRequest } from "@/lib/use-request";

const FILTERS: { value: DeliveryStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "success", label: "Success" },
  { value: "dead", label: "Dead" },
];

function parseStatus(value: string | null): DeliveryStatus | undefined {
  return value === "pending" || value === "success" || value === "dead"
    ? value
    : undefined;
}

export function DeliveriesPage() {
  // The filter lives in the URL so it survives going to a delivery and back.
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const { data: deliveries, loading } = useRequest(
    () => listDeliveries({ status }),
    [status],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deliveries"
        description="The latest 50 deliveries, newest first. Each one is an event on its way to one endpoint."
        actions={
          <div
            className="inline-flex rounded-lg border bg-card p-0.5"
            role="group"
            aria-label="Filter by status"
          >
            {FILTERS.map((filter) => (
              <Button
                key={filter.label}
                size="sm"
                variant="ghost"
                className={
                  filter.value === status
                    ? "bg-secondary text-foreground hover:bg-secondary"
                    : "text-muted-foreground"
                }
                aria-pressed={filter.value === status}
                onClick={() =>
                  setSearchParams(filter.value ? { status: filter.value } : {})
                }
              >
                {filter.label}
              </Button>
            ))}
          </div>
        }
      />

      {deliveries === null ? (
        loading ? (
          <LoadingState />
        ) : (
          <EmptyState
            title="Could not load deliveries"
            description="Try again in a moment."
          />
        )
      ) : deliveries.length === 0 ? (
        <EmptyState
          title={status ? `No ${status} deliveries` : "No deliveries yet"}
          description={
            status
              ? "Pick another status to see more."
              : "Deliveries appear when an event matches an endpoint."
          }
        />
      ) : (
        <DeliveriesTable deliveries={deliveries} />
      )}
    </div>
  );
}
