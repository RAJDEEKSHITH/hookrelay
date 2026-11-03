import type { ReactNode } from "react";
import { RelayMark } from "@/components/common/RelayMark";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** The centred card shared by the login, register and accept-invite pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    // min-h-svh with the content centred: the page still scrolls normally when the form is taller than the screen.
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <RelayMark className="size-7" />
        <span className="text-lg font-semibold tracking-tight">Hookrelay</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && (
          <CardFooter className="justify-center border-t text-sm text-muted-foreground">
            {footer}
          </CardFooter>
        )}
      </Card>
    </main>
  );
}
