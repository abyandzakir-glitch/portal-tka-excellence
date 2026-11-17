import type { Metadata } from "next";
import { Suspense } from "react";
import { MasterLogo } from "@/components/brand/logo";
import { TAGLINE } from "@/lib/brand/schools";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <MasterLogo height={48} priority className="-m-4" />
        <p className="text-sm text-brand-gray-light lg:hidden">{TAGLINE}</p>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Masuk ke Portal</h1>
        <p className="text-sm text-brand-gray-light">
          Gunakan akun yang diberikan oleh Super Admin yayasan.
        </p>
      </div>
      <Suspense fallback={<LoginForm next={undefined} />}>
        <LoginFormWithNext searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginFormWithNext({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
