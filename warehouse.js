/* Authenticated catalog search; cumulative purchases stay on the server. */
window.MediUseWarehouse=(()=>{
 let client,root,results,query='',supplier='',sort='relevance',offset=0,request=0,timer,facets=[],loading=false;
 const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ς/g,'σ');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='wh-button')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const number=n=>Number(n).toLocaleString('el-GR');
 const money=n=>n===null||n===undefined?'—':Number(n).toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
 const shortSupplier=s=>{const mappings=[[/medtronic/i,'Medtronic'],[/boston/i,'Boston Scientific'],[/zimmer/i,'Zimmer Biomet'],[/johnson/i,'Johnson & Johnson'],[/abbott/i,'Abbott']];return mappings.find(([re])=>re.test(s||''))?.[1]||s||'Χωρίς προμηθευτή';};
 function active(){return root?.isConnected&&document.getElementById('wh-search')?.closest('#add-section')===root&&state.cat==='warehouse'&&store.ready;}
 function mark(node,text){
  text=String(text??'');const terms=normalize(query).split(/\s+/).filter(t=>t.length>1).map(t=>t.startsWith('καθετ')?'καθετ':t.startsWith('γαντ')?'γαντ':t);
  const chars=Array.from(text),normalized=chars.map(normalize);const normalizedText=normalized.join('');let pos=0;
  while(pos<chars.length){const term=terms.find(t=>normalizedText.startsWith(t,pos));if(term){node.append(el('mark','',chars.slice(pos,pos+term.length).join('')));pos+=term.length;}else{let end=pos+1;while(end<chars.length&&!terms.some(t=>normalizedText.startsWith(t,end)))end++;node.append(document.createTextNode(chars.slice(pos,end).join('')));pos=end;}}
 }
 function reset(){request++;clearTimeout(timer);query='';supplier='';sort='relevance';offset=0;facets=[];document.getElementById('wh-search')?.closest('#add-section')?.replaceChildren();if(results?.classList.contains('wh-list'))results.replaceChildren();root=null;results=null;document.getElementById('wh-import-dialog')?.remove();}
 function render(db){
  client=db;root=document.getElementById('add-section');results=document.getElementById('records');results.classList.add('wh-list');
  if(document.getElementById('wh-search')?.closest('#add-section')===root)return;
  root.replaceChildren();results.replaceChildren();offset=0;
  const box=el('div','wh-searchbox');box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>';
  const input=el('input');input.type='search';input.id='wh-search';input.maxLength=160;input.placeholder='REF, κωδικός, παρατηρητήριο, περιγραφή…';input.setAttribute('aria-label','Αναζήτηση ειδών αποθήκης');input.autocomplete='off';input.value=query;
  input.oninput=()=>{query=input.value;offset=0;request++;clearTimeout(timer);timer=setTimeout(()=>search(),220);};
  input.onkeydown=e=>{if(e.key==='Enter'){clearTimeout(timer);search();}};
  box.append(input,button('Καθαρισμός',()=>{input.value='';query='';offset=0;search();input.focus();},'wh-clear'));root.append(box);
  root.append(el('p','wh-help','Συνδύασε λέξεις και κωδικούς, π.χ. medtronic καθετήρας ή zimmer 33.4.120.'));
  const filters=el('div','wh-filters');filters.id='wh-filters';root.append(filters);
  const chooser=el('details','wh-chooser');const summary=el('summary','','Επιλογή προμηθευτή');chooser.append(summary);
  const find=el('input','inp');find.type='search';find.placeholder='Βρες προμηθευτή…';find.setAttribute('aria-label','Αναζήτηση προμηθευτή');
  const select=el('select','sel');select.id='wh-suppliers';select.size=6;select.setAttribute('aria-label','Προμηθευτές');
  find.oninput=()=>supplierOptions(find.value);select.onchange=()=>{supplier=select.value;offset=0;chooser.open=false;search();};chooser.append(find,select);root.append(chooser);
  const foot=el('div','wh-tools');const date=el('span','wh-updated');date.id='wh-updated';foot.append(date,button('Ενημέρωση από Excel',()=>importExcel(),'wh-button'));root.append(foot);
  const status=el('div','wh-status');status.id='wh-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');const resultBar=el('div','wh-resultbar');resultBar.append(status);
  const sortLabel=el('label','wh-sort-label');sortLabel.append(el('span','','Ταξινόμηση'));
  const sorting=el('select','sel wh-sort');sorting.id='wh-sort';
  for(const [value,label] of [['relevance','Συνάφεια'],['alpha','Περιγραφή Α–Ω'],['purchase_asc','Τιμή αγοράς: χαμηλή → υψηλή'],['purchase_desc','Τιμή αγοράς: υψηλή → χαμηλή'],['observatory_asc','Τιμή παρατηρητηρίου: χαμηλή → υψηλή'],['observatory_desc','Τιμή παρατηρητηρίου: υψηλή → χαμηλή']]){const option=el('option','',label);option.value=value;sorting.append(option);}
  sorting.value=sort;sorting.onchange=()=>{sort=sorting.value;offset=0;clearTimeout(timer);search();};sortLabel.append(sorting);resultBar.append(sortLabel);root.append(resultBar);
  search();
 }
 function supplierOptions(filter=''){
  const select=document.getElementById('wh-suppliers');if(!select)return;select.replaceChildren();
  const all=el('option','','Όλοι οι προμηθευτές');all.value='';select.append(all);
  for(const f of facets.filter(f=>normalize(f.supplier+' '+shortSupplier(f.supplier)).includes(normalize(filter)))){const o=el('option','',f.supplier+' · '+number(f.count));o.value=f.supplier;select.append(o);}select.value=supplier;
 }
 function drawFilters(){
  const wrap=document.getElementById('wh-filters');if(!wrap)return;wrap.replaceChildren();
  const all=button('Όλοι οι προμηθευτές',()=>{supplier='';offset=0;search();},'wh-chip'+(!supplier?' active':''));all.setAttribute('aria-pressed',String(!supplier));wrap.append(all);
  const selected=supplier?facets.find(f=>f.supplier===supplier)||{supplier,count:0}:null;
  const top=facets.slice(0,6);if(selected&&!top.some(f=>f.supplier===supplier))top.unshift(selected);
  for(const f of top){const b=button(shortSupplier(f.supplier)+' · '+number(f.count),()=>{supplier=supplier===f.supplier?'':f.supplier;offset=0;search();},'wh-chip'+(supplier===f.supplier?' active':''));b.title=f.supplier;b.setAttribute('aria-pressed',String(supplier===f.supplier));wrap.append(b);}supplierOptions();
 }
 async function search(append=false){
  if(!active())return;const id=++request;const target=results;
  const status=document.getElementById('wh-status');status.textContent='Αναζήτηση…';
  document.getElementById('wh-more')?.remove();if(!append)target.replaceChildren();
  const tooShort=query.trim().length===1;
  try{
   const {data,error}=await client.rpc('mediuse_catalog_search_v2',{p_query:tooShort?'':query.trim(),p_supplier:supplier,p_offset:offset,p_sort:sort});
   if(id!==request||!active()||target!==results)return;
   if(error)throw error;if(!data?.meta)throw Error('access_denied');
   facets=data.suppliers||[];drawFilters();document.getElementById('page-badge').textContent=number(data.meta.row_count)+' είδη';
   document.getElementById('wh-updated').textContent=data.meta.updated_at?'Ενημέρωση: '+new Date(data.meta.updated_at).toLocaleDateString('el-GR'):'Δεν έχει εισαχθεί κατάλογος';
   if(!query.trim()||tooShort){status.textContent='';target.replaceChildren(el('div','wh-empty',tooShort?'Γράψε τουλάχιστον 2 χαρακτήρες.':'Αναζήτησε με κωδικό, περιγραφή, προμηθευτή ή συνδυασμό τους.'));return;}
   status.textContent=number(data.total)+' '+(data.total===1?'είδος':'είδη')+(supplier?' · '+shortSupplier(supplier):'');
   if(!data.items.length&&!append){const empty=el('div','wh-empty','Δεν βρέθηκαν είδη που να ταιριάζουν σε όλους τους όρους.');if(supplier)empty.append(button('Αναζήτηση σε όλους τους προμηθευτές',()=>{supplier='';offset=0;search();}));if(query.trim().split(/\s+/).length>1)empty.append(el('p','','Δοκίμασε λιγότερες λέξεις ή μέρος της περιγραφής / του κωδικού.'));target.append(empty);return;}
   for(const item of data.items)target.append(card(item));
   if(offset+data.items.length<data.total){const more=button('Περισσότερα αποτελέσματα',()=>{offset+=20;search(true);},'wh-more');more.id='wh-more';target.append(more);}
  }catch(error){if(id!==request||!active())return;status.textContent='Δεν ήταν δυνατή η αναζήτηση. Δοκίμασε ξανά.';status.append(button('Επανάληψη',()=>search(append)));}
 }
 function card(item){
  const article=el('article','wh-item');const header=el('div','wh-item-header');const name=el('h2','wh-name');mark(name,item.description);const tag=el('span','wh-supplier',shortSupplier(item.supplier));tag.title=item.supplier||'';header.append(name,tag);article.append(header);
  if(item.relevance>=95)article.append(el('span','wh-exact','Ακριβής αντιστοίχιση κωδικού'));
  const codes=el('div','wh-codes');for(const [label,value] of [['REF',item.ref],['Κωδικός',item.code],...(/^\d/.test(item.observatory_code||'')?[['Παρατ.',item.observatory_code]]:[])]){const line=el('span','',label+' ');const valueNode=el('b');mark(valueNode,value);line.append(valueNode);codes.append(line);}
  const copy=button('Αντιγραφή REF',async()=>{try{await navigator.clipboard.writeText(item.ref);copy.textContent='Αντιγράφηκε';setTimeout(()=>copy.textContent='Αντιγραφή REF',1500);}catch{const {body}=dialog('Αντιγραφή REF');const field=el('input','inp');field.value=item.ref;field.readOnly=true;body.append(field);field.focus();field.select();}},'wh-copy');codes.append(copy);article.append(codes);
  const prices=el('div','wh-prices');for(const [label,key] of [['Τελευταία αγορά','price_purchase'],['Τιμή πακέτου','price_package'],['Παρατηρητήριο','price_observatory']]){const cell=el('div');cell.append(el('span','wh-price-label',label),el('strong','',money(item[key])));prices.append(cell);}article.append(prices);
  const details=el('details','wh-details');details.append(el('summary','','Στοιχεία είδους'));const grid=el('div','wh-detail-grid');for(const [label,key] of [['Κωδικός παρατηρητηρίου','observatory_code'],['ΕΚΑΠΤΥ','ekapty'],['Συνήθης προμηθευτής','supplier']]){const cell=el('div');cell.append(el('span','wh-price-label',label),el('span','',item[key]||'—'));grid.append(cell);}details.append(grid);article.append(details);return article;
 }
 let xlsxLoading;
 function loadExcel(){if(window.XLSX)return Promise.resolve(window.XLSX);if(!xlsxLoading)xlsxLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/xlsx-0.20.3.min.js';script.onload=()=>resolve(window.XLSX);script.onerror=()=>{xlsxLoading=null;script.remove();reject(Error('excel_library'));};document.head.append(script);});return xlsxLoading;}
 function parseWorkbook(workbook,XLSX){
  const expected=['REF','Κωδικός','Περιγραφή','Ποσ.1','ΤΕΛ.ΑΓΟΡΑ','Τιμή','Τιμή Παρατ.','ΚΩΔ.ΠΑΡΑΤ.','ΕΚΑΠΤΥ','Συνήθης Προμηθευτής'];
  let sheet,header,columns;
  for(const name of workbook.SheetNames){const candidate=workbook.Sheets[name];const matrix=XLSX.utils.sheet_to_json(candidate,{header:1,raw:true,defval:null});for(let i=0;i<Math.min(matrix.length,30);i++){const vals=matrix[i].map(v=>normalize(v).replace(/\s+/g,''));const cols=expected.map(e=>vals.indexOf(normalize(e).replace(/\s+/g,'')));if(cols.every(c=>c>=0)){if(sheet)throw Error('Βρέθηκαν περισσότερα από ένα φύλλα ειδών.');sheet=candidate;header=i;columns=cols;break;}}}
  if(!sheet)throw Error('Δεν βρέθηκαν οι αναμενόμενες στήλες της εξαγωγής αποθήκης.');
  const range=XLSX.utils.decode_range(sheet['!ref']);const rows=[],seen=new Set();
  const text=(r,c)=>{const cell=sheet[XLSX.utils.encode_cell({r,c})];return cell?String(XLSX.utils.format_cell(cell)).trim():'';};
  const numeric=(r,c,required=false)=>{const cell=sheet[XLSX.utils.encode_cell({r,c})];if(!cell||cell.v===null||cell.v===undefined||cell.v===''){if(required)throw Error('Λείπει η ποσότητα αγορών στη γραμμή '+(r+1)+'.');return null;}if(cell.f||cell.t==='e')throw Error('Μη έγκυρη τιμή στη γραμμή '+(r+1)+'.');let value=cell.v;if(typeof value==='string'){value=value.trim().replace(/\s|€/g,'');if(value.includes(','))value=value.replace(/\./g,'').replace(',','.');if(!/^\d+(\.\d+)?$/.test(value))throw Error('Μη αριθμητική τιμή στη γραμμή '+(r+1)+'.');value=Number(value);}if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Μη έγκυρη αριθμητική τιμή στη γραμμή '+(r+1)+'.');return value;};
  for(let r=header+1;r<=range.e.r;r++){
   if(columns.every(c=>text(r,c)===''))continue;
   const code=text(r,columns[1]),ref=text(r,columns[0]),description=text(r,columns[2]);if(!code||!ref||!description)throw Error('Λείπει κωδικός, REF ή περιγραφή στη γραμμή '+(r+1)+'.');if(seen.has(code))throw Error('Ο κωδικός '+code+' εμφανίζεται δύο φορές.');seen.add(code);
   rows.push({code,ref,description,purchase_qty:numeric(r,columns[3],true),price_purchase:numeric(r,columns[4]),price_package:numeric(r,columns[5]),price_observatory:numeric(r,columns[6]),observatory_code:text(r,columns[7]),ekapty:text(r,columns[8]),supplier:text(r,columns[9])});
  }
  if(!rows.length||rows.length>50000)throw Error('Το αρχείο πρέπει να περιέχει από 1 έως 50.000 είδη.');return rows;
 }
 async function importExcel(){
  if(loading)return;const {d,body}=dialog('Ενημέρωση καταλόγου από Excel');d.id='wh-import-dialog';
  body.append(el('p','','Επίλεξε την πλήρη εξαγωγή ειδών. Θα δεις τις αλλαγές πριν ενημερωθεί ο κατάλογος.'));
  const file=el('input','inp');file.type='file';file.accept='.xlsx';file.setAttribute('aria-label','Αρχείο Excel ειδών');body.append(file);
  const progress=el('p');progress.setAttribute('role','status');body.append(progress);
  file.onchange=async()=>{
   if(!file.files[0])return;file.disabled=true;progress.textContent='Έλεγχος αρχείου…';loading=true;
   try{
    const selected=file.files[0];if(selected.size>15*1024*1024)throw Error('Το αρχείο ξεπερνά τα 15 MB.');const XLSX=await loadExcel();const rows=parseWorkbook(XLSX.read(await selected.arrayBuffer(),{type:'array'}),XLSX);
    const {data,error}=await client.rpc('mediuse_catalog_preview',{p_rows:rows});if(error)throw Error('Δεν ήταν δυνατή η προεπισκόπηση. Δοκίμασε ξανά.');if(!d.isConnected||!d.open)return;
    progress.textContent='';const list=el('div','wh-import-summary');for(const [label,key] of [['Είδη στο αρχείο','total'],['Νέα είδη','added'],['Ενημερωμένα είδη','changed'],['Είδη που θα αφαιρεθούν','removed'],['Είδη με ελλιπείς τιμές','missing_prices']]){const line=el('p');line.append(el('span','',label),el('strong','',number(data[key])));list.append(line);}body.append(list);
    body.append(el('p','',data.removed?'Τα είδη που λείπουν από αυτή την εξαγωγή θα αφαιρεθούν από τον κατάλογο.':'Η εξαγωγή θα αντικαταστήσει τις προηγούμενες τιμές του καταλόγου.'));
    if(data.missing_prices)body.append(el('p','','Οι κενές τιμές θα παραμείνουν κενές.'));
    const confirm=button('Ενημέρωση καταλόγου',async()=>{
     loading=true;confirm.disabled=true;file.disabled=true;progress.textContent='Αποθήκευση…';const close=d.querySelector('.cancel-btn');close.disabled=true;const prevent=e=>e.preventDefault();d.addEventListener('cancel',prevent);
     try{
      const result=await client.rpc('mediuse_catalog_import',{p_rows:rows,p_source:selected.name,p_expected_version:data.version});if(result.error)throw result.error;
      progress.textContent='Ο κατάλογος ενημερώθηκε: '+number(result.data.row_count)+' είδη.';confirm.remove();if(active()){offset=0;search();}
     }catch(e){progress.textContent=e.message?.includes('catalog_conflict')?'Ο κατάλογος ενημερώθηκε από άλλον χρήστη. Κλείσε και κάνε νέα προεπισκόπηση.':'Δεν επιβεβαιώθηκε η αποθήκευση. Κλείσε και κάνε νέα προεπισκόπηση για να ελέγξεις την κατάσταση.';}
     finally{loading=false;close.disabled=false;d.removeEventListener('cancel',prevent);}
    },'save-btn');body.append(confirm);
   }catch(e){progress.textContent=e.message;file.disabled=false;}
   finally{loading=false;}
  };
 }
 return {render,reset,parseWorkbook,normalize};
})();
