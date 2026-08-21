# Production Reason Authorization

Version: `backyrd-reason-authorization-v1`.

Every frozen candidate receives its own bounded reason set:

- `WHY_NOW`: explicit place type or current-intent concept matched by candidate N4.
- `WHY_FOR_YOU`: a positive projected N5 node matched by the same candidate's N4. It is prohibited in `LOW_OR_UNKNOWN`.
- `UNCERTAINTY`: missing/partial N4 or insufficient personal knowledge.

Each reason carries the relevant Moment, projection, N4, and node identities and is independently hashed. The response validator accepts only exact candidate-specific authorized copy. Negative projected concepts may reduce bounded personal fit but never become a misleading positive explanation. No reason claims certainty or predicts that the user will love a place.

These sets are the future N6 vocabulary boundary: a later model may select an authorized reason but may not invent one.
