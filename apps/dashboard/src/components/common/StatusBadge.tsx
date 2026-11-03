import type { DeliveryStatus, EndpointStatus } from "@hookrelay/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = EndpointStatus | DeliveryStatus;
type Tone = "ok" | "wait" | "fail" | "neutral";

// A disabled endpoint is neutral, not a failure: an owner may have switched it off on purpose.
const TONES: Record<Status, Tone> = {
  active: "ok",
  disabled: "neutral",
  pending: "wait",
  success: "ok",
  dead: "fail",
};

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  fail: "bg-fail-soft text-fail",
  neutral: "bg-secondary text-muted-foreground",
};

const LABELS: Record<Status, string> = {
  active: "Active",
  disabled: "Disabled",
  pending: "Pending",
  success: "Success",
  dead: "Dead",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className={cn("gap-1.5", TONE_CLASSES[TONES[status]])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </Badge>
  );
}
