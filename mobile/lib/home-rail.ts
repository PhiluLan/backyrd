import { backyrdTheme as theme } from "../theme/backyrd";

export const HOME_RAIL = {
  horizontalInset: theme.spacing.xl,
  gap: theme.spacing.md,
  nextCardPeek: 42,
  decelerationRate: "fast" as const,
  disableIntervalMomentum: true,
};

export const HOME_SECONDARY_CARD_HEIGHT = 234;
export function homeSecondaryCardWidth(viewportWidth: number) {
  return homeRailCardWidth(viewportWidth, { minimum: 220, maximum: 272 });
}

export function homeRailCardWidth(
  viewportWidth: number,
  { minimum, maximum }: { minimum: number; maximum: number },
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      viewportWidth - HOME_RAIL.horizontalInset * 2 - HOME_RAIL.nextCardPeek,
    ),
  );
}
