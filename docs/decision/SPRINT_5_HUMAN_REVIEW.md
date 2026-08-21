# Sprint 5 Shadow Human Review

## Eight representative decisions

| Case | Knowledge | Deterministic vs Shadow | Authorized knowledge used | Review result |
|---|---|---|---|---|
| Cold Friends | LOW/UNKNOWN | order differed | WHY_NOW place type; LOW-user uncertainty | valid; no WHY_FOR_YOU |
| Known Friends | PARTIAL | same Top-1 | contextual lively preference only on matching lively candidate | valid |
| Same user, Date | PARTIAL | same Top-1 | date/romantic preference only on matching candidate | valid; Friends reason did not leak |
| Quiet conflict | LOW/UNKNOWN after suppression | same Top-1 | explicit quiet/conversation intent | valid; historical lively reason absent |
| Broad unknown | LOW/UNKNOWN | order differed | current place-type fit and uncertainty | valid; no profile dump |
| Copenhagen | LOW/UNKNOWN | same Top-1 | current cozy request | valid; no Basel identity/history |
| Partial N4 | LOW/UNKNOWN | order differed | safe place-type fit plus uncertainty | valid; UNKNOWN was not treated as bad |
| Strong opportunity | PARTIAL | same Top-1 | cozy current intent; personal lively reason only for its candidate | valid |

## Human conclusion

The authorization boundary is understandable and conservative: N6 can reorder safe candidates, but its explanations cannot outrun what Sprint 4 already proved. LOW users remain non-personalized, Current Intent wins, and uncertainty stays visible in the structured record.

The live provider compatibility proof is incomplete. Therefore this pack is suitable for reviewing safety/integration behavior, but not yet sufficient to authorize N6 output for internal users or a beta.
