import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNuknukUnderstandingRequest} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {LUNA_LIBRARIAN_ACTIVE_MODEL_SCHEMA,buildLunaLibrarianModelRequest} from '../../../packages/decision-vnext-core/dist/product-luna-librarian.js';
import {explicitPreferenceEvidence} from '../../../packages/decision-vnext-core/dist/product-luna-preference-evidence.js';
import {contentHash} from '../../../packages/decision-vnext-core/dist/canonical.js';
const reference={now:'2026-11-12T09:00:00Z',timezone:'Europe/Zurich'};
for(const query of ['Zum Bouldern einen Umkleideraum, Duschen wären nett.','Bouldern mit einem Getränk dort, Essen ist nur ein Bonus.'])test('V6 can express faithfully soft language not in Luna marker list: '+query,()=>{
 assert.equal(explicitPreferenceEvidence(query).length,0);
 const luna=buildLunaLibrarianModelRequest({sourceText:query,reference});
 const v6=buildNuknukUnderstandingRequest({query,reference,instructionProfile:'SPOT_GROUNDED_V6'});
 assert.equal(contentHash(v6.outputSchema.$defs),contentHash(LUNA_LIBRARIAN_ACTIVE_MODEL_SCHEMA.$defs));
 assert.notEqual(contentHash(luna.text.format.schema),contentHash(LUNA_LIBRARIAN_ACTIVE_MODEL_SCHEMA));
 const v5=buildNuknukUnderstandingRequest({query,reference,instructionProfile:'SPOT_GROUNDED_V5'});
 assert.equal(contentHash(v5.outputSchema.$defs),contentHash(luna.text.format.schema.$defs));
});
