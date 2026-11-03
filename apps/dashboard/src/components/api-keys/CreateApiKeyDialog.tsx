import type { ApiKeyDto } from "@hookrelay/shared";
import { useState, type FormEvent } from "react";
import { createApiKey } from "@/apis/api-keys.api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (apiKey: ApiKeyDto) => void;
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateApiKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
          <DialogDescription>
            Your backend sends events with it. Name it after where it will be
            used.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the name starts empty every time. */}
        <CreateApiKeyForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function CreateApiKeyForm({
  onCreated,
}: Pick<CreateApiKeyDialogProps, "onCreated">) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      onCreated(await createApiKey(name));
    } catch {
      // The API client has already shown the error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="api-key-name">Name</Label>
        <Input
          id="api-key-name"
          required
          maxLength={128}
          placeholder="Production backend"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}
