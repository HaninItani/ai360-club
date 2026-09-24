import test from 'node:test';import assert from 'node:assert/strict';
import {sign,verify,hashCode} from '../lib/server.js';
process.env.SESSION_SECRET='test-secret-for-session-boundaries';
test('signed sessions expire and reject modification',()=>{const token=sign({id:'student-1',role:'student'});assert.equal(verify(token).id,'student-1');const [body,sig]=token.split('.');assert.equal(verify(body+'.'+sig.slice(0,-1)+'A'),null);assert.equal(verify(''),null);assert.equal(verify('bad.token'),null)});
test('codes normalize case and never store the raw code',()=>{assert.equal(hashCode(' abcd '),hashCode('ABCD'));assert.notEqual(hashCode('ABCD'),'ABCD');assert.notEqual(hashCode('ABCD'),hashCode('ABCE'))});
