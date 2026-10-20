import { Redirect, useLocalSearchParams } from "expo-router";

/** One catalog/filter path; no raw review-text search or unrelated alternatives. */
export default function Search() {
  const params = useLocalSearchParams<{ search?: string; q?: string }>();
  return <Redirect href={{ pathname: "/(tabs)/map", params: { view: "list", search: params.search ?? params.q ?? "" } }} />;
}
