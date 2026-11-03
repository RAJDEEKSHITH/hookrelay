import { httpTone, type Tone } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  fail: "bg-fail-soft text-fail",
};

export function HttpStatus({ statusCode }: { statusCode: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-xs font-medium",
        TONE_CLASSES[httpTone(statusCode)],
      )}
    >
      {statusCode === null ? "No response" : `HTTP ${statusCode}`}
    </span>
  );
}
