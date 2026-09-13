import { expect, test } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
import { hexToString, verifyMessage, zeroAddress } from 'viem';
import { identityFingerprint, portableIdentityDeployment, type PortableIdentity } from '@mandate/sdk';
import { Store } from '../../gateway/src/store';
import { createIdentityAuth, createIdentityRoutes } from '../../gateway/src/identity-auth';

test.setTimeout(60000);
for (const wrongOwner of [false, true]) test(`identity starting on Arc ${wrongOwner ? 'blocks a different NFT owner' : 'switches to Sepolia and verifies NFT owner'}`, async ({ page, baseURL }) => {
  const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
  const store = new Store(':memory:');
  const identity: PortableIdentity = {
    name: 'desk.wayleave.eth', deployment: portableIdentityDeployment, chainId: 11155111,
    controller: wrongOwner ? other.address : owner.address, registry: other.address, resolver: other.address,
    subregistry: zeroAddress, registration: identityFingerprint('nft-ui'), expiresAt: Math.floor(Date.now()/1000)+86400,
    canSetSubregistry: false, authority: { kind: 'wayleave-nft-owner', registryOwner: other.address, account: other.address, factory: other.address, tokenId: '1', epoch: '1' },
  };
  const origin = new URL(baseURL!).origin;
  const auth = createIdentityAuth({ db: store.db, audience: process.env.IDENTITY_TEST_AUDIENCE ?? origin, resolver: {
    discover: async () => identity, membership: async () => { throw new Error('unused'); },
    verify: (address,message,signature) => verifyMessage({address,message,signature}),
  } });
  const routes = createIdentityRoutes(auth, origin);
  let signatures = 0;
  await page.exposeFunction('identityTestSign', async (raw: `0x${string}`) => {
    expect(hexToString(raw)).toContain('Wayleave portable identity v1');
    signatures++;
    return owner.signMessage({message:{raw}});
  });
  await page.addInitScript(({address}) => {
    let chain = '0x4cef52';
    const listeners = new Map<string, Set<(...args:any[])=>void>>();
    const provider = {
      isMetaMask:true,
      on(event:string, listener:(...args:any[])=>void) { if(!listeners.has(event)) listeners.set(event,new Set()); listeners.get(event)!.add(listener); },
      removeListener(event:string, listener:(...args:any[])=>void) { listeners.get(event)?.delete(listener); },
      async request({method,params}:any) {
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [address];
        if(method==='eth_chainId') return chain;
        if(method==='wallet_getCapabilities') return {};
        if(method==='wallet_requestPermissions') return [{parentCapability:'eth_accounts'}];
        if(method==='wallet_switchEthereumChain') { chain=params[0].chainId; for(const listener of listeners.get('chainChanged')??[]) listener(chain); return null; }
        if(method==='personal_sign') { if(chain!=='0xaa36a7') throw new Error('Identity signed on wrong chain'); return (window as any).identityTestSign(params[0]); }
        throw new Error(`Unsupported ${method}`);
      },
    };
    Object.defineProperty(window,'ethereum',{value:provider});
    const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'fe984cc3-0124-4226-ae56-5a7de2f3bf92',name:'Identity Test Wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'test.identity'},provider}}));
    window.addEventListener('eip6963:requestProvider',announce); announce();
  },{address:owner.address});
  await page.route('**/gateway/**',async route=>{
    const request=route.request(); const url=new URL(request.url()); url.pathname=url.pathname.replace(/^\/gateway/,'');
    const response=await routes(new Request(url,{method:request.method(),headers:await request.allHeaders(),body:request.postData()??undefined}));
    if(!response) return route.fulfill({status:401,json:{error:'No owner session'}});
    await route.fulfill({status:response.status, headers:Object.fromEntries(response.headers), body:await response.text()});
  });
  try {
    await page.goto('/identity');
    const lookup=async()=>{await page.getByLabel('ENS name',{exact:true}).fill(identity.name); await page.getByRole('button',{name:'Look up name',exact:true}).click();};
    await lookup();
    await expect(page.getByRole('region', {name:'Discovered identity'})).toBeVisible();
    const verifyButton=page.getByRole('button',{name:'Verify with your wallet',exact:true});
    if (!await verifyButton.isVisible()) {
      await page.getByRole('region', {name:'Discovered identity'}).getByRole('button', {name:/Connect (Identity Test Wallet|Injected|MetaMask)/}).first().click();
      await lookup();
    }
    await page.evaluate(() => (window as any).ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x4cef52'}]}));
    await page.getByRole('button',{name:'Verify with your wallet',exact:true}).click();
    if(wrongOwner) { await expect(page.locator('.flow-message[role=alert]')).toContainText('current NFT owner'); expect(signatures).toBe(0); }
    else { await expect(page.getByRole('status')).toContainText('NFT ownership verified'); expect(signatures).toBe(1);
      const manager=page.getByRole('region',{name:'Agent bearer tokens'});
      const create=manager.getByRole('button',{name:'Sign and grant access'});
      await expect(create).toBeEnabled();
      await create.click();
      await expect(manager.getByRole('alert')).toContainText('Arc account you linked');
      await manager.getByLabel('Associated Arc account').fill('  0x3333333333333333333333333333333333333333  ');
      await manager.getByLabel('Connection label').fill('Assistant Agent');
      await create.click();
      await expect(manager.getByRole('alert')).toContainText('connection label such as assistant');
      await expect(create).toBeEnabled();
      expect(signatures).toBe(1);
    }
  } finally {store.close();}
});
