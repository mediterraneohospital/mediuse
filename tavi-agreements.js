/* Company agreements are independent of procedure records and their save queue. */
window.MediUseAgreements=(()=>{
 const session=()=>store.ready&&store.user?.id;
 async function read(company){
  const owner=session();if(!owner)throw Error('login_required');
  const {data,error}=await db.from('mediuse_tavi_agreements').select('*').eq('company',company).maybeSingle();
  if(error)throw error;if(session()!==owner)throw Error('login_required');return data;
 }
 function attach(card,company){
  const wrap=document.createElement('div');wrap.className='tavi-agreement-card';
  card.replaceWith(wrap);wrap.appendChild(card);
  const button=document.createElement('button');button.type='button';button.className='agreement-button';
  button.textContent='Συμφωνία';button.setAttribute('aria-label','Εμπορική συμφωνία '+company);
  const tip=document.createElement('div');tip.className='agreement-tooltip';tip.id='agreement-tip-'+crypto.randomUUID();tip.setAttribute('role','tooltip');
  button.setAttribute('aria-describedby',tip.id);wrap.append(button,tip);
  let active=false;
  const preview=async()=>{active=true;tip.textContent='Φόρτωση…';tip.hidden=false;try{const row=await read(company);if(active)tip.textContent=row?.agreement||'Δεν έχει καταχωριστεί συμφωνία.';}catch{if(active)tip.textContent='Δεν ήταν δυνατή η φόρτωση. Πατήστε για επανάληψη.';}};
  const hide=()=>{active=false;tip.hidden=true;};hide();
  button.onmouseenter=()=>{if(matchMedia('(hover:hover)').matches)preview();};button.onmouseleave=hide;
  button.onfocus=preview;button.onblur=hide;button.onclick=()=>{hide();open(company);};
 }
 async function open(company){
  const {d,body}=dialog('Εμπορική συμφωνία · '+company);body.textContent='Φόρτωση…';
  const owner=session();let row;
  try{row=await read(company);}catch{body.textContent='Δεν ήταν δυνατή η φόρτωση. Κλείστε και δοκιμάστε ξανά.';return;}
  if(!d.open||session()!==owner)return;body.textContent='';
  const view=document.createElement('p');view.className='agreement-text';view.textContent=row?.agreement||'Δεν έχει καταχωριστεί συμφωνία.';body.appendChild(view);
  const label=document.createElement('label');label.textContent='Κείμενο συμφωνίας';
  const input=document.createElement('textarea');input.className='inp agreement-input';input.rows=10;input.maxLength=50000;input.value=row?.agreement||'';label.appendChild(input);label.hidden=true;body.appendChild(label);
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.appendChild(status);
  const actions=document.createElement('div');actions.className='form-actions';body.appendChild(actions);
  const edit=actionButton('Επεξεργασία',()=>{view.hidden=true;label.hidden=false;edit.hidden=true;save.hidden=false;cancel.hidden=false;input.focus();});
  const cancel=actionButton('Ακύρωση',()=>{input.value=row?.agreement||'';label.hidden=true;view.hidden=false;edit.hidden=false;save.hidden=true;cancel.hidden=true;status.textContent='';});cancel.className='cancel-btn';
  const save=actionButton('Αποθήκευση',async()=>{
   if(session()!==owner){status.textContent='Συνδεθείτε ξανά για να αποθηκεύσετε.';return;}
   save.disabled=true;cancel.disabled=true;input.disabled=true;const value=input.value;
   status.textContent='Αποθήκευση…';
   const preventClose=e=>e.preventDefault();d.addEventListener('cancel',preventClose);
   const close=d.querySelector(':scope > .cancel-btn');close.disabled=true;
   try{
    let query=db.from('mediuse_tavi_agreements');
    query=row?query.update({agreement:value}).eq('company',company).eq('version',row.version):query.insert({company,agreement:value});
    const {data,error}=await query.select('*').maybeSingle();
    if(error?.code==='23505'||(!error&&!data)){status.textContent='Η συμφωνία άλλαξε από άλλον χρήστη. Το κείμενό σας παραμένει εδώ. Κλείστε και ανοίξτε ξανά για την τελευταία εκδοχή.';return;}
    if(error)throw error;if(session()!==owner)return;
    row=data;view.textContent=row.agreement||'Δεν έχει καταχωριστεί συμφωνία.';label.hidden=true;view.hidden=false;edit.hidden=false;save.hidden=true;cancel.hidden=true;status.textContent='Αποθηκεύτηκε.';
   }catch{status.textContent='Δεν αποθηκεύτηκε. Το κείμενό σας παραμένει εδώ· δοκιμάστε ξανά.';}
   finally{save.disabled=false;cancel.disabled=false;input.disabled=false;close.disabled=false;d.removeEventListener('cancel',preventClose);}
  });save.hidden=true;cancel.hidden=true;actions.append(edit,save,cancel);
  d.addEventListener('cancel',e=>{if(!label.hidden&&input.value!==(row?.agreement||'')&&!confirm('Να κλείσει χωρίς αποθήκευση;'))e.preventDefault();});
  d.querySelector(':scope > .cancel-btn').onclick=()=>{if(label.hidden||input.value===(row?.agreement||'')||confirm('Να κλείσει χωρίς αποθήκευση;'))d.close();};
 }
 return {attach};
})();
