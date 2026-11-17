"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPassword, type AuthFormState } from "../../actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="password">Kata sandi baru</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Ulangi kata sandi</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-10" />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan dan masuk"}
      </Button>
    </form>
  );
}
