import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return <SignInForm next={safeNext} />;
}
