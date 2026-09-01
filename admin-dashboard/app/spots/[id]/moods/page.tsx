import { redirect } from "next/navigation";

export default function LegacySpotMoodsRedirect() {
  redirect("/moods");
}
