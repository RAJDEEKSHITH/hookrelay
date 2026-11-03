import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { register } from "@/apis/auth.api";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/store/auth-store";

export function RegisterPage() {
  const setMe = useAuthStore((state) => state.setMe);
  const [tenantName, setTenantName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      // PublicRoute sees the authenticated status and redirects.
      setMe(await register({ tenantName, name, email, password }));
    } catch {
      // The API client has already shown the error.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your workspace"
      description="You become the owner and can invite up to two teammates."
      footer={
        <span>
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-foreground underline underline-offset-4"
          >
            Log in
          </Link>
        </span>
      }
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="tenantName">Workspace name</Label>
          <Input
            id="tenantName"
            required
            maxLength={128}
            value={tenantName}
            onChange={(event) => setTenantName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            maxLength={128}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner />}
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
