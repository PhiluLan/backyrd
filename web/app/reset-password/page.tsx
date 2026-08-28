import { Suspense } from "react";
import { AuthForm } from "@/components/consumer/auth-form";
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthForm mode="reset" />
    </Suspense>
  );
}
