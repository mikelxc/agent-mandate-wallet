import type { Page } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi, type Hex } from 'viem';
import { kernelAccountFactoryAbi, nFTOwnerValidatorAbi, entryPointAbi, sepoliaDeployment } from '@mandate/sdk';
export const arcAccount = '0x3333333333333333333333333333333333333333';
export const sepoliaAccount = '0x4444444444444444444444444444444444444444';
const arcRegistry = '0x5555555555555555555555555555555555555555';
const arcValidator = '0x6666666666666666666666666666666666666666';
export async function mockOwnedWalletRpc(page: Page, owner: string, arcLabel = 'desk') {
  await page.route('**/*', async route => {
    const request = route.request();
    if(request.method() !== 'POST' || request.url().includes('/gateway/')) return route.fallback();
    let body: any; try {body=request.postDataJSON();} catch {return route.fallback();}
    if(!body || !(Array.isArray(body) ? body[0]?.jsonrpc : body.jsonrpc)) return route.fallback();
    const arc = /arc\.network|5042002/.test(decodeURIComponent(request.url()));
    const registry = arc ? arcRegistry : sepoliaDeployment.registry;
    const abi = [...kernelAccountFactoryAbi,...nFTOwnerValidatorAbi,...entryPointAbi,...erc20Abi] as const;
    function call(data:Hex): Hex {
      if(data.startsWith('0x82ad56cb')) {
        const decoded=decodeFunctionData({abi:multicall3Abi,data});
        return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:(decoded.args![0] as any[]).map(entry=>({success:true,returnData:call(entry.callData)}))});
      }
      const decoded=decodeFunctionData({abi,data});
      const values: Record<string,any>={nextTokenId:2n,ownerOf:owner,accountOf:arc?arcAccount:sepoliaAccount,labelOf:arc ? arcLabel : 'desk',bindings:[registry,1n],ownershipEpoch:1n,balanceOf:0n,allowance:0n};
      if(!(decoded.functionName in values)) throw new Error(`Unexpected wallet read ${decoded.functionName}`);
      return encodeFunctionResult({abi:abi as any,functionName:decoded.functionName,result:values[decoded.functionName]});
    }
    const reply=(item:any)=>{
      const values:Record<string,unknown>={eth_chainId:arc?'0x4cef52':'0xaa36a7',eth_blockNumber:'0x64',eth_getCode:'0x1234',eth_getBalance:'0x0'};
      try {return {jsonrpc:'2.0',id:item.id,result:item.method==='eth_call'?call(item.params[0].data):values[item.method]??null};}
      catch(error){return {jsonrpc:'2.0',id:item.id,error:{code:-32000,message:String(error)}};}
    };
    return route.fulfill({json:Array.isArray(body)?body.map(reply):reply(body)});
  });
  await page.route('**/gateway/crosschain/config', route=>route.fulfill({json:{configured:true,chainId:5042002,registry:arcRegistry,validator:arcValidator,entryPoint:sepoliaDeployment.entryPoint}}));
}
