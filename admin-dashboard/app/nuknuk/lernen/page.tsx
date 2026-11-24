import LearningWorkshop from "./Workshop";

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ feedback?: string }>;
}) {
  const params = await searchParams;
  const feedback =
    typeof params.feedback === "string" &&
    /^[a-f0-9-]{36}$/.test(params.feedback)
      ? params.feedback
      : null;
  return <LearningWorkshop initialFeedback={feedback} />;
}
