"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type AuthFormState } from "../actions";

export function LoginForm({ next }: { next: string | undefined }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@talentajuara.sch.id" className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Kata sandi</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
      <p className="text-center text-xs text-brand-gray-light">
        Lupa kata sandi? Hubungi Super Admin yayasan untuk mengatur ulang.
      </p>
    </form>
  );
}
