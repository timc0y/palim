import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Env } from '../src/types.js';
import type { EmailPayload } from '../src/mail.js';
import { Palim } from '../src/service.js';
import { sha256 } from '../src/xml.js';

export const NOW=Date.parse('2026-10-25T12:00:00Z')/1000;
/** Real SQLite exercises the same SQL; only the asynchronous D1 transport is adapted. */
export function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
  const prepare=(query:string)=>{
    let values:(string|number|null|Uint8Array)[]=[];
    const run=()=>{const r=sql.prepare(query).run(...values);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};};
    const statement={bind(...args:(string|number|null|Uint8Array)[]){values=args;return statement;},async first<T>(){return (sql.prepare(query).get(...values)??null) as T|null;},async all<T>(){return {success:true,results:sql.prepare(query).all(...values) as T[],meta:{changes:0}};},async run(){return run();},_run:run};return statement;
  };
  const adapter={prepare,async batch(statements:ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const results=statements.map(s=>s._run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  // The tests implement only the D1 operations used by Palim, backed by actual SQLite.
  return {sql,db:adapter as unknown as D1Database};
}
export async function fixture(){
  const {sql,db}=database();const objects=new Map<string,Uint8Array>();const sent:EmailPayload[]=[];let time=NOW;
  const bucket={async put(key:string,value:Uint8Array|string){objects.set(key,typeof value==='string'?new TextEncoder().encode(value):value.slice());return {};},async get(key:string){const bytes=objects.get(key);if(!bytes)return null;return {size:bytes.length,body:new Blob([new Uint8Array(bytes).buffer]).stream(),async arrayBuffer(){return bytes.slice().buffer;}};},async delete(keys:string|string[]){for(const key of typeof keys==='string'?[keys]:keys)objects.delete(key);}};
  // These are explicit test doubles for external storage and email, never production feature flags.
  const env={DB:db,BOOKS:bucket as unknown as R2Bucket,ORIGIN:'https://palim.example',SENDER:'reading@palim.example',SIGNING_SECRET:'synthetic-test-signing-key-not-a-real-credential-2026',FILE_ORIGINS:'https://files.example',EMAIL:{async send(payload:EmailPayload){sent.push(payload);return {messageId:`message-${sent.length}`};}}} as Env;
  const palim=new Palim(env,()=>time);await palim.store.upsertUser('alice','Alice');await palim.store.upsertUser('bob','Bob');
  sql.prepare('UPDATE users SET destination=?,destination_version=? WHERE id=?').run('alice@kindle.com','version-a','alice');
  sql.prepare('UPDATE users SET destination=?,destination_version=? WHERE id=?').run('bob@kindle.com','version-b','bob');
  return {sql,env,palim,objects,sent,setTime(n:number){time=n;},async session(owner='alice'){const token='a'.repeat(64);sql.prepare('INSERT OR REPLACE INTO sessions(hash,owner,expires_at) VALUES(?,?,?)').run(await sha256(token),owner,Math.floor(Date.now()/1000)+3600);return `__Host-palim=${token}`;}};
}
export const simpleBook={title:'A useful guide',creator:'The author',language:'en',chapters:[{title:'One thing',markdown:'A useful explanation with **emphasis** and a concrete example.'}]};
export const pdf=()=>new TextEncoder().encode('%PDF-1.7\n% Synthetic forwarding fixture\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
