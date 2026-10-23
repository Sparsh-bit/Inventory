import type { Metadata } from "next";
import { safePath } from "@/lib/safe-path";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return <SignUpForm next={safePath(next) ?? "/onboarding"} />;
}
