const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');const assert=require('assert/strict');
(async()=>{
 const app=path.resolve(__dirname,'..');const fixture=JSON.parse(fs.readFileSync(process.env.CATALOG_FIXTURE,'utf8').replace(/^\uFEFF/,''));
 const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1080}});
 await context.route('**/*.supabase.co/**',r=>r.abort());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///'+path.join(app,'index.html').replace(/\\/g,'/'));await page.locator('#login-screen').waitFor({state:'visible'});
 await page.evaluate(f=>{
  window.searchCalls=[];window.fixture=f;window.failSearch=false;window.delaySearch=0;window.previewCalls=0;window.importCalls=0;
  db.rpc=async(name,args)=>{
   if(name==='mediuse_catalog_search_v2'){
    window.searchCalls.push({...args});const delay=window.delaySearch;if(delay)await new Promise(r=>setTimeout(r,delay));if(window.failSearch)return {error:{message:'offline'}};
    let data=structuredClone(!args.p_query?fixture.blank:args.p_query==='183466'?fixture.exact:args.p_offset?fixture.next_page:fixture.combined);
    if(args.p_query==='no-match')data={...data,items:[],total:0};return {data,error:null};
   }
   if(name==='mediuse_catalog_preview'){previewCalls++;return {data:{total:args.p_rows.length,added:0,changed:4,removed:0,missing_prices:400,version:1}};}
   if(name==='mediuse_catalog_import'){importCalls++;return {data:{row_count:args.p_rows.length,version:2}};}
  };
  store.ready=true;document.getElementById('auth-loading').hidden=true;document.getElementById('login-screen').hidden=true;document.querySelector('.sidebar').hidden=false;document.querySelector('.main-shell').hidden=false;state.cat='warehouse';render();
 },fixture);
 await page.locator('.wh-empty').waitFor();assert.equal(await page.locator('.wh-item').count(),0);
 await page.locator('#wh-search').fill('medtronic καθετήρας');await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===20);
 assert.equal(await page.locator('.wh-item').first().locator('.wh-name').textContent(),fixture.combined.items[0].description);
 assert(!/purchase_qty|Ποσότητα|Συνολικές αγορές/.test(await page.locator('#app').innerText()));
 await page.evaluate(()=>{render();});assert.equal(await page.locator('#wh-search').inputValue(),'medtronic καθετήρας');
 await page.locator('#wh-more').click();await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===40);
 await page.locator('#wh-sort').selectOption('purchase_asc');await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===20);
 assert.deepEqual(await page.evaluate(()=>({sort:searchCalls.at(-1).p_sort,offset:searchCalls.at(-1).p_offset})),{sort:'purchase_asc',offset:0});
 await page.locator('#wh-more').click();await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===40);assert.equal(await page.evaluate(()=>searchCalls.at(-1).p_sort),'purchase_asc');
 await page.locator('#wh-sort').selectOption('observatory_desc');await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===20);assert.equal(await page.evaluate(()=>searchCalls.at(-1).p_offset),0);
 await page.locator('#wh-search').fill('zimmer 33.4.120');await page.waitForFunction(()=>searchCalls.at(-1).p_query==='zimmer 33.4.120');assert.equal(await page.evaluate(()=>searchCalls.at(-1).p_sort),'observatory_desc');
 await page.locator('#wh-sort').selectOption('relevance');
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.resolve('outputs/warehouse-implemented-desktop.png'),fullPage:false});
 await page.locator('#wh-search').fill('183466');await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===1);
 await page.locator('.wh-details summary').click();assert((await page.locator('.wh-detail-grid').innerText()).includes('33.4.120'));
 await page.screenshot({path:path.resolve('outputs/warehouse-implemented-ref.png'),fullPage:false});
 await page.locator('#wh-search').fill('no-match');await page.locator('.wh-empty').waitFor();
 await page.evaluate(()=>window.failSearch=true);await page.locator('#wh-search').fill('test');await page.waitForFunction(()=>document.querySelector('#wh-status').textContent.includes('Δεν ήταν δυνατή'));await page.evaluate(()=>window.failSearch=false);await page.getByRole('button',{name:'Επανάληψη',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===20);
 await page.evaluate(()=>window.delaySearch=500);await page.locator('#wh-search').fill('183466');await page.locator('#wh-search').press('Enter');await page.evaluate(()=>{state.cat='tavi';render();});await page.waitForTimeout(650);assert.equal(await page.locator('.wh-item').count(),0);assert.equal(await page.locator('#page-title').textContent(),'TAVI');
 await page.evaluate(()=>{window.delaySearch=0;state.cat='warehouse';render();});await page.locator('.wh-item').waitFor();
 await page.locator('#wh-search').fill('medtronic καθετήρας');await page.waitForFunction(()=>document.querySelectorAll('.wh-item').length===20);
 await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.resolve('outputs/warehouse-implemented-mobile.png'),fullPage:false});
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.waitForTimeout(250);await page.screenshot({path:path.resolve('outputs/warehouse-implemented-dark.png'),fullPage:false});
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
 await page.addScriptTag({path:path.join(app,'vendor/xlsx-0.20.3.min.js')});
 const excel=fs.readFileSync(process.env.CATALOG_SOURCE).toString('base64');
 const parsed=await page.evaluate(base64=>{const w=XLSX.read(base64,{type:'base64'});const rows=MediUseWarehouse.parseWorkbook(w,XLSX);const checks={count:rows.length,first:rows[0],last:rows.at(-1)};
  const headers=['REF','Κωδικός','Περιγραφή','Ποσ.1','ΤΕΛ.ΑΓΟΡΑ','Τιμή','Τιμή Παρατ.','ΚΩΔ.ΠΑΡΑΤ.','ΕΚΑΠΤΥ','Συνήθης Προμηθευτής'];
  const book=values=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([headers,...values]),'Items');return b;};
  const good=['00012','Q1','Description',1,0,null,1,'','','Supplier'];const r=MediUseWarehouse.parseWorkbook(book([good]),XLSX)[0];if(r.ref!=='00012'||r.price_purchase!==0||r.price_package!==null)throw Error('Identifier/zero/blank parsing failed');
  let rejected=0;for(const bad of [book([good,good]),book([[...good.slice(0,3),-1,...good.slice(4)]])]){try{MediUseWarehouse.parseWorkbook(bad,XLSX);}catch{rejected++;}}if(rejected!==2)throw Error('Invalid import accepted');return checks;
 },excel);
 if(process.env.CATALOG_INCREMENTAL){const month=fs.readFileSync(process.env.CATALOG_INCREMENTAL).toString('base64');const parsedMonth=await page.evaluate(b=>MediUseWarehouse.parseWorkbook(XLSX.read(b,{type:'base64'}),XLSX),month);assert.equal(parsedMonth.length,430);assert.equal(parsedMonth[0].price_purchase,678.9);assert.equal(parsedMonth[0].price_package,730);assert.equal(parsedMonth[0].observatory_code,'4.3.16');}
 assert.equal(parsed.count,14536);assert.equal(parsed.first.code,'Q000006612');assert.equal(parsed.last.code,'Q000025006');
 await page.getByRole('button',{name:'Ενημέρωση από Excel',exact:true}).click();await page.locator('#wh-import-dialog input[type=file]').setInputFiles(process.env.CATALOG_SOURCE);
 await page.locator('.wh-import-summary').waitFor();assert.equal(await page.evaluate(()=>importCalls),0);await page.getByRole('button',{name:'Ενημέρωση καταλόγου',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#wh-import-dialog').textContent.includes('Ο κατάλογος ενημερώθηκε'));
 assert.equal(await page.evaluate(()=>importCalls),1);await page.getByRole('button',{name:'Κλείσιμο',exact:true}).click();
 await page.evaluate(()=>{MediUseWarehouse.reset();render();});await page.locator('.wh-empty').waitFor();assert.equal(await page.locator('#wh-search').inputValue(),'');assert.deepEqual(errors,[]);await browser.close();console.log('PASS: UI, pagination, stale responses, failure/retry, mobile/dark layout, 14,536-row Excel parsing and preview-before-import.');
})().catch(e=>{console.error(e);process.exitCode=1;});
