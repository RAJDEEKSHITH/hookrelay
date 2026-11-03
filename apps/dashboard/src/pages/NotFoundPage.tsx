import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page does not exist.</p>
      <Button nativeButton={false} render={<Link to="/" />}>
        Back to Hookrelay
      </Button>
    </div>
  );
}
