import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store';
import { CircleAttestations, CctpStore, createCctpRoute } from './cctp';
import { testCctpIntent as intent, testCctpMessage } from '../../../packages/sdk/src/cctp.fixtures';
import { parseCctpMessage } from '@mandate/sdk';
const owner = intent.fundingOwner;
test('CCTP idempotency, restart recovery, owner isolation and concurrent CAS', async () => {
  const dir=mkdtempSync(join(tmpdir(),'cctp-')), path=join(dir,'gateway.sqlite');
  let store=new Store(path);
  try {
    let cctp=new CctpStore(store);
    const initial=await cctp.create(owner,intent,1);
    expect((await cctp.create(owner,intent,2)).id).toBe(initial.id);
    await expect(cctp.create(owner,{...intent,amount:'2000000'},2)).rejects.toThrow('Idempotency');
    expect(await cctp.get(initial.id,intent.recipient)).toBeNull();
    const source={transactionHash:`0x${'ab'.repeat(32)}` as const,userOpHash:`0x${'cd'.repeat(32)}` as const,blockNumber:'20',message:testCctpMessage(),fingerprint:parseCctpMessage(testCctpMessage(),intent).fingerprint};
    await cctp.save(initial,{source,status:'attestation_pending'},3);
    await expect(cctp.save(initial,{status:'approved'},4)).rejects.toThrow('Operation changed');
    store.close(); store=new Store(path); cctp=new CctpStore(store);
    const resumed=await cctp.get(initial.id,owner);
    expect(resumed?.source).toEqual(source);
    expect(resumed?.delivery).toBe('not_recorded');
    const fakeFetch=(async () => Response.json({messages:[{status:'complete',message:testCctpMessage(true),attestation:`0x${'ab'.repeat(65)}`}]})) as unknown as typeof fetch;
    const attestation=await new CircleAttestations(fakeFetch).get(resumed!);
    expect(attestation?.message).toBe(testCctpMessage(true));
    const wrongFetch=(async () => Response.json({messages:[{status:'complete',message:'0x1234',attestation:'0x42'}]})) as unknown as typeof fetch;
    expect(await new CircleAttestations(wrongFetch).get(resumed!)).toBeNull();
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
test('crosschain configuration never pretends a deployment exists, protected operations need auth',async()=>{
  const s=new Store(':memory:');
  try {
    const route=createCctpRoute({store:s,audience:'http://localhost'});
    expect(await (await route(new Request('http://localhost/crosschain/config')))!.json()).toMatchObject({configured:false,chainId:5042002});
    expect((await route(new Request('http://localhost/crosschain')))!.status).toBe(401);
  } finally {s.close();}
});

test('owner lifecycle persists ambiguous source, rejects changed hash, and keeps delivery separate', async () => {
  const { createHash } = await import('node:crypto');
  const s = new Store(':memory:');
  const token = 'ab'.repeat(32), hash = `0x${'cd'.repeat(32)}` as const;
  const prepared: import('./chain').Prepared = { tokenId:'1',epoch:'0',actionHash:hash,entryPoint:owner,validator:owner,op:{sender:intent.account,nonce:'0',initCode:'0x',callData:'0x',accountGasLimits:hash,preVerificationGas:'100000',gasFees:hash,paymasterAndData:'0x',signature:'0x'} };
  let included = false, preparations = 0;
  const chain: import('./arc-chain').ArcChain = {
    async ownership(){return {owner,tokenId:'1',epoch:'0'};},
    async prepare(){preparations++;return prepared;},
    async verifyApproval(){return true;},
    async sourceReceipt(){if(!included) throw new Error('RPC not yet included');return {transactionHash:hash,userOpHash:hash,blockNumber:'1',message:testCctpMessage(),fingerprint:parseCctpMessage(testCctpMessage(),intent).fingerprint};},
    async destinationReceipt(){return {transactionHash:hash,blockNumber:'2',nonce:hash,merchantAmount:'999500'};},
  };
  const fakeFetch=(async () => Response.json({messages:[{status:'complete',message:testCctpMessage(true),attestation:`0x${'ab'.repeat(65)}`}]})) as unknown as typeof fetch;
  const route=createCctpRoute({store:s,chain,audience:'http://localhost',now:()=>10,circle:new CircleAttestations(fakeFetch)});
  const call=async(path:string,body?:unknown,origin='http://localhost')=>(await route(new Request(`http://localhost/crosschain${path}`,{method:body===undefined?'GET':'POST',headers:{cookie:`mandate_session=${token}`,'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body)})))!;
  try {
    await s.createSession(createHash('sha256').update(token).digest('hex'),owner,100);
    expect((await call('',{intent},'http://evil.example')).status).toBe(403);
    const op=await (await call('',{intent})).json();
    expect((await call(`/${op.id}/source`,{transactionHash:hash})).status).toBe(409);
    await call(`/${op.id}/prepare`,{}); await call(`/${op.id}/prepare`,{});
    expect(preparations).toBe(1);
    await call(`/${op.id}/approve`,{signature:'0x1234'});
    expect((await call(`/${op.id}/source`,{transactionHash:hash})).status).toBe(409);
    const pending=await (await call(`/${op.id}`)).json();
    expect(pending.sourceTransactionHash).toBe(hash);
    expect((await call(`/${op.id}/source`,{transactionHash:`0x${'ef'.repeat(32)}`})).status).toBe(409);
    included=true;
    expect((await (await call(`/${op.id}/source`,{transactionHash:hash})).json()).status).toBe('attestation_pending');
    expect((await (await call(`/${op.id}/attestation`,{})).json()).mint.chainId).toBe(11155111);
    const settled=await (await call(`/${op.id}/destination`,{transactionHash:hash})).json();
    expect(settled.status).toBe('settled'); expect(settled.delivery).toBe('not_recorded');
    expect((await (await call(`/${op.id}/destination`,{transactionHash:hash})).json()).revision).toBe(settled.revision);
  } finally {s.close();}
});

test('agent interface requires explicit Arc scope, redacts signing payloads and isolates connections', async()=>{
  const s=new Store(':memory:'); let agentId='agent-1';
  const chain={async ownership(){return {owner,tokenId:'1',epoch:'0'};}} as unknown as import('./arc-chain').ArcChain;
  try {
    const disabled=createCctpRoute({store:s,chain,audience:'http://localhost'});
    expect((await disabled(new Request('http://localhost/agent/crosschain')))!.status).toBe(503);
    const route=createCctpRoute({store:s,chain,audience:'http://localhost',authenticateAgent:async()=>({id:agentId,account:intent.account,owner})});
    const res=await route(new Request('http://localhost/agent/crosschain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intent})}));
    const op=await res!.json(); expect(res!.status).toBe(201);
    const db=new CctpStore(s),stored=await db.get(op.id,owner);
    await db.save(stored!,{signature:'0x1234'},20);
    const read=await (await route(new Request(`http://localhost/agent/crosschain/${op.id}`)))!.json();
    expect(read.signature).toBeUndefined(); expect(read.prepared).toBeUndefined();
    agentId='agent-2';
    expect((await route(new Request(`http://localhost/agent/crosschain/${op.id}`)))!.status).toBe(404);
  } finally {s.close();}
});
