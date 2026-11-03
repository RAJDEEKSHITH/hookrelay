import { cn } from "@/lib/utils";

/** Two nodes and the hop between them: the product's one piece of brand drawing. */
export function RelayMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <circle cx="7.5" cy="15.5" r="2.5" fill="white" />
      <circle cx="16.5" cy="8.5" r="2.5" fill="white" fillOpacity="0.75" />
      <path
        d="M9.5 14 14.5 10"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
