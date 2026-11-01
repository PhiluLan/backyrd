import SeasonalEditor from "../SeasonalEditor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SeasonalEditor id={id} />;
}
