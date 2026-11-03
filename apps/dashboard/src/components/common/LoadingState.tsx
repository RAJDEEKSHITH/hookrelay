import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <div
      className={
        fullPage
          ? "flex min-h-svh items-center justify-center"
          : "flex justify-center py-12"
      }
    >
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
