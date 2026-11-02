import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/consumer/verify-email-form";
export default function VerifyPage() {
  return <Suspense fallback={<p role="status">Bestätigung wird vorbereitet …</p>}><VerifyEmailForm /></Suspense>;
}
