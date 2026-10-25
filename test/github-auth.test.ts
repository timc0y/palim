import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authRoute} from '../src/auth.js';
import {fixture} from './helpers.js';

test('official GitHub OAuth adapter completes identity-only sign-in without retaining the provider token',async t=>{
  const f=await fixture();f.env.GITHUB_CLIENT_ID='synthetic-client';f.env.GITHUB_CLIENT_SECRET='synthetic-secret';
  const calls:{url:string;init:RequestInit|undefined}[]=[];
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);calls.push({url,init});
    if(url==='https://github.com/login/oauth/access_token'){
      assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.ok(init?.signal);
      assert.match(String(init?.body),/synthetic-client/);assert.match(String(init?.body),/synthetic-code/);
      return Response.json({access_token:'synthetic-provider-token',token_type:'bearer',scope:''});
    }
    assert.equal(url,'https://api.github.com/user');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-provider-token');
    return Response.json({id:123456,login:'synthetic-reader'});
  });
  const begin=await authRoute(new Request('https://palim.example/auth/login?returnTo=%2Fapp'),f.env);assert.equal(begin?.status,302);
  const providerUrl=new URL(begin!.headers.get('Location')!);assert.equal(providerUrl.origin,'https://github.com');assert.equal(providerUrl.pathname,'/login/oauth/authorize');
  assert.ok(!providerUrl.searchParams.get('scope'));const state=providerUrl.searchParams.get('state')!;assert.match(state,/^[a-f0-9]{64}$/);
  const cookie=begin!.headers.get('Set-Cookie')!.split(';')[0]!;
  const callback=await authRoute(new Request(`https://palim.example/auth/callback?code=synthetic-code&state=${state}`,{headers:{Cookie:cookie}}),f.env);
  assert.equal(callback?.status,302);assert.equal(callback?.headers.get('Location'),'/app');assert.equal(calls.length,2);
  assert.equal((await f.palim.store.user('123456')).name,'synthetic-reader');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM sessions').get()?.n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM login_states').get()?.n,0);
  assert.doesNotMatch(JSON.stringify(f.sql.prepare('SELECT * FROM sessions').all()),/synthetic-provider-token/);
  await assert.rejects(authRoute(new Request(`https://palim.example/auth/callback?code=synthetic-code&state=${state}`,{headers:{Cookie:cookie}}),f.env),/already been used/);
  assert.equal(calls.length,2);
});

test('mismatched GitHub state never reaches the provider',async t=>{
  const f=await fixture();f.env.GITHUB_CLIENT_ID='synthetic-client';f.env.GITHUB_CLIENT_SECRET='synthetic-secret';let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('must not call');});
  await assert.rejects(authRoute(new Request(`https://palim.example/auth/callback?code=not-real&state=${'a'.repeat(64)}`,{headers:{Cookie:`__Host-palim-login=${'b'.repeat(64)}`}}),f.env),/does not belong/);
  assert.equal(calls,0);
});
