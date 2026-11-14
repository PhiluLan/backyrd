// Synthetic venue identity is independent of evidence state and desired fit.
// Keep the same identities across a scenario's counterfactual evidence worlds.
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
import {binding} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';

export function opaqueIdentity(namespace,identityKey){
 const hash=contentHash({purpose:'assessment-identity@1',namespace,identityKey});
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export function bindAssessmentCandidate(namespace,identityKey,profile,extras=[]){
 // binding's integer is only a fixture construction detail. Never export its
 // sequential integer UUID as a label-correlated model input.
 const candidate=binding(1,profile,extras);
 candidate.decisionProjection.spotId=opaqueIdentity(namespace,identityKey);
 candidate.manifestHash=contentHash({namespace,identityKey,profile,extras});
 return candidate;
}
export function identityKeys(namespace,variant){
 const flip=parseInt(contentHash({purpose:'identity-assignment@1',namespace,variant}).slice(0,2),16)%2;
 return flip?['venue-b','venue-a']:['venue-a','venue-b'];
}
