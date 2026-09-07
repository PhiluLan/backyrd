export type SpotPhotoPolicy = Readonly<{
  googlePlacePhotosEnabled: boolean;
}>;

/**
 * Canonical Mobile Spot-photo policy.
 *
 * Google Place Photos stay implemented but are disabled for the Founder/Basel
 * test phase. Re-enable them only through a reviewed change to this single
 * value after the deferred cost, attribution, cache, and budget review.
 */
export const SPOT_PHOTO_POLICY: SpotPhotoPolicy = Object.freeze({
  googlePlacePhotosEnabled: false,
});

