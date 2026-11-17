import type { Metadata } from "next";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Atur Kata Sandi" };

export default function SetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Atur kata sandi</h1>
        <p className="text-sm text-brand-gray-light">
          Buat kata sandi untuk akun Portal Academic Excellence Anda (minimal 10 karakter).
        </p>
      </div>
      <SetPasswordForm />
    </div>
  );
}
