import type { DeliveryStatus, EndpointStatus } from "@hookrelay/shared";
import { Badge } from "@/components/ui/badge";

type Status = EndpointStatus | DeliveryStatus;

const VARIANTS: Record<
  Status,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  disabled: "secondary",
  pending: "outline",
  success: "default",
  dead: "destructive",
};

const LABELS: Record<Status, string> = {
  active: "Active",
  disabled: "Disabled",
  pending: "Pending",
  success: "Success",
  dead: "Dead",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
