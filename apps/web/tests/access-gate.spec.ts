import {expect,test} from '@playwright/test';
for(const path of ['/accounts','/connect','/spending','/identity','/advanced','/accounts/new']) test(`gate ${path}`,async({page})=>{
 await page.route('**/gateway/**',r=>r.fulfill({status:401,json:{error:'Sign in'}}));
 await page.goto(path);
 await expect(page).toHaveURL(new RegExp('/\\?signin=1&returnTo='));
 expect(new URL(page.url()).searchParams.get('returnTo')).toBe(path);
 await expect(page.getByRole('heading',{name:'Sign in to your account',exact:true})).toBeVisible();
});
test('landing, setup, payments and merchant remain public',async({page})=>{
 await page.route('**/gateway/**',r=>r.fulfill({status:401,json:{error:'Sign in'}}));
 for(const path of ['/','/?setup=1','/payments','/store/developer-pack']) {
  await page.goto(path);
  expect(new URL(page.url()).searchParams.has('signin')).toBe(false);
  await expect(page.getByRole('heading',{name:'Sign in to your account',exact:true})).toHaveCount(0);
 }
 await page.goto('/payments');
 await page.getByRole('button',{name:'Accept payments',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Describe the purchase',exact:true})).toBeVisible();
});
test('forged session cookie never mounts private page',async({page,context,baseURL})=>{
 await context.addCookies([{name:'mandate_session',value:'a'.repeat(64),url:baseURL!}]);
 await page.route('**/gateway/auth/session',r=>r.fulfill({status:401,json:{error:'Expired'}}));
 await page.goto('/accounts');
 await expect(page.getByRole('heading',{name:'Sign in to your account',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your agent wallets',exact:true})).toHaveCount(0);
});
