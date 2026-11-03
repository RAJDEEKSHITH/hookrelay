import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

interface SecretOnceDialogProps {
  /** null = closed. */
  secret: string | null;
  title: string;
  description: string;
  onClose: () => void;
}

/** Shows a secret (signing secret, API key, invitation link) that the API returns only once. */
export function SecretOnceDialog({
  secret,
  title,
  description,
  onClose,
}: SecretOnceDialogProps) {
  // Keeps showing the last secret while the dialog animates closed (secret is already null by then).
  const [shown, setShown] = useState(secret);
  if (secret !== null && secret !== shown) setShown(secret);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.add({ title: "Copied to the clipboard" });
    } catch {
      toast.add({
        title: "Could not copy",
        description: "Select the text and copy it manually.",
      });
    }
  }

  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description} It will not be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all select-all">
            {shown}
          </code>
          {shown !== null && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy"
              onClick={() => void copy(shown)}
            >
              <CopyIcon />
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I have copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
