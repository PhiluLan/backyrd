import type { SpotCardDTO } from "./spot";

export type HomeSectionKey =
  | "for_you"
  | "your_city"
  | "based_on_favorites"
  | "trending";

export type HomeSectionDTO = {
  key: HomeSectionKey;
  title: string;
  subtitle: string;
  items: SpotCardDTO[];
};

export type HomeSectionsDTO = {
  source: "personalized" | "discovery_overview";
  sections: HomeSectionDTO[];

  for_you: SpotCardDTO[];
  your_city: SpotCardDTO[];
  based_on_favorites: SpotCardDTO[];
  trending: SpotCardDTO[];
};