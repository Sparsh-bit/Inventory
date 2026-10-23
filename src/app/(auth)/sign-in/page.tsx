import type { Metadata } from "next";
import { safePath } from "@/lib/safe-path";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const safeNext = safePath(next) ?? "/dashboard";
  return <SignInForm next={safeNext} />;
}
