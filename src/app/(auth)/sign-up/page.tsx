import type { Metadata } from "next";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return <SignUpForm next={typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/onboarding"} />;
}
