import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD_VALUE_LABELS,CUISINES,FOOD_SPECIALITIES,ATMOSPHERE_VALUES,OFFERING_GROUPS,WORLD_OFFER_CONCEPTS,librarianConcept,sameLibrarianText} from '../dist/index.js';
test('all typed cuisine, dish and atmosphere values have a shared authoring label',()=>{for(const token of [...CUISINES,...FOOD_SPECIALITIES,...ATMOSPHERE_VALUES])assert.equal(typeof WORLD_VALUE_LABELS[token],'string',token);});
test('common concepts retain their meaning and unknown prose stays unknown',()=>{assert.equal(librarianConcept('etwas trinken gehen'),'drinks');assert.ok(sameLibrarianText('RELAXED','entspannt'));assert.equal(sameLibrarianText('ruhig','entspannt'),false);assert.equal(librarianConcept('ganz neue Sache mit Freunden'),null);});
test('typed drink groups do not imply meals or bars',()=>{for(const token of ['BEER','WINE','COFFEE']){assert.ok(OFFERING_GROUPS.includes(token));assert.ok(WORLD_OFFER_CONCEPTS[token].includes('drinks'));assert.equal(WORLD_OFFER_CONCEPTS[token].includes('meal'),false);assert.equal(WORLD_OFFER_CONCEPTS[token].includes('bar'),false);}});

test('typed tokens and their readable labels are the same values, not neighbouring meanings',()=>{assert.ok(sameLibrarianText('ITALIAN','Italienisch'));assert.ok(sameLibrarianText('SEAFOOD','Meeresfrüchte'));assert.ok(sameLibrarianText('WINE','Wein'));assert.equal(sameLibrarianText('WINE','Bier'),false);assert.equal(sameLibrarianText('COFFEE','Wein'),false);});
