import { Suspense } from "react";
import { AuthForm } from "@/components/consumer/auth-form";
export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
