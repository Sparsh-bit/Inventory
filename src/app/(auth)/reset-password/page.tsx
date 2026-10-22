import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : null} invalid={error === "INVALID_TOKEN"} />;
}
