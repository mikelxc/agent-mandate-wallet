import { mockOwnedWalletRpc, arcAccount } from './helpers/owned-wallet-rpc';
import { expect, test } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
import { hexToString, verifyMessage, zeroAddress } from 'viem';
import { identityFingerprint, portableIdentityDeployment, type PortableIdentity } from '@mandate/sdk';
import { Store } from '../../gateway/src/store';
import { createIdentityAuth, createIdentityRoutes } from '../../gateway/src/identity-auth';
import {createIdentityAssociations} from '../../gateway/src/identity-associations';
import {createAgentTokens} from '../../gateway/src/agent-tokens';

test.setTimeout(60000);
for (const wrongOwner of [false]) test(`shared access flow verifies, links, grants, locks settings and restores linked accounts`, async ({ page, baseURL }) => {
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
  const associations=createIdentityAssociations(store.db,auth,{ownership:async()=>({controller:owner.address,epoch:'1'}),verify:(_chain,address,message,signature)=>verifyMessage({address,message,signature})});
  const tokens=createAgentTokens(store,auth,associations,origin);
  const routes = createIdentityRoutes(auth, origin, associations, tokens);
  let signatures = 0;
  await page.exposeFunction('identityTestSign', async (raw: `0x${string}`) => {
    expect(hexToString(raw)).toContain('Wayleave');
    signatures++;
    return owner.signMessage({message:{raw}});
  });
  await page.addInitScript(({address}) => {
    let chain = '0x4cef52';
    let connected=true;
    const listeners = new Map<string, Set<(...args:any[])=>void>>();
    const provider = {
      isMetaMask:true,
      on(event:string, listener:(...args:any[])=>void) { if(!listeners.has(event)) listeners.set(event,new Set()); listeners.get(event)!.add(listener); },
      removeListener(event:string, listener:(...args:any[])=>void) { listeners.get(event)?.delete(listener); },
      async request({method,params}:any) {
        if(method==='eth_accounts') return connected ? [address] : [];
        if(method==='eth_requestAccounts') { connected=true; localStorage.setItem('owned-access-test-connected','yes'); return [address]; }
        if(method==='eth_chainId') return chain;
        if(method==='wallet_getCapabilities') return {};
        if(method==='wallet_requestPermissions') return [{parentCapability:'eth_accounts'}];
        if(method==='wallet_switchEthereumChain') { chain=params[0].chainId; for(const listener of listeners.get('chainChanged')??[]) listener(chain); return null; }
        if(method==='personal_sign') { return (window as any).identityTestSign(params[0]); }
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
  await mockOwnedWalletRpc(page,owner.address,'payments');
  await page.route('**/gateway/auth/session',r=>r.fulfill({json:{address:owner.address,chainId:11155111}}));
  try {
    await page.context().addCookies([{name:'mandate_session',value:'a'.repeat(64),url:baseURL!}]);
    await page.goto('/?signin=1&returnTo=%2Fconnect');
    await expect(page).toHaveURL(/\/connect$/);
    const lookup=async()=>{
      await expect(page.getByRole('button',{name:'Look up name',exact:true})).toHaveCount(0);
      await expect(page.getByLabel('ENS identity from your wallets',{exact:true})).toHaveCount(0);
      await expect(page.getByRole('region',{name:'Discovered identity'})).toBeVisible();
    };
    await lookup();
    await page.setViewportSize({width:320,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'/private/tmp/owned-ens-prefill-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await expect(page.getByRole('region', {name:'Discovered identity'})).toBeVisible();
    const verifyButton=page.getByRole('button',{name:'Verify with your wallet',exact:true});
    if (!await verifyButton.isVisible()) {
      await page.getByRole('region', {name:'Discovered identity'}).getByRole('button', {name:/Connect (Identity Test Wallet|Injected|MetaMask)/}).first().click();
      await lookup();
    }
    await page.evaluate(() => (window as any).ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x4cef52'}]}));
    await page.getByRole('button',{name:'Verify with your wallet',exact:true}).click();
    await expect(page.getByLabel('Agent wallet address')).toBeDisabled();
    await expect(page.getByLabel('Agent wallet address')).toHaveValue(arcAccount);
    await expect(page.getByLabel('Agent wallet address',{exact:true})).toHaveValue(arcAccount);
    await expect(page.getByLabel('Agent wallet address',{exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Verify and link wallet',exact:true}).click();
    const manager=page.getByRole('region',{name:'Agent bearer tokens'});
    await expect(manager.getByLabel('Associated Arc account')).toBeDisabled();
    await expect(manager.getByRole('heading',{name:'Set up your MCP client'})).toHaveCount(0);
    await expect(manager.getByLabel('Connection label')).toBeEnabled();
    await manager.getByRole('button',{name:'Sign and grant access'}).click();
    await expect(manager.getByRole('status')).toContainText('Token created');
    await expect(manager.getByRole('heading',{name:'Set up your MCP client'})).toBeVisible();
    await expect(manager.getByRole('button',{name:'Sign and grant access'})).toHaveCount(0);
    await manager.getByText('Signed connection settings',{exact:true}).click();
    await expect(manager.getByLabel('Connection label')).toBeDisabled();
    await expect(manager.getByLabel('Session length',{exact:true})).toBeDisabled();
    await expect(manager.getByRole('checkbox')).toBeDisabled();
    expect(signatures).toBe(3);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(manager.getByRole('status')).toContainText('Token created');
    await expect(manager.getByRole('button',{name:'Sign and grant access'})).toHaveCount(0);
    await page.goto('/accounts?network=arc&account='+arcAccount);
    const access=page.getByRole('link',{name:'Grant agent access',exact:true});
    await expect(access).toHaveAttribute('href',`/connect?chainId=5042002&account=${arcAccount}`);
    await access.click();
    await page.getByRole('button',{name:'Use this account',exact:true}).click();
    await expect(manager.getByLabel('Associated Arc account')).toBeDisabled();
    await expect(manager.getByRole('heading',{name:'Set up your MCP client'})).toHaveCount(0);
    await expect(manager.getByLabel('Connection label')).toBeEnabled();
    expect(signatures).toBe(3);
    await page.route('**/gateway/agents', r => r.fulfill({json: []}));
    await page.route('**/gateway/operations', r => r.fulfill({json: []}));
    await page.goto('/spending');
    await expect(page.getByRole('link', {name:'Grant agent access',exact:true})).toHaveAttribute('href','/connect');
    await expect(page.getByRole('link', {name:'Add agent',exact:true})).toHaveCount(0);
    await expect(page.getByRole('navigation', {name:'Main navigation'}).getByRole('link', {name:'Agent access',exact:true})).toHaveAttribute('href','/connect');
    await page.goto('/connect?chainId=5042002&account=0x7777777777777777777777777777777777777777');
    await expect(page.getByRole('alert').filter({hasText:'selected wallet could not'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Sign and grant access'})).toHaveCount(0);
    await page.route('**/gateway/auth/session',r=>r.fulfill({status:401,json:{error:'Expired'}}));
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('wayleave:owner-session',{detail:null})));
    await expect(page.getByRole('heading',{name:'Sign in to your account',exact:true})).toBeVisible();
    await expect(page.getByText('The selected wallet could not be verified as yours on that network.')).toHaveCount(0);
  } finally {store.close();}
});
