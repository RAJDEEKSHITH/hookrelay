import { Link } from "react-router-dom";
import { RelayMark } from "@/components/common/RelayMark";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
      <RelayMark className="size-8" />
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page does not exist. Check the address, or go back to the
          dashboard.
        </p>
      </div>
      <Button nativeButton={false} render={<Link to="/" />}>
        Back to Hookrelay
      </Button>
    </main>
  );
}
