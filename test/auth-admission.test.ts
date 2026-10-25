import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardAuthentication} from '../src/http.js';

test('anonymous authentication is admitted before provider work',async()=>{let calls=0;const limiter={async limit(){calls++;return {success:false};}};await assert.rejects(guardAuthentication(new Request('https://palim.example/oauth/register',{method:'POST',body:'{}'}),limiter),/Too many authentication/);assert.equal(calls,1);});
test('auth body limit applies without a declared content length',async()=>{const limiter={async limit(){return {success:true};}};await assert.rejects(guardAuthentication(new Request('https://palim.example/authorize',{method:'POST',body:'x'.repeat(32769)}),limiter),/size/);});
test('ordinary public assets do not consume the authentication limiter',async()=>{const request=new Request('https://palim.example/');let calls=0;const limiter={async limit(){calls++;return {success:false};}};assert.equal(await guardAuthentication(request,limiter),request);assert.equal(calls,0);});
