import {
  prepareReviewMediaAsset,
  type ReviewMediaAsset,
  type ReviewMediaError,
} from "./review-media-upload";

export type ReviewMediaValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "ready"; assets: ReviewMediaAsset[] }
  | { status: "failed"; error: ReviewMediaError | Error };

type Prepare = (asset: ReviewMediaAsset) => Promise<ReviewMediaAsset>;

export class ReviewMediaValidationCoordinator {
  private generation = 0;

  constructor(private readonly prepare: Prepare = prepareReviewMediaAsset) {}

  cancel(onState?: (state: ReviewMediaValidationState) => void) {
    this.generation += 1;
    onState?.({ status: "idle" });
  }

  async validate(
    assets: ReviewMediaAsset[],
    onState: (state: ReviewMediaValidationState) => void,
  ) {
    const generation = ++this.generation;
    if (!assets.length) {
      onState({ status: "idle" });
      return null;
    }
    onState({ status: "validating" });
    try {
      const prepared = await Promise.all(assets.map(this.prepare));
      if (generation !== this.generation) return null;
      onState({ status: "ready", assets: prepared });
      return prepared;
    } catch (error) {
      if (generation !== this.generation) return null;
      const safeError = error instanceof Error ? error : new Error("IMAGE_PREPARATION_FAILED");
      onState({ status: "failed", error: safeError });
      return null;
    }
  }
}
