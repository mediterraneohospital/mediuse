/* Supabase is the authoritative source. Drafts are scoped to user and tab. */
window.MediUseStore=class MediUseStore{
 constructor(client,onStatus){this.client=client;this.status=onStatus;this.baseline=new Map();this.desired=new Map();this.ready=false;this.running=null;this.request=null;this.retryTimer=null;this.conflict=false;this.revision=0;}
 key(row){return row.category+':'+row.record_id;}
 canonical(value){if(Array.isArray(value))return value.map(v=>this.canonical(v));if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,this.canonical(value[k])]));return value;}
 same(a,b){return JSON.stringify(this.canonical(a))===JSON.stringify(this.canonical(b));}
 flatten(state){const result=new Map();for(const category of ['tavi','boston','evar','clip'])for(const completed of [false,true])for(const [position,payload] of (state[category+(completed?'_done':'')]||[]).entries()){const row={category,record_id:String(payload.id),payload:structuredClone(payload),completed,position};result.set(this.key(row),row);}return result;}
 build(){const changes=[];for(const [key,row] of this.desired){const old=this.baseline.get(key);if(!old)changes.push({op:'insert',...row});else if(old.deleted_at)throw Error('record_conflict');else if(!this.same(old.payload,row.payload)||old.completed!==row.completed)changes.push({op:'update',...row,position:old.position,expected_version:old.version});}for(const [key,row] of this.baseline)if(!row.deleted_at&&!this.desired.has(key))changes.push({op:'archive',category:row.category,record_id:row.record_id,expected_version:row.version});return changes;}
 persist(){if(!this.pendingKey)return;const draft={base:[...this.baseline.values()],desired:[...this.desired.values()],request:this.request,saved_at:Date.now()};localStorage.setItem(this.pendingKey,JSON.stringify(draft));}
 async claimDraft(key){if(!navigator.locks)return false;return new Promise((resolve,reject)=>{navigator.locks.request('mediuse-draft:'+key,{ifAvailable:true},async lock=>{if(!lock){resolve(false);return;}const held=new Promise(release=>{this.releaseDraft=release;});resolve(true);await held;}).catch(reject);});}
 async read(){const rows=[];for(let offset=0;;offset+=500){const {data,error}=await this.client.from('mediuse_records').select('*').order('category').order('record_id').range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)break;}return rows;}
 hydrate(rows){this.baseline=new Map(rows.map(r=>[this.key(r),r]));this.desired=new Map(rows.filter(r=>!r.deleted_at).map(r=>[this.key(r),structuredClone(r)]));}
 state(){const state={};for(const c of ['tavi','boston','evar','clip']){state[c]=[];state[c+'_done']=[];}for(const row of [...this.desired.values()].sort((a,b)=>a.position-b.position))state[row.category+(row.completed?'_done':'')].push(structuredClone(row.payload));return state;}
 async load(){const {data:{user},error}=await this.client.auth.getUser();if(error||!user)throw error||Error('login_required');const membership=await this.client.from('mediuse_members').select('email').eq('user_id',user.id);if(membership.error)throw membership.error;if(!membership.data.length)throw Error('access_denied');this.user=user;
  const config=await this.client.from('mediuse_config').select('active').eq('id',true);if(config.error)throw config.error;if(!config.data[0]?.active)throw Error('not_active');
  const prefix='mediuse-pending:'+user.id+':';let tab=sessionStorage.getItem('mediuse-tab');if(!tab){tab=crypto.randomUUID();sessionStorage.setItem('mediuse-tab',tab);}this.pendingKey=prefix+tab;
  this.releaseDraft?.();this.releaseDraft=null;
  const own=localStorage.getItem(this.pendingKey);
  // Adopt only drafts whose owning tab has closed; active tabs retain ownership.
  let other=null;if(!own&&navigator.locks){for(const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort()){if(await this.claimDraft(key)){other=key;break;}}}
  if(!other)await this.claimDraft(this.pendingKey);
  const saved=own||(other&&localStorage.getItem(other));
  if(saved){if(other)this.pendingKey=other;const draft=JSON.parse(saved);this.baseline=new Map(draft.base.map(r=>[this.key(r),r]));this.desired=new Map(draft.desired.map(r=>[this.key(r),r]));this.request=draft.request;this.ready=true;await this.flush();if(this.conflict||this.request||this.build().length)return this.state();}
  this.hydrate(await this.read());this.ready=true;this.status('ok','Συγχρονισμένο');return this.state();
 }
 capture(state){if(!this.ready)throw Error('not_ready');this.desired=this.flatten(state);this.revision++;this.persist();this.status('loading','Εκκρεμεί αποθήκευση');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.flush(),150);}
 async flush(){if(!this.ready||this.conflict)return false;if(this.running)return this.running;this.running=this.writeLoop().finally(()=>{this.running=null;});return this.running;}
 async writeLoop(){try{
  while(true){if(!this.ready)return false;const session=await this.client.auth.getSession();if(session.error||session.data.session?.user.id!==this.user.id){this.status('err','Συνδεθείτε για να συνεχίσετε');return false;}if(!this.request){const changes=this.build();if(!changes.length){localStorage.removeItem(this.pendingKey);this.status('ok','Συγχρονισμένο');return true;}this.request={id:crypto.randomUUID(),changes};this.persist();}
   this.status('loading','Αποθήκευση…');const {data,error}=await this.client.rpc('mediuse_apply_changes',{p_request_id:this.request.id,p_changes:this.request.changes});if(error)throw error;
   if(!Array.isArray(data)||data.length!==this.request.changes.length)throw Error('save_not_confirmed');
   for(const row of data)this.baseline.set(this.key(row),row);this.request=null;this.persist();
  }
 }catch(error){this.persist();if(error.code==='40001'||error.code==='23505'||error.message==='record_conflict'){this.conflict=true;this.status('err','Η εγγραφή άλλαξε σε άλλη οθόνη');window.dispatchEvent(new CustomEvent('mediuse-conflict'));}else{this.status('err','Εκκρεμεί αποθήκευση — επανάληψη');clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>this.flush(),10000);}return false;}}
 async conflictRows(){const remote=await this.read();const operations=this.build();return {remote,operations};}
 async resolve(choices,remote,operations){const map=new Map(remote.map(r=>[this.key(r),r]));const desired=new Map(remote.filter(r=>!r.deleted_at).map(r=>[this.key(r),structuredClone(r)]));for(const change of operations){const key=this.key(change);if(choices[key]!=='mine')continue;if(change.op==='archive'){desired.delete(key);continue;}const current=map.get(key);if(current?.deleted_at){throw Error('Η εγγραφή βρίσκεται στο αρχείο διαγραφών. Επαναφέρετέ την πρώτα.');}desired.set(key,{...change});}this.baseline=map;this.desired=desired;this.request=null;this.conflict=false;this.persist();return this.flush();}
 async archived(){const {data,error}=await this.client.from('mediuse_records').select('*').not('deleted_at','is',null).order('deleted_at',{ascending:false});if(error)throw error;return data;}
 async restore(row){if(!(await this.flush()))throw Error('pending_changes');const {data,error}=await this.client.rpc('mediuse_apply_changes',{p_request_id:crypto.randomUUID(),p_changes:[{op:'restore',category:row.category,record_id:row.record_id,expected_version:row.version}]});if(error)throw error;this.hydrate(await this.read());return this.state();}
 async history(){const {data,error}=await this.client.from('mediuse_history').select('event_id,category,record_id,action,actor,actor_email,changed_at').order('changed_at',{ascending:false}).limit(100);if(error)throw error;return data;}
 async refresh(){if(!this.ready||this.running||this.conflict||this.request||this.build().length)return null;const revision=this.revision;const rows=await this.read();if(revision!==this.revision||this.running||this.request)return null;this.hydrate(rows);return this.state();}
};


