import { Suspense } from "react";
import { ReviewForm } from "@/components/consumer/review-form";
export default function NewReviewPage() {
  return (
    <Suspense>
      <ReviewForm />
    </Suspense>
  );
}
