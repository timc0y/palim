import { GitHub } from 'arctic';
import { z } from 'zod';
import { PalimError, invariant } from './errors.js';
import { cookie, checkOrigin, equalToken } from './http.js';
import { escapeXml as e, randomToken, sha256 } from './xml.js';
import { Store } from './store.js';
import type { Env } from './types.js';
const SESSION='__Host-palim';
const STATE='__Host-palim-login';
const sessionCookie=(name:string,value:string,seconds:number)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
function github(env:Env){if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET)throw new PalimError('CONFIGURATION','The operator must configure GitHub sign-in.',503);return new GitHub(env.GITHUB_CLIENT_ID,env.GITHUB_CLIENT_SECRET,`${env.ORIGIN}/auth/callback`);}
function returnPath(value:string|null):string {return value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')&&value.length<4000?value:'/app';}
export async function session(request:Request,env:Env):Promise<string|null>{
  const value=cookie(request,SESSION);if(!value||!/^[a-f0-9]{64}$/.test(value))return null;
  const row=await env.DB.prepare('SELECT s.owner FROM sessions s JOIN users u ON u.id=s.owner WHERE s.hash=? AND s.expires_at>? AND u.disabled=0').bind(await sha256(value),Math.floor(Date.now()/1000)).first<{owner:string}>();return row?.owner??null;
}
export async function requireSession(request:Request,env:Env):Promise<string>{const owner=await session(request,env);if(!owner)throw new PalimError('SIGN_IN_REQUIRED','Sign in to Palim to continue.',401);return owner;}
export async function authRoute(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),now=Math.floor(Date.now()/1000);
  if(url.pathname==='/auth/login'&&request.method==='GET'){
    const state=randomToken();const client=github(env);const redirect=client.createAuthorizationURL(state,[]);
    await env.DB.prepare('INSERT INTO login_states(hash,return_to,expires_at) VALUES(?,?,?)').bind(await sha256(state),returnPath(url.searchParams.get('returnTo')),now+600).run();
    return new Response(null,{status:302,headers:{Location:redirect.href,'Set-Cookie':sessionCookie(STATE,state,600),'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/auth/callback'&&request.method==='GET'){
    const state=url.searchParams.get('state')??'',bound=cookie(request,STATE)??'',code=url.searchParams.get('code');
    invariant(code&&/^[a-f0-9]{64}$/.test(state)&&equalToken(state,bound),'LOGIN_STATE','Sign-in expired or does not belong to this browser. Start again.');
    const pending=await env.DB.prepare('DELETE FROM login_states WHERE hash=? AND expires_at>? RETURNING return_to').bind(await sha256(state),now).first<{return_to:string}>();
    invariant(pending,'LOGIN_STATE','This sign-in attempt expired or has already been used.');
    const tokens=await github(env).validateAuthorizationCode(code);
    const response=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${tokens.accessToken()}`,Accept:'application/vnd.github+json','User-Agent':'Palim'},signal:AbortSignal.timeout(10000)});
    invariant(response.ok,'LOGIN_PROVIDER','GitHub could not confirm your identity.');
    const identity=z.object({id:z.number().int().positive(),login:z.string().min(1).max(100)}).parse(await response.json());
    const owner=String(identity.id);await new Store(env.DB).upsertUser(owner,identity.login);
    const secret=randomToken();await env.DB.prepare('INSERT INTO sessions(hash,owner,expires_at) VALUES(?,?,?)').bind(await sha256(secret),owner,now+7*86400).run();
    const headers=new Headers({Location:returnPath(pending.return_to),'Cache-Control':'no-store'});headers.append('Set-Cookie',sessionCookie(SESSION,secret,7*86400));headers.append('Set-Cookie',sessionCookie(STATE,'',0));
    return new Response(null,{status:302,headers});
  }
  if(url.pathname==='/auth/logout'&&request.method==='POST'){
    checkOrigin(request,env.ORIGIN);const token=cookie(request,SESSION);if(token)await env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(await sha256(token)).run();
    return new Response(null,{status:303,headers:{Location:'/', 'Set-Cookie':sessionCookie(SESSION,'',0),'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/authorize'){
    const owner=await session(request,env);if(!owner)return new Response(null,{status:302,headers:{Location:`/auth/login?returnTo=${encodeURIComponent(url.pathname+url.search)}`,'Cache-Control':'no-store'}});
    if(request.method==='GET'){
      const auth=await env.OAUTH_PROVIDER.parseAuthRequest(request),details=await env.OAUTH_PROVIDER.describeConsent(auth),consent=await env.OAUTH_PROVIDER.beginConsent(auth);
      consent.headers.set('Content-Type','text/html; charset=utf-8');consent.headers.set('Cache-Control','no-store');
      const page=`<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Connect your agent · Palim</title><link rel="stylesheet" href="/style.css"/></head><body><main class="consent"><a class="wordmark" href="/">palim<span>.</span></a><p class="eyebrow">AGENT CONNECTION</p><h1>Let your agent<br/><em>turn the page.</em></h1><p><strong>${e(details.clientName)}</strong> requests access to Palim.</p><p>Redirect destination: <strong>${e(details.redirectHost)}</strong>. ${details.redirectIsLoopback?'This is a local application; another local process could be listening.':''}</p><p>The client name is supplied by the client. Verify the destination before continuing.</p><ul>${details.scope.map(s=>`<li>${e(s)}</li>`).join('')}</ul><p>Access can create and download your books, and send documents to your confirmed reader when you ask. It does not grant access to your Amazon account.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${e(consent.handle)}"/><button name="decision" value="allow">Connect agent</button><button class="secondary" name="decision" value="deny">Cancel</button></form></main></body></html>`;
      return new Response(page,{headers:consent.headers});
    }
    if(request.method==='POST'){
      checkOrigin(request,env.ORIGIN);const form=await request.formData();const handle=form.get('handle');invariant(typeof handle==='string'&&handle.length<1000,'CONSENT','Invalid consent request.');
      if(form.get('decision')!=='allow'){const denied=await env.OAUTH_PROVIDER.denyConsent(request,handle);return new Response(null,{status:302,headers:denied.headers});}
      const approved=await env.OAUTH_PROVIDER.approveConsent(request,handle);
      const {redirectTo}=await env.OAUTH_PROVIDER.completeAuthorization({request:approved.request,userId:owner,metadata:{},scope:approved.request.scope,props:{userId:owner}});
      approved.headers.set('Location',redirectTo);return new Response(null,{status:302,headers:approved.headers});
    }
  }
  return null;
}
