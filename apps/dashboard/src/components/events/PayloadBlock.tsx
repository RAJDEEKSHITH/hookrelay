import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Payloads up to this many lines are shown whole; longer ones start as a preview of the first PREVIEW_LINES.
const COLLAPSE_ABOVE_LINES = 16;
const PREVIEW_LINES = 12;

/**
 * Pretty-printed JSON that grows the page instead of scrolling inside a box: long lines wrap, long payloads start
 * collapsed and expand inline.
 */
export function PayloadBlock({
  payload,
}: {
  payload: Record<string, unknown> | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const json = JSON.stringify(payload ?? {}, null, 2);
  const lines = json.split("\n");
  const collapsible = lines.length > COLLAPSE_ABOVE_LINES;
  const collapsed = collapsible && !expanded;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <pre
          id={contentId}
          className="rounded-lg bg-muted p-4 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {collapsed ? lines.slice(0, PREVIEW_LINES).join("\n") : json}
        </pre>
        {collapsed && (
          // Signals that the preview continues; purely visual, the button below says so in words.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-linear-to-t from-muted to-transparent"
          />
        )}
      </div>
      {collapsible && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDownIcon
            className={cn("transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </Button>
      )}
    </div>
  );
}
