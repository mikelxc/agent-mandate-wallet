import {test,expect} from 'bun:test';
import {custom,decodeFunctionData,encodeFunctionResult,keccak256,toHex,zeroAddress,type Address,type Hex} from 'viem';
import {namehash} from 'viem/ens';
import {createIdentityResolver,identityRegistryAbi,agentRegistryAbi} from './identity-resolver';
import {ensV2HackathonDeployment} from '@mandate/sdk';
const owner='0x1111111111111111111111111111111111111111' as Address;
const user='0x2222222222222222222222222222222222222222' as Address;
const agents='0x3333333333333333333333333333333333333333' as Address;
const key='0x4444444444444444444444444444444444444444' as Address;
function fixture(){let chain='0xaa36a7',timestamp='0x3e8',resource=1n,expiry=9000n;const blocks:string[]=[];
 const transport=custom({request:async({method,params}:any)=>{
  if(method==='eth_chainId')return chain;
  if(method==='eth_getBlockByNumber')return {number:'0xa',timestamp,hash:`0x${'11'.repeat(32)}`,transactions:[]};
  if(method!=='eth_call')throw new Error('Unexpected RPC');
  blocks.push(params[1]);const address=params[0].to as string;const abi=address.toLowerCase()===agents.toLowerCase()?agentRegistryAbi:identityRegistryAbi;
  const call=decodeFunctionData({abi,data:params[0].data as Hex});
  const value:Record<string,unknown>={getOwner:owner,getExpiry:expiry,getTokenId:1n,getResource:resource,getResolver:zeroAddress,getSubregistry:address.toLowerCase()===ensV2HackathonDeployment.ethRegistry.toLowerCase()?user:agents,hasRoles:true,schemaVersion:1n,parentRegistry:user,parentId:BigInt(keccak256(toHex('desk'))),parentResource:1n,parentNode:namehash('desk.wayleave.eth'),controller:owner,getAgent:[key,1n,8000n,3]};
  return encodeFunctionResult({abi:abi as any,functionName:call.functionName,result:value[call.functionName] as any});
 }});
 return {resolver:createIdentityResolver('http://unused',()=>1000,transport),blocks,setChain:()=>chain='0x1',setStale:()=>timestamp='0x1',reregister:()=>resource=2n,expire:()=>expiry=999n};
}
test('resolves actual registry owners at a single block and verifies direct child namespace',async()=>{const s=fixture();const identity=await s.resolver.discover('Desk.wayleave.eth');expect(identity.name).toBe('desk.wayleave.eth');expect(identity.controller).toBe(owner);expect(identity.resolver).toBe(zeroAddress);expect(new Set(s.blocks)).toEqual(new Set(['0xa']));const member=await s.resolver.membership(identity.name,'codex.desk.wayleave.eth');expect(member.key).toBe(key);expect(member.scopes).toEqual(['read','propose_payment']);await expect(s.resolver.membership(identity.name,'codex.other.eth')).rejects.toThrow('direct child');});
test('rejects stale RPC, wrong chain, expired ancestors and registry generation mismatch',async()=>{for(const change of ['setChain','setStale','reregister','expire'] as const){const s=fixture();s[change]();await expect(s.resolver.membership('desk.wayleave.eth','codex.desk.wayleave.eth')).rejects.toThrow();}});
