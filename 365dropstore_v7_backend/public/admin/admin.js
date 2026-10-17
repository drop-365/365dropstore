// 365 Drop Store — owner admin panel.
// Loaded only on /admin/ by openAdmin() in /index.html, after /admin/panel.html is
// inserted. Runs as a classic script in the storefront's global scope, so it uses
// the storefront's shared state and helpers (products, LS, inr, renderGrid,
// loadFromSupabaseIfAvailable, ...). Moved out of index.html on 2026-10-18.
const AE="365dropstore@gmail.com";
const MA=5;
let AH="0cea13dbf9ea0a5a676f82d94c3315d7238e70cbd980131200a55d6c957337b7";
// Customer identity = phone number. No new table -- derived entirely from
// orders already in memory, since phone is validated (10-digit Indian
// mobile) and captured on every order regardless of channel.
function buildCustomerStats(allOrders,rangeStart,rangeEnd){
  const valid=allOrders.filter(o=>["confirmed","fulfilled"].includes(o.status));
  const byPhone={};
  valid.forEach(o=>{
    const ph=o.phone||"unknown";
    if(!byPhone[ph])byPhone[ph]={orders:[],name:o.name};
    byPhone[ph].orders.push(o);
  });
  let newInRange=0,returningInRange=0,repeatCustomers=0;
  const totalCustomers=Object.keys(byPhone).length;
  const topSpenders=[];
  Object.entries(byPhone).forEach(([phone,data])=>{
    const sorted=data.orders.slice().sort((a,b)=>a.placedAt-b.placedAt);
    const firstOrderTime=sorted[0].placedAt;
    const lifetimeOrders=sorted.length;
    const lifetimeSpend=sorted.reduce((s,o)=>s+(Number(o.total)||0),0);
    if(lifetimeOrders>=2)repeatCustomers++;
    const ordersInRange=sorted.filter(o=>o.placedAt>=rangeStart&&o.placedAt<=rangeEnd);
    if(ordersInRange.length>0){
      if(firstOrderTime>=rangeStart)newInRange++;
      else returningInRange++;
    }
    topSpenders.push({phone,name:data.name,lifetimeOrders,lifetimeSpend});
  });
  topSpenders.sort((a,b)=>b.lifetimeSpend-a.lifetimeSpend);
  return{
    totalCustomers,newInRange,returningInRange,
    repeatRate:totalCustomers?(repeatCustomers/totalCustomers*100):0,
    avgOrdersPerCustomer:totalCustomers?(valid.length/totalCustomers):0,
    topSpenders:topSpenders.slice(0,10)
  };
}
function renderCustomerPanel(){
  const rangeEl=document.getElementById("dash-range");
  if(!rangeEl)return;
  const now=Date.now();
  let cutoff=0,upper=now;
  if(_dashRange==="today"){const d=new Date();d.setHours(0,0,0,0);cutoff=d.getTime();}
  else if(_dashRange==="7d")cutoff=now-7*86400000;
  else if(_dashRange==="30d")cutoff=now-30*86400000;
  else if(_dashRange==="month"){const d=new Date();d.setDate(1);d.setHours(0,0,0,0);cutoff=d.getTime();}
  else if(_dashRange==="custom"){
    const f=document.getElementById("dash-custom-from"),t=document.getElementById("dash-custom-to");
    if(f&&f.value)cutoff=new Date(f.value+"T00:00:00").getTime();
    if(t&&t.value)upper=new Date(t.value+"T23:59:59").getTime();
  }
  const stats=buildCustomerStats(orders,cutoff,upper);
  const statsEl=document.getElementById("dash-cust-stats");
  if(statsEl)statsEl.innerHTML=[
    ["Total Customers",stats.totalCustomers],
    ["New (range)",stats.newInRange],
    ["Returning (range)",stats.returningInRange],
    ["Repeat Rate",stats.repeatRate.toFixed(0)+"%"]
  ].map(([k,v])=>`<div class="apstat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");
  const topEl=document.getElementById("dash-cust-top");
  if(topEl){
    topEl.innerHTML=stats.topSpenders.length?stats.topSpenders.map((c,i)=>`<div class="sfd-row">
      <span><span class="off" style="margin-right:8px">${String(i+1).padStart(2,"0")}</span>${(c.name||"Customer").replace(/</g,"&lt;")}</span>
      <span><b>${inr(c.lifetimeSpend)}</b> <span class="off">(${c.lifetimeOrders} order${c.lifetimeOrders>1?"s":""})</span></span></div>`).join("")
      :'<p style="color:#8A8683;font-size:12.5px">No customers yet in this range.</p>';
  }
}
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");}
let editId=null;
function renderFaqAdmin(){
  const el=document.getElementById("faq-admin-list");if(!el)return;
  const DARK=';background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px';
  el.innerHTML=faqItems.map((f,i)=>`<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px">
    <input id="faq-q-${i}" value="${f.q.replace(/"/g,'&quot;')}" placeholder="Question" style="width:100%;padding:8px;margin-bottom:8px;font-weight:700${DARK}"/>
    <textarea id="faq-a-${i}" rows="3" placeholder="Answer" style="width:100%;padding:8px;resize:vertical${DARK}">${f.a.replace(/</g,'&lt;')}</textarea>
    <button class="tb tb-del" style="margin-top:6px" onclick="removeFaqItem(${i})">Remove</button>
  </div>`).join("");
}
function addFaqItem(){faqItems.push({q:"",a:""});renderFaqAdmin();}
function removeFaqItem(i){faqItems.splice(i,1);renderFaqAdmin();}
function saveFaqItems(){
  faqItems=faqItems.map((_,i)=>{
    const q=document.getElementById("faq-q-"+i);
    const a=document.getElementById("faq-a-"+i);
    return{q:q?q.value.trim():"",a:a?a.value.trim():""};
  }).filter(f=>f.q&&f.a);
  LS.set("ds_faq",faqItems);
  // 2026-09-02: FAQ was localStorage-only — admin edits never reached customers.
  // Now persisted into site_content.faq so it syncs live like everything else.
  siteContent.faq=faqItems;
  lsSafeSet("ds_site",siteContent);
  syncSiteToSupabase();
  renderFaqAdmin();renderFaqSection();
  const m=document.getElementById("faq-msg");
  if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}
  showToast("FAQ saved ✓",true);
}
function renderSizeGuideAdmin(){
  const el=document.getElementById("sg-admin");if(!el)return;
  const DARK=';background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px';
  const fits=Object.keys(sizeGuide);
  el.innerHTML=fits.map(fit=>{
    const rows=sizeGuide[fit]||[];
    return`<div style="border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px">
      <h4 style="font-family:var(--dsp);font-size:18px;margin-bottom:12px">${fit}</h4>
      ${rows.map((r,i)=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input value="${r.size}" style="width:60px;padding:6px;text-align:center${DARK}" onchange="sizeGuide['${fit}'][${i}].size=this.value"/>
        <input value="${r.waist}" style="width:60px;padding:6px;text-align:center${DARK}" placeholder="Waist" onchange="sizeGuide['${fit}'][${i}].waist=this.value"/>
        <input value="${r.bestFor}" style="flex:1;padding:6px${DARK}" placeholder="Best for waists..." onchange="sizeGuide['${fit}'][${i}].bestFor=this.value"/>
        <button class="tb tb-del" onclick="sizeGuide['${fit}'].splice(${i},1);renderSizeGuideAdmin();">×</button>
      </div>`).join("")}
      <button class="btn btn-w" style="font-size:11px;padding:4px 10px" onclick="sizeGuide['${fit}'].push({size:'',waist:'',bestFor:''});renderSizeGuideAdmin();">+ Add Size</button>
    </div>`;
  }).join("")+`<button class="btn btn-w" style="margin-top:8px" onclick="addFitToSizeGuide()">+ Add Fit Type</button>`;
}
function addFitToSizeGuide(){
  const name=prompt("Fit name (e.g. Relaxed):");
  if(!name)return;
  sizeGuide[name]=[{size:"28",waist:"28",bestFor:"Best for waists 28-30"}];
  renderSizeGuideAdmin();
}
function saveSizeGuide(){
  LS.set("ds_size_guide",sizeGuide);
  // Previously this never reached Supabase -- edits only ever applied on
  // the browser that made them. Same fix pattern as FAQ: push through
  // siteContent + admin-site, which writes the whole content blob with no
  // field whitelist to fight.
  siteContent.sizeGuide=sizeGuide;
  lsSafeSet("ds_site",siteContent);
  syncSiteToSupabase();
  const m=document.getElementById("sg-msg");
  if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}
  showToast("Size Guide saved ✓ — syncing live",true);
}
let _szmEditing=null;
// id of the model currently expanded for editing, or null
function renderSizeModelsList(){
  const el=document.getElementById("szm-list");if(!el)return;
  if(!sizeModels.length){el.innerHTML='<p style="color:var(--off);font-size:13px">No size models yet. Create one above.</p>';return;}
  el.innerHTML=sizeModels.map(m=>{
    const open=_szmEditing===m.id;
    const rows=m.rows||[];
    return `<div style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><b style="color:var(--white)">${(m.name||"").replace(/</g,"&lt;")}</b>
        <span style="color:var(--off);font-size:11.5px;margin-left:8px">${rows.length} size${rows.length===1?"":"s"}</span></div>
        <div style="display:flex;gap:6px">
          <button class="tb" onclick="toggleSzmEdit('${m.id}')">${open?"Close":"Edit"}</button>
          <button class="tb tb-del" onclick="deleteSizeModel('${m.id}')">Delete</button>
        </div>
      </div>
      ${open?`
        <div style="margin-top:12px">
          <input type="text" value="${(m.name||"").replace(/"/g,"&quot;")}" placeholder="Model name" oninput="updateSzmName('${m.id}',this.value)" style="margin-bottom:10px"/>
          <div id="szm-rows-${m.id}">${szmRowsHtml(m)}</div>
          <button class="tb" style="margin-top:8px" onclick="addSzmRow('${m.id}')">+ Add Size</button>
        </div>
      `:""}
    </div>`;
  }).join("");
}
function szmRowsHtml(m){
  return (m.rows||[]).map((r,i)=>`<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
    <input type="text" value="${(r.size||"").replace(/"/g,"&quot;")}" placeholder="Size" style="width:60px" oninput="updateSzmRow('${m.id}',${i},'size',this.value)"/>
    <input type="text" value="${(r.waist||"").replace(/"/g,"&quot;")}" placeholder="Waist" style="width:70px" oninput="updateSzmRow('${m.id}',${i},'waist',this.value)"/>
    <input type="text" value="${(r.bestFor||"").replace(/"/g,"&quot;")}" placeholder="Best for waists X-Y" style="flex:1" oninput="updateSzmRow('${m.id}',${i},'bestFor',this.value)"/>
    <button class="tb tb-del" style="flex:0 0 auto" onclick="removeSzmRow('${m.id}',${i})">✕</button>
  </div>`).join("");
}
function _szmFind(id){return sizeModels.find(m=>m.id===id);}
function toggleSzmEdit(id){_szmEditing=_szmEditing===id?null:id;renderSizeModelsList();}
function addSizeModel(){
  const id="szm-"+Date.now().toString(36);
  sizeModels.push({id,name:"New Size Model",rows:[{size:"",waist:"",bestFor:""}]});
  _szmEditing=id;
  renderSizeModelsList();
  saveSizeModels();
}
function deleteSizeModel(id){
  if(!confirm("Delete this size model? Any product still assigned to it will fall back to its fit's default size guide."))return;
  sizeModels=sizeModels.filter(m=>m.id!==id);
  if(_szmEditing===id)_szmEditing=null;
  renderSizeModelsList();
  saveSizeModels();
}
function updateSzmName(id,val){const m=_szmFind(id);if(m)m.name=val;}
function updateSzmRow(id,idx,field,val){const m=_szmFind(id);if(m&&m.rows[idx])m.rows[idx][field]=val;}
function addSzmRow(id){const m=_szmFind(id);if(!m)return;m.rows.push({size:"",waist:"",bestFor:""});renderSizeModelsList();}
function removeSzmRow(id,idx){const m=_szmFind(id);if(!m)return;m.rows.splice(idx,1);renderSizeModelsList();saveSizeModels();}
// Name/row-text edits save on blur rather than every keystroke -- avoids
// firing a full Supabase sync per character typed.
document.addEventListener("focusout",e=>{
  if(e.target&&e.target.closest&&e.target.closest('[id^="szm-rows-"], #szm-list input')){
    saveSizeModels();
  }
},true);
function saveSizeModels(){
  LS.set("ds_size_models",sizeModels);
  siteContent.sizeModels=sizeModels;
  lsSafeSet("ds_site",siteContent);
  syncSiteToSupabase();
  showToast("Size Models saved ✓ — syncing live",true);
}
let attCnt=LS.get("adm_att",0);
let locked=LS.get("adm_lk",false);
let _adminPw="";
const pwOv=LS.get("adm_pd",null);
if(pwOv)AH=pwOv;
function renderShadePicker(){
  const el=document.getElementById("pf-shade");if(!el)return;
  el.innerHTML=SHADES.map(s=>'<button type="button" data-k="'+s.k+'" class="'+(_pfShade===s.k?"on":"")+'"'
      +' onclick="setPfShade(\''+s.k+'\')"><i style="background:'+s.hex+'"></i>'+s.n+'</button>').join("")
    +'<button type="button" class="clr'+(_pfShade?"":" on")+'" onclick="setPfShade(\'\')">Unset</button>';
}
let _pfShade="";
function setPfShade(k){_pfShade=k;renderShadePicker();}
function renderHomeSections(){
  // replaced by fit-tabs — this is now a no-op for backwards compat
  // (admin still saves homeSections; they just don't render as strips anymore)
}
/* ===== HERO GRID admin + storefront engine =====
   Renders real Instagram oEmbed widgets (like the old rail did), not raw <video> files —
   no footage shoot required, works with links you already have. Trade-off: Instagram's own
   iframe controls playback (no silent autoplay, no in-place mute); tap-to-shop lives in the
   separate strip below each embed instead of on the embed itself, since the iframe owns its
   own clicks. Table name kept as "insta_grid" on purpose — already whitelisted server-side in
   admin-settings, so this ships with ZERO Edge Function redeploy. */
window.filterHgProd=function(i){
  const input=document.getElementById(`hg-prod-search-${i}`);
  const dd=document.getElementById(`hg-prod-dd-${i}`);
  if(!input||!dd)return;
  const q=(input.value||"").toLowerCase();
  dd.classList.add("open");
  const matches=q?products.filter(p=>(p.name||"").toLowerCase().includes(q)):products;
  dd.innerHTML=`<div class="pso none" onclick="selectHgProd(${i},'','')">— No product link —</div>`
    +matches.slice(0,15).map(p=>`<div class="pso" onclick="selectHgProd(${i},'${p.id}','${(p.name||'').replace(/'/g,"\\'")}')">${(p.name||'').replace(/</g,'&lt;')}</div>`).join("");
};
window.selectHgProd=function(i,pid,name){
  const input=document.getElementById(`hg-prod-search-${i}`);
  const hidden=document.getElementById(`hg-prod-${i}`);
  const dd=document.getElementById(`hg-prod-dd-${i}`);
  if(input)input.value=name;
  if(hidden)hidden.value=pid;
  if(dd)dd.classList.remove("open");
};
// close dropdowns when clicking outside
document.addEventListener("click",function(e){
  if(!e.target.closest(".prod-search-wrap")){
    document.querySelectorAll(".prod-search-dd.open").forEach(d=>d.classList.remove("open"));
  }
});
function renderHeroGridAdmin(){
  const rEl=document.getElementById("hg-rows"),cEl=document.getElementById("hg-cols");
  if(rEl)rEl.value=heroGrid.rows;if(cEl)cEl.value=heroGrid.cols;
  const el=document.getElementById("igrid-admin-list");if(!el)return;
  el.innerHTML=heroGrid.tiles.map((t,i)=>{
    const type=t.type||"embed";
    const selProd=products.find(x=>x.id===t.pid);const pname=selProd?(selProd.name||'').replace(/"/g,'&quot;'):'';
    const opts=products.map(p=>`<option value="${p.id}" ${t.pid===p.id?'selected':''}>${(p.name||'').replace(/</g,'&lt;')}</option>`).join('');
    let fieldHTML="";
    if(type==="embed"){
      fieldHTML=`<input type="url" id="hg-src-${i}" value="${(t.url||'').replace(/"/g,'&quot;')}" placeholder="https://www.instagram.com/reel/... (optional — falls back to product's Reel URL)" style="flex:1;padding:8px;background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px"/>
      <small style="color:var(--off);display:block;margin-top:6px">Renders as a cropped cinema tile — only the video region shows, Instagram's profile header / comments / like-row chrome is cropped out. Their play button and tap-to-Instagram stay (that part lives inside their iframe). Leave blank to auto-use the linked product's Reel URL.</small>`;
    }else if(type==="video"){
      fieldHTML=`<input type="url" id="hg-src-${i}" value="${(t.videoUrl||'').replace(/"/g,'&quot;')}" placeholder="https://.../video.mp4 — direct file link, not a page" style="flex:1;padding:8px;background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px"/>
      <small style="color:var(--off);display:block;margin-top:6px">Autoplays muted on page load and loops. Tap the video to pause, tap again to resume. Sound stays off until the customer taps the sound icon. Buy Now glows on the tile; Instagram is a small optional icon. Needs a real hosted .mp4 (Supabase Storage), not an Instagram/YouTube link.</small>`;
    }else{
      fieldHTML=`<input type="url" id="hg-src-${i}" value="${(t.imageUrl||'').replace(/"/g,'&quot;')}" placeholder="https://.../thumbnail.jpg — your chosen frame, any crop you like" style="flex:1;padding:8px;background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px"/>
      <small style="color:var(--off);display:block;margin-top:6px">Static image, your exact framing. Tap goes straight to the product page — Instagram is a small optional icon only, shown if the product has a Reel URL, never the default action.</small>`;
    }
    return`<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="checkbox" id="hg-en-${i}" ${t.enabled!==false?'checked':''} style="width:16px;height:16px"/>
        <span style="font-family:var(--mono,monospace);font-size:11px;color:var(--off);width:50px">Tile ${i+1}</span>
        <select id="hg-type-${i}" onchange="changeHeroTileType(${i})" style="padding:8px;background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px">
          <option value="embed" ${type==="embed"?'selected':''}>Instagram embed</option>
          <option value="video" ${type==="video"?'selected':''}>Video (autoplay)</option>
          <option value="image" ${type==="image"?'selected':''}>Static image</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">${fieldHTML}</div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="prod-search-wrap">
          <input class="prod-search-input" id="hg-prod-search-${i}" placeholder="Search product..." value="${pname}" oninput="filterHgProd(${i})" onfocus="filterHgProd(${i})" autocomplete="off"/>
          <input type="hidden" id="hg-prod-${i}" value="${t.pid||''}"/>
          <div class="prod-search-dd" id="hg-prod-dd-${i}"></div>
        </div>
        <span style="color:var(--off);font-size:12px">Order</span>
        <input type="number" id="hg-ord-${i}" value="${t.order??i}" style="width:60px;padding:8px;background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px"/>
      </div>
    </div>`;
  }).join("");
}
function changeHeroTileType(i){
  captureHeroGridInputs();
  const sel=document.getElementById(`hg-type-${i}`);
  if(sel&&heroGrid.tiles[i])heroGrid.tiles[i].type=sel.value;
  renderHeroGridAdmin();
}
function captureHeroGridInputs(){
  heroGrid.tiles=heroGrid.tiles.map((t,i)=>{
    const en=document.getElementById(`hg-en-${i}`);
    const typeEl=document.getElementById(`hg-type-${i}`);
    const src=document.getElementById(`hg-src-${i}`);
    const prod=document.getElementById(`hg-prod-${i}`);
    const ord=document.getElementById(`hg-ord-${i}`);
    if(!en)return t;
    const type=typeEl?typeEl.value:(t.type||"embed");
    const val=src?src.value.trim():"";
    return{
      type,
      url:type==="embed"?val:(t.url||""),
      videoUrl:type==="video"?val:(t.videoUrl||""),
      imageUrl:type==="image"?val:(t.imageUrl||""),
      pid:prod?prod.value:"",
      enabled:en.checked,
      order:ord?(parseInt(ord.value)||0):i
    };
  });
}
function resizeHeroGrid(){
  captureHeroGridInputs();
  const rows=Math.max(2,Math.min(4,parseInt(document.getElementById("hg-rows").value)||3));
  const cols=Math.max(2,Math.min(4,parseInt(document.getElementById("hg-cols").value)||3));
  const need=rows*cols;
  let tiles=heroGrid.tiles.slice(0,need);
  while(tiles.length<need)tiles.push({type:"embed",url:"",videoUrl:"",imageUrl:"",pid:"",enabled:true,order:tiles.length});
  heroGrid={rows,cols,tiles};
  renderHeroGridAdmin();
}
function saveHeroGrid(){
  captureHeroGridInputs();
  LS.set("ds_hero_grid",heroGrid);
  renderHeroGridAdmin();
  renderHeroGrid();
  const m=document.getElementById("ig-msg");
  if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}
  showToast("Hero Grid saved ✓ — syncing live...",true);
  syncSettingsToSupabase("insta_grid",heroGrid);
}
/* ===== Returning customers (Log a sale) =====
   Type a phone number → we look up every past order on it (all channels),
   show who they are, and pre-fill name / pincode / address from their last
   order. The new sale then joins the same history, keyed by the phone. */
let _woCust=null,_woLookupT=null,_woCache={};
function _normPhone(raw){let p=String(raw||"").replace(/[^\d]/g,"");if(p.length===12&&p.startsWith("91"))p=p.slice(2);if(p.length===11&&p.startsWith("0"))p=p.slice(1);return p;}
function _realAddr(a){a=String(a||"").trim();return a&&!/^(logged manually|collected at store)$/i.test(a)?a:"";}
function woPhoneLookup(){
  clearTimeout(_woLookupT);
  const box=document.getElementById("wo-cust"); const p=_normPhone((document.getElementById("wo-phone")||{}).value);
  if(!/^[6-9]\d{9}$/.test(p)){_woCust=null;if(box)box.innerHTML="";return;}
  _woLookupT=setTimeout(async()=>{
    if(!_adminPw){if(box)box.innerHTML="";return;}
    let data=_woCache[p];
    if(!data){
      if(box)box.innerHTML='<div class="wc-card wc-load">Checking this number…</div>';
      try{const r=await fetch(SB_FN_BASE+"admin-orders",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,action:"customerHistory",phone:p})});data=await r.json();if(data.error)throw new Error(data.error);_woCache[p]=data;}
      catch(e){if(box)box.innerHTML="";return;}
    }
    if(_normPhone((document.getElementById("wo-phone")||{}).value)!==p)return;   // number changed while we waited
    const list=data.orders||[];
    if(!list.length){_woCust={phone:p,count:0};box.innerHTML='<div class="wc-card wc-new">🆕 New customer — this will be their first order</div>';return;}
    const last=list[0]; const addrOrder=list.find(o=>_realAddr(o.address))||{};
    const sizes={};list.forEach(o=>(o.items||[]).forEach(i=>{if(i.size)sizes[i.size]=(sizes[i.size]||0)+(i.qty||1);}));
    const usual=Object.entries(sizes).sort((a,b)=>b[1]-a[1])[0];
    const nameNow=(last.customer_name||"").trim();
    _woCust={phone:p,count:list.length,name:nameNow,pin:last.pincode||addrOrder.pincode||"",addr:_realAddr(addrOrder.address)};
    const when=new Date(last.placed_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
    box.innerHTML=`<div class="wc-card wc-ret"><div class="wc-h">↩ Returning customer${nameNow?": <b>"+_dspEsc(nameNow)+"</b>":""}</div>
      <div class="wc-s">${list.length} order${list.length>1?"s":""} · ${inr((data.summary||{}).lifetimeSpend||0)} spent · last ${when} (${_dspEsc(last.channel||"website")})${usual?" · usually size <b>"+_dspEsc(usual[0])+"</b>":""}</div>
      <div class="wc-a"><button class="tb" onclick="woUseSaved(true)">Use saved details</button><button class="tb" onclick="showCustomerHistory('${p}')">Full history</button></div></div>`;
    woUseSaved(false);   // fill any EMPTY fields straight away; never overwrite what you typed
  },350);
}
function woUseSaved(overwrite){
  if(!_woCust)return;
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&v&&(overwrite||!e.value.trim()))e.value=v;};
  set("wo-name",_woCust.name);set("wo-pin",_woCust.pin);set("wo-addr",_woCust.addr);
}
function showCustomerHistory(phone){
  const i=document.getElementById("ch-phone"),n=document.getElementById("ch-name");
  if(!i)return; i.value=phone; if(n)n.value=""; lookupCustomer();
  const r=document.getElementById("ch-result"); if(r)r.scrollIntoView({behavior:"smooth",block:"center"});
}
/* ===== ADMIN: LOG A WHATSAPP ORDER (added 2026-09-03) =====
   The orders table only ever received Razorpay checkouts, so WhatsApp sales
   were invisible to sold counts and to the dispatch map. This writes a real
   row with source='whatsapp' and status='fulfilled'. */
function fillWoProducts(){
  // Was a single global <select id="wo-prod">; now each article line has
  // its own dropdown built from this same sorted list. Kept as a function
  // in case a call site still expects it, but the real population happens
  // per-line in woLineHTML().
  woProdOptions=[...products].sort((a,b)=>(a.name||"").localeCompare(b.name||""))
    .map(p=>'<option value="'+String(p.id).replace(/"/g,"")+'">'+_dspEsc(p.name)+'</option>').join("");
  if(!document.getElementById("wo-lines").children.length)woAddLine();
}
let woProdOptions="";
let woLineSeq=0;
/* One offline sale can be several different articles for the same
   customer (e.g. 4 different jeans in one WhatsApp order) — previously
   that meant 4 separate "orders" that couldn't be tracked or looked up
   together. Each line below becomes one item in ONE order. */
function woLineHTML(id){
  return `<div class="wo-line" data-id="${id}" style="display:grid;grid-template-columns:1fr 70px 55px 90px 30px;gap:8px;align-items:end;margin-bottom:8px">
    <div><label style="font-size:10px;color:var(--off);display:block;margin-bottom:3px">Product</label><select id="wo-prod-${id}">${woProdOptions}</select></div>
    <div><label style="font-size:10px;color:var(--off);display:block;margin-bottom:3px">Size</label><input type="text" id="wo-size-${id}" placeholder="32"/></div>
    <div><label style="font-size:10px;color:var(--off);display:block;margin-bottom:3px">Qty</label><input type="number" id="wo-qty-${id}" value="1" min="1" oninput="woRecalcTotal()"/></div>
    <div><label style="font-size:10px;color:var(--off);display:block;margin-bottom:3px">Amount (₹)</label><input type="number" id="wo-lt-${id}" placeholder="1099" oninput="woRecalcTotal()"/></div>
    <button class="tb tb-del" style="padding:9px 6px" onclick="woRemoveLine(${id})" title="Remove">×</button>
  </div>`;
}
function woAddLine(){
  const wrap=document.getElementById("wo-lines");if(!wrap)return;
  woLineSeq++;
  wrap.insertAdjacentHTML("beforeend",woLineHTML(woLineSeq));
  woRecalcTotal();
}
function woRemoveLine(id){
  const wrap=document.getElementById("wo-lines");
  const el=wrap&&wrap.querySelector(`.wo-line[data-id="${id}"]`);
  if(el)el.remove();
  // Never leave zero lines — a form with nothing to log invites confusion
  // about whether the last item silently vanished.
  if(wrap&&!wrap.children.length)woAddLine();
  woRecalcTotal();
}
function woRecalcTotal(){
  const wrap=document.getElementById("wo-lines");if(!wrap)return;
  let total=0;
  wrap.querySelectorAll(".wo-line").forEach(line=>{
    const id=line.dataset.id;
    total+=Number((document.getElementById("wo-lt-"+id)||{}).value)||0;
  });
  const el=document.getElementById("wo-grandtotal");
  if(el)el.textContent=inr(total);
}
async function saveWhatsappOrder(){
  const msg=document.getElementById("wo-msg");
  const g=id=>(document.getElementById(id)||{}).value||"";
  const name=g("wo-name").trim(), phone=g("wo-phone").trim(), pin=g("wo-pin").trim(), address=g("wo-addr").trim();
  const channel=g("wo-channel")||"whatsapp", paymentMode=g("wo-paymode")||"cash";
  function fail(t){if(msg){msg.textContent="\u2717 "+t;msg.style.color="#C0392B";}}
  if(!name)return fail("Customer name is required.");
  if(pin&&!/^[1-9][0-9]{5}$/.test(pin))return fail("Pincode must be 6 digits and not start with 0.");
  if(!_adminPw)return fail("Admin session expired — refresh and log in again.");

  const wrap=document.getElementById("wo-lines");
  const lineEls=wrap?[...wrap.querySelectorAll(".wo-line")]:[];
  if(!lineEls.length)return fail("Add at least one article.");
  const items=[];
  for(const line of lineEls){
    const id=line.dataset.id;
    const pid=g("wo-prod-"+id), size=g("wo-size-"+id).trim();
    const qty=Math.max(1,parseInt(g("wo-qty-"+id),10)||1);
    const total=parseFloat(g("wo-lt-"+id))||0;
    const p=products.find(x=>x.id===pid);
    if(!p)return fail("Pick a product for every article line.");
    if(total<=0)return fail(`Enter the amount paid for ${p.name}.`);
    items.push({productId:p.id,size,qty,total});
  }

  if(msg){msg.textContent="Saving\u2026";msg.style.color="";}
  try{
    const res=await fetch(SB_FN_BASE+"log-sale",{
      method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY,"Authorization":"Bearer "+SB_APIKEY},
      body:JSON.stringify({action:"log",password:_adminPw,items,
        channel,paymentMode,customerName:name,phone,pincode:pin,address})
    });
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    // A gateway-level rejection (missing/bad auth) comes back as {code,message},
    // not {error} -- never treat that shape as a successful save.
    if(!res.ok||!data.order_id)throw new Error(data.message||("Server did not confirm the save (HTTP "+res.status+"). Nothing was logged -- please retry."));
    const n=data.items_logged||items.length;
    const prev=_woCust&&_woCust.phone===_normPhone(phone)?_woCust.count:0;
    if(msg){msg.textContent="\u2713 Logged "+data.order_id+" \u2014 "+n+" article"+(n>1?"s":"")+" on one order, "+inr(data.total)+" total."+(prev?" Added to "+name+"'s history (order "+(prev+1)+").":" New customer saved.");msg.style.color="#2ecc71";}
    ["wo-name","wo-phone","wo-pin","wo-addr"].forEach(i=>{const e=document.getElementById(i);if(e)e.value="";});
    _woCust=null;const wc=document.getElementById("wo-cust");if(wc)wc.innerHTML="";
    delete _woCache[_normPhone(phone)];   // this sale changes their history — never answer this phone from the pre-sale cache again
    wrap.innerHTML="";woAddLine();
    if(typeof loadDispatchStats==="function")loadDispatchStats();
    if(typeof loadOrdersFromSupabase==="function")loadOrdersFromSupabase();
  }catch(e){fail(e.message||"Could not reach the logging service. Try again.");}
}
const _PAY_FAIL_LABEL={closed:"Closed payment screen",timeout:"UPI timed out",unsupported:"UPI app not supported",funds:"Low balance / limit",pin:"Wrong UPI PIN",bank:"Bank didn't respond",failed:"Payment failed",unknown:"Payment failed"};
async function admLogin(){if(locked){shAErr("Locked. Run: localStorage.removeItem('adm_lk') in console.");return;}const e=document.getElementById("age").value.trim();const pw=document.getElementById("agp").value;const h=await sha256(pw);if(e===AE&&h===AH){_adminPw=pw;window._adminEmail=e;document.getElementById("ag").style.display="none";document.getElementById("ap").style.display="block";attCnt=0;LS.set("adm_att",0);LS.set("adm_lk",false);
    await loadFromSupabaseIfAvailable();
    ldProds();apSts();rnAdmRev();loadSiteEd();loadFitsAdmin();loadBannerAdmin();loadPaletteAdmin();loadGlobalScAdmin();}else{attCnt++;LS.set("adm_att",attCnt);const left=MA-attCnt;if(left<=0){locked=true;LS.set("adm_lk",true);shAErr("Locked.");}else shAErr(`Wrong — ${left} left.`);document.getElementById("agatt").textContent=`${attCnt}/${MA}`;}}
function shAErr(t){const e=document.getElementById("agerr");e.textContent=t;e.style.display="block";}
function admOut(){document.getElementById("ap").style.display="none";unlockScroll();location.href="/";}
function _woHook(t){if(t==="orders"&&typeof fillWoProducts==="function")fillWoProducts();}
function setAdminTheme(t){
  const ap=document.getElementById("ap");
  if(ap)ap.dataset.theme=t;
  try{localStorage.setItem("ds_admin_theme",t);}catch(e){}
  document.querySelectorAll(".theme-swatch").forEach(b=>b.classList.toggle("on",b.dataset.theme===t));
}
(function(){
  let saved="light";
  try{
    // one-time switch to the new Clean Light admin (2026-10-02); any later choice in Settings sticks
    if(!localStorage.getItem("ds_admin_theme_v2")){localStorage.setItem("ds_admin_theme_v2","1");localStorage.setItem("ds_admin_theme","light");}
    saved=localStorage.getItem("ds_admin_theme")||"light";
  }catch(e){}
  // admin.js loads after the page, so DOMContentLoaded has already fired
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setAdminTheme(saved);});else setAdminTheme(saved);
})();
function apTab(t){{const _ap=document.getElementById("ap");if(_ap)_ap.classList.toggle("lf-wide",t==="lifeline");}const all=["lifeline","products","dashboard","sequence","orders","add","site","banner","vault","wall","fits","reviews","stories","instagrid","faq","sizeguide","payment","settings"];all.forEach(id=>{const e=document.getElementById("tab-"+id);if(e)e.style.display=id===t?"block":"none";});document.querySelectorAll(".atab").forEach((b,i)=>b.classList.toggle("act",all[i]===t));if(t==="products"){ldProds();apSts();}if(t==="payment"){loadPaySettings();}if(t==="dashboard"){renderDashboard();}if(t==="sequence"){renderSequenceList();}if(t==="sizeguide"){renderSizeModelsList();}if(t==="vault"){loadVaultAdmin();}if(t==="wall"){loadWallAdmin();}
  if(t==="dashboard"){loadOrdersFromSupabase().then(()=>renderDashboard());}
  if(t==="orders"){rnAdmOrders();loadOrdersFromSupabase().then(ok=>{if(ok)rnAdmOrders();});loadAbandonedCount();_woHook("orders");}if(t==="reviews")rnAdmRev();if(t==="site")loadSiteEd();if(t==="fits")loadFitsAdmin();if(t==="settings"){loadPaletteAdmin();loadGlobalScAdmin();rnStorageView();}if(t==="banner")loadBannerAdmin();if(t==="stories")renderStoryAdmin();if(t==="instagrid")renderHeroGridAdmin();if(t==="faq")renderFaqAdmin();if(t==="sizeguide")renderSizeGuideAdmin();}
function apSts(){const tot=products.length,sold=products.filter(p=>p.badges&&p.badges.includes("sold")).length,cats=[...new Set(products.map(p=>p.category))].length;document.getElementById("apstats").innerHTML=`<div class="apstat"><div class="v">${tot}</div><div class="k">Total</div></div><div class="apstat"><div class="v">${tot-sold}</div><div class="k">Active</div></div><div class="apstat"><div class="v">${sold}</div><div class="k">Sold Out</div></div><div class="apstat"><div class="v">${cats}</div><div class="k">Categories</div></div>`;}
function ldProds(){
  document.getElementById("pcnt").textContent=`(${products.length})`;
  try{renderStockAlert();}catch(e){}
  document.getElementById("ptbd").innerHTML=products.map(p=>{const sold=p.badges&&p.badges.includes("sold");return`<tr><td><img src="${(p.images||[])[0]||''}" alt="${p.name}"/></td><td><b style="color:var(--white)">${p.name}</b></td><td>${p.category}</td><td>${p.fit||''}</td><td>${p.offerPrice?`<b style="color:var(--white)">${inr(p.offerPrice)}</b> <s style="color:var(--off);font-size:11px">${inr(p.price)}</s>`:inr(p.price)}</td><td>${stockCell(p)}</td><td><span class="bdg ${sold?'adm-soldout':'adm-active'}">${sold?'Sold Out':'Active'}</span></td><td><div class="tba"><button class="tb" onclick="editP('${p.id}')">Edit</button><button class="tb" onclick="editStock('${p.id}')">Stock</button><button class="tb" onclick="manageSizes('${p.id}')" style="color:#a0d060;border-color:rgba(160,208,96,.3)">Sizes</button><button class="tb tb-sold" onclick="togSold('${p.id}')">${sold?'Restock':'Mark Sold'}</button>${sold?`<button class="tb" onclick="setRestockDate('${p.id}')" style="color:#7ab0e0;border-color:rgba(122,176,224,.3)">Restock Date</button>`:''}<button class="tb tb-del" onclick="delP('${p.id}')">Delete</button></div></td></tr>`;}).join("");
}
function togSold(id){const p=products.find(x=>x.id===id);if(!p)return;if(!p.badges)p.badges=[];if(p.badges.includes("sold")){p.badges=p.badges.filter(b=>b!=="sold");p.restockAt='';}else p.badges.push("sold");LS.set("ds_p",products);renderGrid();ldProds();apSts();syncProductToSupabase("save",p);}
function delP(id){if(!confirm("Delete? Cannot be undone."))return;products=products.filter(p=>p.id!==id);LS.set("ds_p",products);renderGrid();ldProds();apSts();syncProductToSupabase("delete",{id});}
function editP(id){const p=products.find(x=>x.id===id);if(!p)return;editId=id;setTimeout(()=>{try{pfStockLoad(p);}catch(e){}},0);document.getElementById("pf0").value=p.name;document.getElementById("pf1").value=p.category;populateFitSelect();document.getElementById("pf-fit").value=p.fit||"Baggy";document.getElementById("pf2").value=p.price;document.getElementById("pf3").value=p.offerPrice||"";document.getElementById("pf4").value=p.desc;document.getElementById("pf-desc2").value=p.desc2||"";document.getElementById("pf5").value=(p.sizes||[]).join("|");document.getElementById("pf6").value=(p.colors||[]).join("|");document.getElementById("pf7").value=(p.badges||[]).filter(b=>b!=="sold")[0]||"";const pfStoryEl=document.getElementById("pf-story");if(pfStoryEl)pfStoryEl.value=p.story||"";document.getElementById("pf8").value=p.order||1;document.getElementById("pf-reel").value=p.reelUrl||"";document.getElementById("pf-video").value=p.videoUrl||"";document.getElementById("pf-soldcount").value=p.soldCount||"";_pfShade=p.shade||"";renderShadePicker();populateSgModelOptions(p.sizeGuideMode);document.getElementById("pf-sg-mode").value=p.sizeGuideMode||"default";onSgModeChange();document.getElementById("pf-fitstudio").checked=!!p.fitStudioEnabled;if(p.sizeGuideMode==="custom"&&Array.isArray(p.customSizeGuide)&&p.customSizeGuide.length){renderPfSgCustom(p.customSizeGuide.map(r=>({...r})));}pendingImgs=[...(p.images||[])];renderThumbs();if(p.sizeChartImg){document.getElementById("pf-scimg").value=p.sizeChartImg;document.getElementById("sc-prv").innerHTML=`<img src="${p.sizeChartImg}" style="width:120px;border-radius:7px" alt="Size chart"/>`;}document.getElementById("add-title").textContent="EDIT PRODUCT";apTab("add");}
function resetF(){setTimeout(()=>{try{pfStockLoad(null);}catch(e){}},0);editId=null;_pfShade="";if(typeof renderShadePicker==="function")renderShadePicker();["pf0","pf2","pf3","pf4","pf-desc2","pf5","pf6","pf-reel","pf-video","pf-scimg","pf-imgurls","pf-soldcount","pf-story"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=""});document.getElementById("pf7").value="new";document.getElementById("pf8").value=1;populateSgModelOptions("default");const sgSel=document.getElementById("pf-sg-mode");if(sgSel)sgSel.value="default";const fsChk=document.getElementById("pf-fitstudio");if(fsChk)fsChk.checked=false;const sgWrap=document.getElementById("pf-sg-custom");if(sgWrap){sgWrap.style.display="none";sgWrap.dataset.rows="";}pendingImgs=[];renderThumbs();document.getElementById("sc-prv").innerHTML="";document.getElementById("add-title").textContent="ADD NEW PRODUCT";const m=document.getElementById("pf-msg");if(m)m.style.display="none";}
let pendingImgs=[];
function handleImgs(inp){const files=[...inp.files].slice(0,5-pendingImgs.length);files.forEach(f=>{if(pendingImgs.length>=5)return;
  const slot=pendingImgs.length;pendingImgs.push("__uploading__");renderThumbs();
  (async()=>{
    try{
      const bf=await toBrowserFile(f);
      const compressed=await compressImg(bf,800,0.75);
      const d=await uploadToR2(compressed,"products");
      pendingImgs[slot]=d;
    }catch(e){
      pendingImgs[slot]="__error__";
      shPMsg("Couldn't read \""+(f.name||"that image")+"\" — try saving it as JPEG/PNG first.","#c0392b");
    }
    renderThumbs();
  })();
});inp.value="";}
function addImgUrls(){
  const ta=document.getElementById("pf-imgurls");if(!ta)return;
  const raw=ta.value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  if(!raw.length){shPMsg("Paste at least one image link first.","#c0392b");return;}
  let added=0,bad=0,full=false;
  raw.forEach(u=>{
    if(pendingImgs.length>=5){full=true;return;}
    if(!/^https?:\/\/.+/i.test(u)){bad++;return;}
    if(pendingImgs.includes(u))return;
    pendingImgs.push(u);added++;
  });
  renderThumbs();ta.value="";
  let msg=added+" image"+(added===1?"":"s")+" added";
  if(full)msg+=" · max 5 reached";
  if(bad)msg+=" · "+bad+" skipped (not a valid link)";
  shPMsg(msg,added?"#4ade80":"#c0392b");
}
function renderThumbs(){document.getElementById("ithumbs").innerHTML=pendingImgs.map((s,i)=>{
  if(s==="__uploading__")return `<div class="ithm" style="display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--off)">↑…</div>`;
  if(s==="__error__")return `<div class="ithm" style="display:flex;align-items:center;justify-content:center;font-size:16px;color:#c0392b">✗<button class="irm" onclick="rmPI(${i})">×</button></div>`;
  return `<div class="ithm${i===0?' main-tag':''}"><img src="${s}" alt="Preview"/><button class="irm" onclick="rmPI(${i})">×</button></div>`;
}).join("");}
function rmPI(i){pendingImgs.splice(i,1);renderThumbs();}
async function scImgUpload(inp){if(!inp.files||!inp.files[0])return;const f=inp.files[0];try{const bf=await toBrowserFile(f);let d=await compressImg(bf,1800,undefined,'png');document.getElementById("sc-prv").innerHTML=`<img src="${d}" style="width:120px;border-radius:7px;margin-top:8px" alt="Uploading..."/>`;d=await uploadToR2(d,"sizecharts");document.getElementById("pf-scimg").value=d;document.getElementById("sc-prv").innerHTML=`<img src="${d}" style="width:120px;border-radius:7px;margin-top:8px" alt="Uploaded preview"/>`;}catch(e){shPMsg("Couldn't read that size chart image — try JPEG/PNG.","#c0392b");}}
/* Uploads a base64 image to R2 via the admin-r2-upload Edge Function and returns
   the public R2 URL. R2 credentials never touch this file — they live server-side
   as Edge Function secrets. Falls back to keeping the base64 locally (with a
   warning toast) if the upload fails, so admin work is never silently lost. */
async function uploadToR2(dataUri,folder){
  if(!dataUri||!dataUri.startsWith("data:"))return dataUri;// already a URL, nothing to do
  if(!_adminPw){showToast("⚠️ Not logged in — image kept locally only.",false);return dataUri;}
  try{
    const res=await fetch(SB_FN_BASE+"admin-r2-upload",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,dataUri,folder:folder||"uploads"})
    });
    const data=await res.json();
    if(data.error){showToast("⚠️ R2 upload failed, kept locally: "+data.error,false);return dataUri;}
    return data.url;
  }catch(e){
    showToast("⚠️ R2 upload failed (network), kept locally.",false);
    return dataUri;
  }
}
async function _callAdminFn(fnName,payload){
  if(!_adminPw){showToast("⚠️ Saved locally, but couldn't sync live — please log in again to enable live sync.",false);return null;}
  try{
    const res=await fetch(SB_FN_BASE+fnName,{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,...payload})
    });
    const data=await res.json();
    if(data.error){showToast("⚠️ Saved locally, but live sync failed: "+data.error,false);return null;}
    showToast("✓ Synced live — visitors see this now.",true);
    return data;
  }catch(e){
    showToast("⚠️ Saved locally, but live sync failed (network error).",false);
    return null;
  }
}
async function syncProductToSupabase(action,product){return _callAdminFn("admin-products",{action,product});}
async function syncSiteToSupabase(){return _callAdminFn("admin-site",{content:siteContent});}
async function syncSettingsToSupabase(table,content){return _callAdminFn("admin-settings",{table,content});}
async function syncStoryToSupabase(action,story){return _callAdminFn("admin-stories",{action,story});}
async function syncReviewToSupabase(action,review){return _callAdminFn("admin-reviews",{action,review});}
async function cleanupProductStorage(){
  const m=document.getElementById('cleanup-msg');
  const needsCleanup=products.filter(p=>{
    const imgs=p.images||[];
    return imgs.some(i=>i&&i.startsWith('data:'))||(p.sizeChartImg&&p.sizeChartImg.startsWith('data:'));
  });
  if(!needsCleanup.length){
    m.textContent='Nothing to clean up — all products already use lightweight links ✓';
    m.style.color='#4ade80';m.style.background='rgba(74,222,128,.08)';m.style.display='block';
    return;
  }
  m.style.color='#aaa';m.style.background='rgba(255,255,255,.04)';m.style.display='block';
  let done=0;
  for(const p of needsCleanup){
    m.textContent=`Cleaning up ${p.name} (${done+1}/${needsCleanup.length})...`;
    try{
      const res=await syncProductToSupabase("save",p);
      if(res&&res.images){
        p.images=res.images;
        if(res.sizeChartImg)p.sizeChartImg=res.sizeChartImg;
        products=products.map(x=>x.id===p.id?p:x);
        LS.set("ds_p",products);
      }
    }catch(e){}
    done++;
  }
  renderGrid();rnStorageView();
  m.textContent=`Done — cleaned up ${done} product(s). Storage usage updated above ✓`;
  m.style.color='#4ade80';m.style.background='rgba(74,222,128,.08)';
}
function populateSgModelOptions(selected){
  const grp=document.getElementById("pf-sg-models-group");
  if(!grp)return;
  grp.innerHTML=(sizeModels||[]).map(m=>
    `<option value="model:${m.id}"${selected==="model:"+m.id?" selected":""}>${(m.name||m.id).replace(/</g,"&lt;")}</option>`
  ).join("");
}
function onSgModeChange(){
  const mode=document.getElementById("pf-sg-mode").value;
  const wrap=document.getElementById("pf-sg-custom");
  const preview=document.getElementById("pf-sg-model-preview");
  if(!wrap)return;
  if(mode.indexOf("model:")===0){
    wrap.style.display="none";
    if(preview){
      const model=(sizeModels||[]).find(m=>"model:"+m.id===mode);
      preview.style.display="block";
      preview.innerHTML=model&&model.rows&&model.rows.length
        ?`<b style="color:var(--white)">${model.name}</b><br>`+model.rows.map(r=>`${r.size}" — waist ${r.waist}" — ${r.bestFor||""}`).join("<br>")
        :"This model has no size rows yet — add them in Admin → Size Models.";
    }
    return;
  }
  if(preview)preview.style.display="none";
  if(mode!=="custom"){wrap.style.display="none";return;}
  wrap.style.display="block";
  if(!wrap.dataset.rows){
    // seed from the current fit's admin default so there's a sane starting point to edit
    const fit=document.getElementById("pf-fit").value;
    const seed=(sizeGuide[fit]||[{size:"28",waist:"28",bestFor:"Best for waists 27-30"}]).map(r=>({...r}));
    wrap.dataset.rows="1";
    renderPfSgCustom(seed);
  }
}
function renderPfSgCustom(rows){
  const wrap=document.getElementById("pf-sg-custom");if(!wrap)return;
  const DARK='background:#141312;color:#F8F7F4;border:1px solid rgba(255,255,255,.18);border-radius:8px';
  window._pfSgRows=rows;
  wrap.innerHTML=`<small style="color:var(--off);display:block;margin-bottom:8px">Custom size table for this product only:</small>`
    +rows.map((r,i)=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <input value="${r.size}" placeholder="Size" style="width:60px;padding:6px;text-align:center;${DARK}" onchange="window._pfSgRows[${i}].size=this.value"/>
      <input value="${r.waist}" placeholder="Waist" style="width:70px;padding:6px;text-align:center;${DARK}" onchange="window._pfSgRows[${i}].waist=this.value"/>
      <input value="${r.bestFor}" placeholder="Best for waists..." style="flex:1;padding:6px;${DARK}" onchange="window._pfSgRows[${i}].bestFor=this.value"/>
      <button class="tb tb-del" onclick="window._pfSgRows.splice(${i},1);renderPfSgCustom(window._pfSgRows);">×</button>
    </div>`).join("")
    +`<button class="btn btn-w" style="font-size:11px;padding:4px 10px;margin-top:4px" onclick="window._pfSgRows.push({size:'',waist:'',bestFor:''});renderPfSgCustom(window._pfSgRows);">+ Add Size</button>`;
}
function readPfSgCustomRows(){
  return (window._pfSgRows||[]).filter(r=>r.size&&r.waist);
}
/* ===== INVENTORY (stock per size) =====
   Counts live in products.stock ({ "28": 5, ... }). The DATABASE deducts on every
   paid / logged sale and adds back on cancel / delete / edit, and keeps sold-out in
   sync — so this screen only ever SETS the physical count (admin-products setStock),
   and only when you actually changed a number. */
let _pfStockOrig="null";
function _pfSizes(){return String(document.getElementById("pf5").value||"").split("|").map(x=>x.trim()).filter(Boolean);}
function _pfStockRead(){
  if(!document.getElementById("pf-stock-on").checked)return null;
  const out={};
  document.querySelectorAll("#pf-stock-grid input[data-size]").forEach(i=>{const v=parseInt(i.value,10);out[i.dataset.size]=Number.isFinite(v)&&v>0?v:0;});
  return out;
}
function pfStockRender(prefill){
  const on=document.getElementById("pf-stock-on").checked, grid=document.getElementById("pf-stock-grid"), hint=document.getElementById("pf-stock-hint");
  const keep={};grid.querySelectorAll("input[data-size]").forEach(i=>keep[i.dataset.size]=i.value);
  const src=prefill||keep, sizes=_pfSizes();
  grid.hidden=!on;
  grid.innerHTML=sizes.length?sizes.map(z=>`<label class="stk-cell"><span>${_dspEsc(z)}</span><input type="number" min="0" step="1" inputmode="numeric" data-size="${_dspEsc(z)}" value="${src[z]!=null&&src[z]!==""?_dspEsc(String(src[z])):""}" placeholder="0" oninput="pfStockTotals()"></label>`).join(""):`<div class="stk-note">Add sizes above first (e.g. 28|30|32).</div>`;
  hint.innerHTML=on?`Enter what's on your shelf <b>right now</b>. Don't count pieces already sold but not yet shipped. From here on, every sale, cancellation and walk-in is counted automatically.<span id="pf-stock-total"></span>`:`Not tracked — sizes sell out only when you mark them sold out manually.`;
  pfStockTotals();
}
function pfStockTotals(){const t=document.getElementById("pf-stock-total");if(!t)return;const s=_pfStockRead();if(!s){t.textContent="";return;}const n=Object.values(s).reduce((a,b)=>a+b,0);t.innerHTML=` <b class="stk-tot">Total: ${n} piece${n===1?"":"s"}</b>`;}
function pfStockLoad(p){
  const st=p&&p.stock&&typeof p.stock==="object"?p.stock:null;
  document.getElementById("pf-stock-on").checked=!!st;
  document.getElementById("pf-stock-grid").innerHTML="";
  pfStockRender(st||{});
  _pfStockOrig=JSON.stringify(_pfStockRead());
  const h=document.getElementById("pf-stock-hist");
  h.innerHTML=p&&p.id&&products.some(x=>x.id===p.id)?`<button type="button" class="tb" onclick="pfStockHistory('${_dspEsc(p.id)}')">📜 Stock history</button><div id="pf-stock-hist-list"></div>`:"";
}
async function pfStockPush(id,stock){
  try{
    const r=await fetch(SB_FN_BASE+"admin-products",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,action:"setStock",product:{id},stock})});
    const d=await r.json();if(d.error)throw new Error(d.error);
    products=products.map(x=>x.id===id?{...x,stock:d.stock,oosizes:d.oosizes||x.oosizes}:x);
    LS.set("ds_p",products);try{ldProds();renderGrid();}catch(e){}
    showToast(stock?`Stock saved ✓ (${d.logged} change${d.logged===1?"":"s"} logged)`:"Stock tracking turned off",true);
  }catch(e){showToast("⚠️ Stock not saved — "+e.message,false);}
}
async function pfStockHistory(id){
  const box=document.getElementById("pf-stock-hist-list");if(!box)return;box.innerHTML='<div class="stk-note">Loading…</div>';
  try{
    const r=await fetch(SB_FN_BASE+"admin-products",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,action:"movements",product:{id}})});
    const d=await r.json();if(d.error)throw new Error(d.error);
    box.innerHTML=d.movements.length?`<table class="stk-hist"><thead><tr><th>When</th><th>Size</th><th>Change</th><th>Left</th><th>Why</th></tr></thead><tbody>${d.movements.map(m=>`<tr><td>${_dspEsc(new Date(m.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}))}</td><td>${_dspEsc(m.size)}</td><td class="${m.delta<0?"neg":"pos"}">${m.delta>0?"+":""}${m.delta}</td><td>${_dspEsc(m.stock_after)}</td><td>${_dspEsc(m.reason)}${m.order_id?` · <a onclick="lfOpen('${_dspEsc(m.order_id)}')">${_dspEsc(m.order_id)}</a>`:""}</td></tr>`).join("")}</tbody></table>`:'<div class="stk-note">No stock changes yet.</div>';
  }catch(e){box.innerHTML=`<div class="stk-note">Couldn't load history — ${_dspEsc(e.message)}</div>`;}
}
function editStock(id){editP(id);setTimeout(()=>{const b=document.getElementById("pf-stock-box");if(b){b.scrollIntoView({behavior:"smooth",block:"center"});b.classList.add("stk-flash");setTimeout(()=>b.classList.remove("stk-flash"),1600);if(!document.getElementById("pf-stock-on").checked){document.getElementById("pf-stock-on").checked=true;pfStockRender();}const i=b.querySelector("input[data-size]");if(i)i.focus();}},250);}
function stockCell(p){
  if(!p.stock||typeof p.stock!=="object")return '<span class="stk-un">Not tracked</span>';
  const sizes=(p.sizes&&p.sizes.length?p.sizes:Object.keys(p.stock)).filter(z=>z in p.stock);
  const total=sizes.reduce((a,z)=>a+Math.max(0,+p.stock[z]||0),0);
  return `<div class="stk-chips">${sizes.map(z=>{const n=+p.stock[z]||0;return `<span class="stk-chip ${n<0?"over":n===0?"zero":n<=2?"low":""}" title="${n<0?"Oversold by "+(-n):n===0?"Sold out":n+" left"}">${_dspEsc(z)}<b>${n}</b></span>`;}).join("")}</div><small class="stk-sum">${total} in stock</small>`;
}
function renderStockAlert(){
  const el=document.getElementById("stk-alert");if(!el)return;
  const low=[],over=[];
  products.forEach(p=>{if(!p.stock)return;Object.entries(p.stock).forEach(([z,n])=>{n=+n||0;if(n<0)over.push(`${p.name} ${z} (${n})`);else if(n<=2)low.push({t:`${p.name} · ${z}`,n,id:p.id});});});
  if(!low.length&&!over.length){el.innerHTML="";return;}
  el.innerHTML=`<div class="stk-alert">${over.length?`<div><b>⚠️ Oversold:</b> ${over.map(_dspEsc).join(", ")} — sold more than you had; check the shelf.</div>`:""}${low.length?`<div><b>Low stock:</b> ${low.sort((a,b)=>a.n-b.n).map(x=>`<a onclick="editStock('${_dspEsc(x.id)}')">${_dspEsc(x.t)} <b>${x.n===0?"sold out":x.n+" left"}</b></a>`).join(" · ")}</div>`:""}</div>`;
}
function saveProd(){
  const name=document.getElementById("pf0").value.trim();const price=Number(document.getElementById("pf2").value);
  if(!name||!price){shPMsg("Fill in Name & Price.","#c0392b");return;}
  if(pendingImgs.includes("__uploading__")){shPMsg("Still processing your photos — wait a second and hit Save again.","#c0392b");return;}
  const cleanImgs=pendingImgs.filter(s=>s&&s!=="__error__");
  if(!cleanImgs.length){shPMsg("Upload at least one image.","#c0392b");return;}
  const offer=document.getElementById("pf3").value?Number(document.getElementById("pf3").value):null;
  const badge=document.getElementById("pf7").value;
  const soldCountVal=parseInt(document.getElementById("pf-soldcount").value)||0;
  const sgMode=document.getElementById("pf-sg-mode").value;
  const customSizeGuide=sgMode==="custom"?readPfSgCustomRows():undefined;
  const prod={id:editId||("P-"+uid()),name,category:document.getElementById("pf1").value,fit:document.getElementById("pf-fit").value,price,offerPrice:offer,images:[...cleanImgs],sizeChartImg:document.getElementById("pf-scimg").value||"",shade:_pfShade||"",badges:badge?[badge]:[],sizes:document.getElementById("pf5").value.split("|").map(s=>s.trim()).filter(Boolean),colors:document.getElementById("pf6").value.split("|").map(c=>c.trim()).filter(Boolean)||["As shown"],desc:document.getElementById("pf4").value.trim(),desc2:document.getElementById("pf-desc2").value.trim(),story:(document.getElementById("pf-story")?document.getElementById("pf-story").value:"").trim(),shippingInfo:"Delivery in 3-5 working days · Free shipping all over India · Only damaged or defective items can be returned · Unboxing video required for all return claims · Size exchange available for ₹200 fee · Item must be returned in original condition · Check size before ordering",reelUrl:document.getElementById("pf-reel").value.trim(),videoUrl:document.getElementById("pf-video").value.trim(),features:[],order:Number(document.getElementById("pf8").value)||99,soldCount:soldCountVal,sizeGuideMode:sgMode,customSizeGuide:customSizeGuide,fitStudioEnabled:document.getElementById("pf-fitstudio").checked,addedAt:editId?(products.find(p=>p.id===editId)||{}).addedAt||Date.now():Date.now()};
  const wasEdit=!!editId;
  const _oldStock=(editId&&(products.find(x=>x.id===editId)||{}).stock)||null;
  const _newStock=_pfStockRead(), _stockChanged=JSON.stringify(_newStock)!==_pfStockOrig;
  if(_newStock){const bad=Object.keys(_newStock).length===0;if(bad){shPMsg("Add sizes before tracking stock.","#c0392b");return;}}
  prod.stock=_stockChanged?_newStock:_oldStock;
  if(editId)products=products.map(p=>p.id===editId?prod:p);else products.unshift(prod);
  LS.set("ds_p",products);renderGrid();renderHeroShowcase();
  const okMsg=wasEdit?"Updated ✓ — saved to this device.":"Product added ✓ — saved to this device.";
  shPMsg(okMsg,"#4ade80");showToast(okMsg+" Syncing live...",true);
  syncProductToSupabase("save",prod).then(res=>{
    if(res&&res.oosizes){prod.oosizes=res.oosizes;}
    if(_stockChanged&&res&&res.success!==false)pfStockPush(prod.id,_newStock);
    if(res&&res.images){
      prod.images=res.images;
      if(res.sizeChartImg)prod.sizeChartImg=res.sizeChartImg;
      products=products.map(p=>p.id===prod.id?prod:p);
      LS.set("ds_p",products);renderGrid();
    }
  });
  // supplementary write — the main admin-products function's field list predates
  // sold count / size guide mode, so it's been silently dropping these on save.
  // This calls a dedicated function that writes only these three fields directly.
  syncProductMeta(prod);
  setTimeout(()=>{resetF();apTab("products");},1800);
}
async function syncProductMeta(prod){
  if(!_adminPw)return;
  try{
    const res=await fetch(SB_FN_BASE+"admin-product-meta",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,id:prod.id,soldCount:prod.soldCount,shade:prod.shade,sizeGuideMode:prod.sizeGuideMode,customSizeGuide:prod.customSizeGuide,fitStudioEnabled:prod.fitStudioEnabled,videoUrl:prod.videoUrl})
    });
    const data=await res.json();
    if(data.error){showToast("⚠️ Colour / Sold Count / Size Guide didn't save: "+data.error,false);}
  }catch(e){showToast("⚠️ Colour / Sold Count / Size Guide didn't sync (network).",false);}
}
function shPMsg(t,c){const m=document.getElementById("pf-msg");m.textContent=t;m.style.color=c;m.style.background=c.includes("4a")?"rgba(74,222,128,.08)":"rgba(192,57,43,.08)";m.style.display="block";}
// SIZE MANAGEMENT
function manageSizes(id){const p=products.find(x=>x.id===id);if(!p)return;
  if(p.stock&&Object.keys(p.stock).length){showToast("This product tracks stock — a size sells out automatically at 0. Change the counts with the Stock button.",true);editStock(id);return;}if(!p.oosizes)p.oosizes=[];const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:18px';d.onclick=e=>{if(e.target===d)d.remove();};d.innerHTML='<div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:28px;max-width:460px;width:100%"><h3 style="font-family:var(--dsp);font-size:21px;margin-bottom:5px;color:var(--white)">SIZE AVAILABILITY</h3><p style="color:var(--off);font-size:13px;margin-bottom:18px">'+p.name+'</p><div id="sztog" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px"></div><button class="btn btn-w" onclick="this.closest(\'div[style]\').remove()" style="width:100%;justify-content:center">Done</button></div>';document.body.appendChild(d);renderSzTog(id);}
function setRestockDate(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:18px';
  d.onclick=e=>{if(e.target===d)d.remove();};
  let curVal='';
  if(p.restockAt){try{const dt=new Date(p.restockAt);if(!isNaN(dt))curVal=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);}catch(e){}}
  d.innerHTML='<div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:28px;max-width:440px;width:100%">'
    +'<h3 style="font-family:var(--dsp);font-size:21px;margin-bottom:5px;color:var(--white)">RESTOCK DATE</h3>'
    +'<p style="color:var(--off);font-size:13px;margin-bottom:18px">'+p.name+'</p>'
    +'<input type="datetime-local" id="rsd-input" value="'+curVal+'" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:12px;color:var(--white);font-size:14px;margin-bottom:8px"/>'
    +'<small style="color:var(--off);display:block;margin-bottom:18px">Shows a "Back in X" countdown on the sold-out card. Leave blank to remove the countdown.</small>'
    +'<div style="display:flex;gap:10px">'
    +'<button class="btn btn-g" id="rsd-clear" style="flex:1;justify-content:center">Clear</button>'
    +'<button class="btn btn-w" id="rsd-save" style="flex:1;justify-content:center">Save</button>'
    +'</div></div>';
  document.body.appendChild(d);
  document.getElementById('rsd-clear').onclick=function(){p.restockAt='';LS.set("ds_p",products);ldProds();if(typeof renderGrid==="function")renderGrid();if(typeof window.rebuildRestockCountdowns==="function")setTimeout(window.rebuildRestockCountdowns,80);syncProductToSupabase("save",p);d.remove();};
  document.getElementById('rsd-save').onclick=function(){
    const raw=document.getElementById('rsd-input').value;
    if(raw){const dt=new Date(raw);if(!isNaN(dt))p.restockAt=dt.toISOString();}
    else{p.restockAt='';}
    LS.set("ds_p",products);ldProds();if(typeof renderGrid==="function")renderGrid();if(typeof window.rebuildRestockCountdowns==="function")setTimeout(window.rebuildRestockCountdowns,80);syncProductToSupabase("save",p);d.remove();
  };
}
function renderSzTog(id){const p=products.find(x=>x.id===id);const c=document.getElementById('sztog');if(!c||!p)return;if(!p.sizeRestockDates)p.sizeRestockDates={};c.innerHTML=(p.sizes||[]).map(s=>{const oos=(p.oosizes||[]).includes(s);const restockVal=p.sizeRestockDates[s]||'';let dateInput='';if(oos){let curVal='';if(restockVal){try{const dt=new Date(restockVal);if(!isNaN(dt))curVal=dt.toISOString().slice(0,10);}catch(e){}}dateInput=`<div style="margin-top:6px"><input type="date" value="${curVal}" onchange="setSizeRestock('${id}','${s}',this.value)" style="width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:6px;padding:6px 8px;color:var(--white);font-size:12px" placeholder="Restock date"/><div style="color:var(--off);font-size:10px;margin-top:3px">${curVal?'Restocking '+new Date(curVal).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'No restock date set'}</div></div>`;}return'<div style="text-align:center"><button onclick="togOOS(\''+id+'\',\''+s+'\')" style="padding:12px 20px;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;border:2px solid '+(oos?'#c0392b':'#4ade80')+';background:'+(oos?'rgba(192,57,43,.1)':'rgba(74,222,128,.07)')+';color:'+(oos?'#c0392b':'#4ade80')+';width:100%">'+s+' '+(oos?'✗':'✓')+'</button>'+dateInput+'</div>';}).join('');}
function setSizeRestock(pid,size,val){const p=products.find(x=>x.id===pid);if(!p)return;if(!p.sizeRestockDates)p.sizeRestockDates={};if(val){p.sizeRestockDates[size]=new Date(val).toISOString();}else{delete p.sizeRestockDates[size];}LS.set("ds_p",products);syncProductToSupabase("save",p);renderSzTog(pid);}
function togOOS(pid,size){const p=products.find(x=>x.id===pid);if(!p)return;if(!p.oosizes)p.oosizes=[];if(!p.sizeRestockDates)p.sizeRestockDates={};if(p.oosizes.includes(size)){p.oosizes=p.oosizes.filter(s=>s!==size);delete p.sizeRestockDates[size];}else{p.oosizes.push(size);}LS.set("ds_p",products);renderGrid();renderSzTog(pid);syncProductToSupabase("save",p);}
function loadSiteEd(){const s=siteContent;const sv=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||"";};sv("site-ann",s.ann);sv("site-hero-h1",s.heroH1);sv("site-hero-sub",s.heroSub);{const pv=document.getElementById("site-product-view");if(pv)pv.value=s.productView==="modal"?"modal":"page";}sv("site-ed-h2",s.edH2);sv("site-ed-p",s.edP);sv("site-story-h2",s.storyH2);sv("site-story-p1",s.storyP1);sv("site-story-p2",s.storyP2);sv("site-trust",s.trust);sv("site-shipping",s.shipping);sv("site-marquee",s.marquee);sv("site-stats",s.stats);sv("site-phone",s.phone);sv("site-email",s.email);sv("site-address",s.address);sv("site-insta",s.insta);sv("site-fb",s.fb);sv("site-hero-img",s.heroImg);sv("site-hero-thumb1",s.heroThumb1);sv("site-hero-thumb2",s.heroThumb2);populateHeroProductSelect();const hpSel=document.getElementById("site-hero-product");if(hpSel)hpSel.value=s.heroP1||"";const ddEl=document.getElementById("site-drop-date");if(ddEl){if(s.dropDate){try{const d=new Date(s.dropDate);if(!isNaN(d))ddEl.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}catch(e){}}else{ddEl.value="";}}const vddEl=document.getElementById("site-vault-drop-date");if(vddEl){if(s.vaultDropDate){try{const d=new Date(s.vaultDropDate);if(!isNaN(d))vddEl.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}catch(e){}}else{vddEl.value="";}}if(s.edImg&&!(s.edImgs&&s.edImgs.length))s.edImgs=[s.edImg];if(s.stImg&&!(s.stImgs&&s.stImgs.length))s.stImgs=[s.stImg];renderGmgr("ed");renderGmgr("st");}
function populateHeroProductSelect(){const sel=document.getElementById("site-hero-product");if(!sel)return;const cur=sel.value;sel.innerHTML='<option value="">— Auto (bestseller / first live product) —</option>'+products.map(p=>`<option value="${p.id}">${(p.name||'').replace(/</g,'&lt;')}</option>`).join('');sel.value=cur;}
async function siteImgUp(k,inp){if(!inp.files||!inp.files[0])return;try{const bf=await toBrowserFile(inp.files[0]);let d=await compressImg(bf,800,0.75);document.getElementById('site-'+k+'-prv').innerHTML=`<img src="${d}" style="width:110px;border-radius:7px" alt="Uploading..."/>`;d=await uploadToR2(d,"site");document.getElementById('site-'+k+'-imgdata').value=d;document.getElementById('site-'+k+'-prv').innerHTML=`<img src="${d}" style="width:110px;border-radius:7px" alt="Uploaded preview"/>`;}catch(e){alert("Couldn't read that image — try a JPEG/PNG.");}}
function saveSite(){const _edI=siteContent.edImgs||[];const _stI=siteContent.stImgs||[];const _edS=siteContent.edImg||"";const _stS=siteContent.stImg||"";
  const prevSite=LS.get("ds_site",{});
  if((!_edI.length&&!_edS)&&((prevSite.edImgs||[]).length||(prevSite.edImg||""))){if(!confirm("Founder's Note image is empty. Save anyway? Re-upload in gallery if unintended."))return;}
  if((!_stI.length&&!_stS)&&((prevSite.stImgs||[]).length||(prevSite.stImg||""))){if(!confirm("Story image is empty. Save anyway? Re-upload in gallery if unintended."))return;}const g=id=>{const el=document.getElementById(id);return el?el.value:"";};const ddRaw=g("site-drop-date");let ddIso="";if(ddRaw){const d=new Date(ddRaw);if(!isNaN(d))ddIso=d.toISOString();}const vddRaw=g("site-vault-drop-date");let vddIso="";if(vddRaw){const d2=new Date(vddRaw);if(!isNaN(d2))vddIso=d2.toISOString();}siteContent=Object.assign({},siteContent,{productView:(g("site-product-view")==="modal"?"modal":"page"),faq:(siteContent.faq||faqItems),paymentConfig:(siteContent.paymentConfig||DEFAULT_PAY_CFG),sizeGuide:(siteContent.sizeGuide||sizeGuide),sizeModels:(siteContent.sizeModels||sizeModels),ann:g("site-ann"),heroH1:g("site-hero-h1"),heroSub:g("site-hero-sub"),heroP1:g("site-hero-product"),dropDate:ddIso,vaultDropDate:vddIso,trust:g("site-trust"),edH2:g("site-ed-h2"),edP:g("site-ed-p"),edImgs:_edI,stImgs:_stI,edImg:_edS,stImg:_stS,storyH2:g("site-story-h2"),storyP1:g("site-story-p1"),storyP2:g("site-story-p2"),shipping:g("site-shipping"),marquee:g("site-marquee"),stats:g("site-stats"),phone:g("site-phone"),email:g("site-email"),address:g("site-address"),insta:g("site-insta"),fb:g("site-fb"),heroImg:g("site-hero-img"),heroThumb1:g("site-hero-thumb1"),heroThumb2:g("site-hero-thumb2")});lsSafeSet("ds_site",siteContent);applySiteContent();if(typeof window.rebuildHeroShowcase==="function")window.rebuildHeroShowcase();if(typeof window.rebuildDropCountdown==="function")window.rebuildDropCountdown();if(typeof window.rebuildVaultCountdown==="function")window.rebuildVaultCountdown();const m=document.getElementById("site-msg");if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}showToast("Site content saved ✓ — syncing live...",true);syncSiteToSupabase();}
// BANNER ADMIN
function loadBannerAdmin(){document.getElementById("ban-text").value=banner.text||"";document.getElementById("ban-show").checked=banner.show||false;}
function saveBanner(){banner={text:document.getElementById("ban-text").value,show:document.getElementById("ban-show").checked};LS.set("ds_ban",banner);applyBanner();const m=document.getElementById("ban-msg");m.textContent="Banner saved ✓";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",2000);showToast("Banner saved ✓",true);syncSettingsToSupabase("banner",banner);}
/* ===== VAULT CONTENT (added 2026-09-13) =====
   Stored inside siteContent.vault -- reuses the exact same admin-site
   Edge Function and Supabase table every other piece of site copy
   already goes through. No new backend, no new table. The public vault
   page (365dropstore.com/vault/) fetches this same site_content row on
   load and hydrates its text; if this is never filled in, the vault
   page simply keeps its own hardcoded defaults, so it's never broken. */
function vaultProvToLines(rows){
  return (rows||[]).map(r=>`${r.label||""}|${r.text||""}`).join("\n");
}
function vaultProvFromLines(text){
  return (text||"").split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{
    const i=l.indexOf("|");
    return i===-1?{label:"",text:l}:{label:l.slice(0,i).trim(),text:l.slice(i+1).trim()};
  });
}
function loadVaultAdmin(){
  const v=(siteContent&&siteContent.vault)||{};
  const sv=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||"";};
  sv("vc-kicker",v.kicker);sv("vc-h1a",v.h1a);sv("vc-h1b",v.h1b);sv("vc-sub",v.sub);
  const hm=v.heroMedia||(v.heroVideoUrl?{type:'video',url:v.heroVideoUrl}:{});
  const hmTypeEl=document.getElementById("vc-hero-type");if(hmTypeEl)hmTypeEl.value=hm.type||"video";
  sv("vc-hero-url",hm.url);
  const e1=v.e1||{},e2=v.e2||{};
  sv("vc-e1-name",e1.name);sv("vc-e1-meta",e1.meta);sv("vc-e1-desc",e1.desc);
  sv("vc-e1-price",e1.price);sv("vc-e1-mrp",e1.mrp);sv("vc-e1-prov",vaultProvToLines(e1.prov));
  sv("vc-e2-name",e2.name);sv("vc-e2-meta",e2.meta);sv("vc-e2-desc",e2.desc);
  sv("vc-e2-price",e2.price);sv("vc-e2-mrp",e2.mrp);sv("vc-e2-prov",vaultProvToLines(e2.prov));
  const c=v.cert||{};
  sv("vc-cert-kicker",c.kicker);sv("vc-cert-h1a",c.h1a);sv("vc-cert-h1b",c.h1b);
  sv("vc-cert-body",c.body);sv("vc-cert-mark",c.mark);sv("vc-cert-sig",c.sigName);
  sv("vc-cert-loc",c.location?c.location.split("<br>").join("|"):"");
  sv("vc-cert-ed-no",c.editionNo);sv("vc-cert-ed-total",c.editionTotal);
  const t=v.teaser||{};
  sv("vc-t-h1a",t.h1a);sv("vc-t-h1b",t.h1b);sv("vc-t-kicker1",t.kicker1);sv("vc-t-kicker2",t.kicker2);
  sv("vc-t-body",t.body);sv("vc-t-cta",t.cta);
  sv("vc-t-file",t.fileTag);sv("vc-t-enc",t.encTag);sv("vc-t-lock",t.lockLabel);
  sv("vc-t-locksub",t.lockSub);sv("vc-t-res",t.resTag);sv("vc-t-ed",t.edTag);
}
/* ===== STAR WALL (added 2026-09-14) =====
   Stored inside siteContent.wall, so it rides the same admin-site
   Edge Function every other piece of site copy already uses. The
   customer-wall function reads this same row to decide what to show. */
function loadWallAdmin(){
  const w=(siteContent&&siteContent.wall)||{};
  const en=document.getElementById("wl-enabled");
  if(en) en.checked = w.enabled!==false;   // default on
  const hid=document.getElementById("wl-hidden");
  if(hid) hid.value=Array.isArray(w.hidden)?w.hidden.join("\n"):"";
  const blk=document.getElementById("wl-blocked");
  if(blk) blk.value=Array.isArray(w.blocked)?w.blocked.join("\n"):"";
  const off=document.getElementById("wl-offline");
  if(off) off.value=Number(w.offlineCount)||0;
  const offL=document.getElementById("wl-offline-label");
  if(offL) offL.value=(w.offlineLabel&&w.offlineLabel!=="OG")?w.offlineLabel:"Early Buyer";
  checkWallStatus();
}
function saveWallSettings(){
  const lines=id=>{
    const el=document.getElementById(id);
    if(!el)return [];
    return el.value.split("\n").map(s=>s.trim()).filter(Boolean);
  };
  const en=document.getElementById("wl-enabled");
  const offEl=document.getElementById("wl-offline");
  const offN=Math.max(0,Math.min(5000,parseInt(offEl&&offEl.value,10)||0));
  siteContent.wall={
    offlineCount: offN,
    offlineLabel: ((document.getElementById("wl-offline-label")||{}).value||"").trim().slice(0,16)||"Early Buyer",
    enabled: en?!!en.checked:true,
    hidden: lines("wl-hidden"),
    blocked: lines("wl-blocked")
  };
  lsSafeSet("ds_site",siteContent);
  const m=document.getElementById("wl-msg");
  if(m){m.textContent="Saved ✓ — the page picks this up within a minute (it caches for 60s).";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",4000);}
  showToast("Star Wall settings saved ✓",true);
  syncSiteToSupabase();
}
async function checkWallStatus(){
  const el=document.getElementById("wl-status");
  if(!el)return;
  el.textContent="Checking…";
  try{
    const r=await fetch(SUPABASE_URL+"/functions/v1/customer-wall",{
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:"Bearer "+SUPABASE_ANON_KEY}
    });
    if(!r.ok)throw new Error("HTTP "+r.status);
    const d=await r.json();
    if(d.enabled===false){ el.innerHTML="<b>Currently switched off.</b> Nothing is showing publicly."; return; }
    el.innerHTML="<b>"+d.total+" stars live</b>"
      +(d.since?" · growing since "+d.since:"")
      +(d.held?"<br>"+d.held+" name"+(d.held>1?"s":"")+" held back by the filter or your hide list.":"<br>Nothing held back.");
  }catch(e){
    el.innerHTML="<b style='color:#C0392B'>Couldn't reach the Star Wall function.</b><br>If you haven't deployed <code>customer-wall</code> yet, that's why.";
  }
}
function saveVaultContent(){
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
  siteContent.vault={
    kicker:g("vc-kicker"),h1a:g("vc-h1a"),h1b:g("vc-h1b"),sub:g("vc-sub"),
    heroMedia:{type:(document.getElementById("vc-hero-type")||{}).value||"video",url:g("vc-hero-url")},
    e1:{name:g("vc-e1-name"),meta:g("vc-e1-meta"),desc:g("vc-e1-desc"),
        price:g("vc-e1-price")?Number(g("vc-e1-price")):null,
        mrp:g("vc-e1-mrp")?Number(g("vc-e1-mrp")):null,
        prov:vaultProvFromLines(g("vc-e1-prov"))},
    e2:{name:g("vc-e2-name"),meta:g("vc-e2-meta"),desc:g("vc-e2-desc"),
        price:g("vc-e2-price")?Number(g("vc-e2-price")):null,
        mrp:g("vc-e2-mrp")?Number(g("vc-e2-mrp")):null,
        prov:vaultProvFromLines(g("vc-e2-prov"))},
    cert:{kicker:g("vc-cert-kicker"),h1a:g("vc-cert-h1a"),h1b:g("vc-cert-h1b"),
          body:g("vc-cert-body"),mark:g("vc-cert-mark"),
          sigName:g("vc-cert-sig"),
          location:g("vc-cert-loc").split("|").map(s=>s.trim()).filter(Boolean).join("<br>"),
          editionNo:g("vc-cert-ed-no"),editionTotal:g("vc-cert-ed-total")},
    teaser:{h1a:g("vc-t-h1a"),h1b:g("vc-t-h1b"),kicker1:g("vc-t-kicker1"),kicker2:g("vc-t-kicker2"),
          body:g("vc-t-body"),cta:g("vc-t-cta"),fileTag:g("vc-t-file"),encTag:g("vc-t-enc"),
          lockLabel:g("vc-t-lock"),lockSub:g("vc-t-locksub"),resTag:g("vc-t-res"),edTag:g("vc-t-ed")}
  };
  lsSafeSet("ds_site",siteContent);
  applySiteContent();
  const m=document.getElementById("vc-msg");
  if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}
  showToast("Vault content saved ✓ — syncing live...",true);
  syncSiteToSupabase();
}
// FITS MANAGER
function loadFitsAdmin(){renderFitsList();renderHomeSectionsAdmin();}
function renderFitsList(){const el=document.getElementById("fits-list");if(!el)return;el.innerHTML=fits.map((f,i)=>`<div class="fit-tag">${f}<span class="fit-rm" onclick="remFit(${i})">×</span></div>`).join("");}
function renderHomeSectionsAdmin(){
  const el=document.getElementById("home-sections-admin");if(!el)return;
  el.innerHTML=fits.map((f,i)=>{
    const existing=homeSections.find(s=>s.fit===f);
    const enabled=existing?existing.enabled:false;
    const order=existing?(existing.order??i):i;
    const fitSafe=f.replace(/'/g,"\\'");
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
      <input type="checkbox" id="hs-en-${i}" ${enabled?'checked':''} style="width:16px;height:16px"/>
      <span style="flex:1">${f}</span>
      <span style="color:var(--off);font-size:12px">Order</span>
      <input type="number" id="hs-ord-${i}" value="${order}" style="width:60px;padding:6px" data-fit="${fitSafe}"/>
    </div>`;
  }).join("");
}
function saveHomeSections(){
  homeSections=fits.map((f,i)=>{
    const en=document.getElementById(`hs-en-${i}`);
    const ord=document.getElementById(`hs-ord-${i}`);
    return{fit:f,enabled:en?en.checked:false,order:ord?(parseInt(ord.value)||0):i};
  });
  LS.set("ds_home_sections",homeSections);
  renderHomeSections();
  const m=document.getElementById("hs-msg");
  if(m){m.textContent="Saved ✓";m.style.color="#4ade80";m.style.background="rgba(74,222,128,.08)";m.style.display="block";setTimeout(()=>m.style.display="none",2000);}
  showToast("Homepage sections saved ✓ — syncing live...",true);
  syncSettingsToSupabase("home_sections",homeSections);
}
function addFit(){const inp=document.getElementById("fit-new");const v=inp.value.trim();if(!v||fits.includes(v))return;fits.push(v);LS.set("ds_fits",fits);renderFitsList();renderHomeSectionsAdmin();populateFitSelect();buildFilterUI();inp.value="";syncSettingsToSupabase("fits",fits);}
function remFit(i){if(fits.length<=1){alert("Need at least one fit.");return;}fits.splice(i,1);LS.set("ds_fits",fits);renderFitsList();renderHomeSectionsAdmin();populateFitSelect();buildFilterUI();syncSettingsToSupabase("fits",fits);}
// REVIEWS ADMIN
function saveRev(){const n=document.getElementById("rv0").value.trim();const t=document.getElementById("rv3").value.trim();if(!n||!t)return;const newRev={id:"R"+uid(),stars:Number(document.getElementById("rv2").value)||5,text:t,who:n,where:document.getElementById("rv1").value.trim()||"India"};reviews.unshift(newRev);LS.set("ds_r",reviews);renderRevs();rnAdmRev();["rv0","rv1","rv3"].forEach(id=>document.getElementById(id).value="");syncReviewToSupabase("save",newRev);}
function delRev(id){reviews=reviews.filter(r=>r.id!==id);LS.set("ds_r",reviews);renderRevs();rnAdmRev();syncReviewToSupabase("delete",{id});}
/* ===== R2 MIGRATION: move existing Supabase-hosted images to Cloudflare R2 ===== */
function scanImageSizes(){
  const el=document.getElementById("opt-scan");
  const goBtn=document.getElementById("opt-go-btn");
  const R2_HOST="r2.dev";
  let count=0;
  products.forEach(p=>{
    (p.images||[]).forEach(u=>{if(u&&!u.startsWith("data:")&&u.indexOf(R2_HOST)===-1)count++;});
    if(p.sizeChartImg&&!p.sizeChartImg.startsWith("data:")&&p.sizeChartImg.indexOf(R2_HOST)===-1)count++;
  });
  if(!count){
    el.innerHTML='<span style="color:#4ade80;font-weight:600">✓ All images are already on R2 — nothing left on Supabase Storage to migrate.</span>';
    if(goBtn)goBtn.style.display="none";
    return;
  }
  el.innerHTML=`<span style="color:#E74C3C;font-weight:600">Found ${count} images still on Supabase Storage across ${products.length} products. This will download each, upload it to R2, and update the product record — your Supabase egress bill stops growing once this finishes.</span>`;
  if(goBtn)goBtn.style.display="inline-flex";
}
async function fetchAsDataUri(url){
  const res=await fetch(url);
  if(!res.ok)throw new Error("fetch failed: "+res.status);
  const blob=await res.blob();
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
}
/* ===== R2 MIGRATION PART 2: everything the first tool didn't cover =====
   Product images/size charts were the first migration. This covers the rest:
   site gallery (Founder's Note / Story photos), reviews, story rail, global
   size chart, and Hero Grid video/image tiles — the actual remaining source
   of ongoing Supabase egress after the first migration. */
function scanRemainingAssets(){
  const el=document.getElementById("opt2-scan");
  const goBtn=document.getElementById("opt2-go-btn");
  const R2_HOST="r2.dev";
  const isSb=u=>u&&!u.startsWith("data:")&&u.indexOf(R2_HOST)===-1&&/^https?:\/\//.test(u);
  let count=0;
  (siteContent.edImgs||[]).forEach(u=>{if(isSb(u))count++;});
  (siteContent.stImgs||[]).forEach(u=>{if(isSb(u))count++;});
  if(isSb(siteContent.edImg))count++;
  if(isSb(siteContent.stImg))count++;
  reviews.forEach(r=>{if(r.type==="img"&&isSb(r.img))count++;});
  stories.forEach(s=>{if(isSb(s.img))count++;});
  if(isSb(globalSc))count++;
  heroGrid.tiles.forEach(t=>{if(isSb(t.videoUrl))count++;if(isSb(t.imageUrl))count++;});
  if(!count){
    el.innerHTML='<span style="color:#4ade80;font-weight:600">✓ Nothing left on Supabase — galleries, reviews, stories, size chart, and hero grid are all on R2.</span>';
    if(goBtn)goBtn.style.display="none";
    return;
  }
  el.innerHTML=`<span style="color:#E74C3C;font-weight:600">Found ${count} file(s) still on Supabase across site gallery, reviews, stories, size chart, and hero grid. This is very likely what's driving your continued egress after the product migration.</span>`;
  if(goBtn)goBtn.style.display="inline-flex";
}
async function runRemainingMigration(){
  const bar=document.getElementById("opt2-bar");
  const pct=document.getElementById("opt2-pct");
  const status=document.getElementById("opt2-status");
  const prog=document.getElementById("opt2-progress");
  const goBtn=document.getElementById("opt2-go-btn");
  if(prog)prog.style.display="block";
  if(goBtn)goBtn.style.display="none";
  const R2_HOST="r2.dev";
  const isSb=u=>u&&!u.startsWith("data:")&&u.indexOf(R2_HOST)===-1&&/^https?:\/\//.test(u);
  let steps=[];
  (siteContent.edImgs||[]).forEach((u,i)=>{if(isSb(u))steps.push({type:"edImgs",idx:i,url:u});});
  (siteContent.stImgs||[]).forEach((u,i)=>{if(isSb(u))steps.push({type:"stImgs",idx:i,url:u});});
  if(isSb(siteContent.edImg))steps.push({type:"edImg",url:siteContent.edImg});
  if(isSb(siteContent.stImg))steps.push({type:"stImg",url:siteContent.stImg});
  reviews.forEach((r,i)=>{if(r.type==="img"&&isSb(r.img))steps.push({type:"review",idx:i,url:r.img,ref:r});});
  stories.forEach((s,i)=>{if(isSb(s.img))steps.push({type:"story",idx:i,url:s.img,ref:s});});
  if(isSb(globalSc))steps.push({type:"globalSc",url:globalSc});
  heroGrid.tiles.forEach((t,i)=>{
    if(isSb(t.videoUrl))steps.push({type:"heroVideo",idx:i,url:t.videoUrl,ref:t});
    if(isSb(t.imageUrl))steps.push({type:"heroImage",idx:i,url:t.imageUrl,ref:t});
  });
  let done=0,failed=0,total=steps.length;
  let siteChanged=false,reviewsTouched=[],storiesTouched=[],heroChanged=false;
  let firstError="";
  for(const s of steps){
    if(status)status.textContent=`Migrating: ${s.type}...`;
    try{
      const dataUri=await fetchAsDataUri(s.url);
      const r2Url=await uploadToR2(dataUri,s.type.indexOf("hero")===0?"hero":s.type);
      if(!r2Url||r2Url.indexOf(R2_HOST)===-1)throw new Error("upload didn't return an R2 url — got: "+(r2Url||"nothing"));
      if(s.type==="edImgs"){siteContent.edImgs[s.idx]=r2Url;siteChanged=true;}
      else if(s.type==="stImgs"){siteContent.stImgs[s.idx]=r2Url;siteChanged=true;}
      else if(s.type==="edImg"){siteContent.edImg=r2Url;siteChanged=true;}
      else if(s.type==="stImg"){siteContent.stImg=r2Url;siteChanged=true;}
      else if(s.type==="review"){s.ref.img=r2Url;reviewsTouched.push(s.ref);}
      else if(s.type==="story"){s.ref.img=r2Url;storiesTouched.push(s.ref);}
      else if(s.type==="globalSc"){globalSc=r2Url;}
      else if(s.type==="heroVideo"){s.ref.videoUrl=r2Url;heroChanged=true;}
      else if(s.type==="heroImage"){s.ref.imageUrl=r2Url;heroChanged=true;}
      done++;
    }catch(e){
      const reason=(e&&e.message)?e.message:String(e);
      console.warn("Migration failed for",s.type,s.url,e);
      if(!firstError)firstError=`${s.type}: ${reason}`;
      failed++;
    }
    const pctVal=Math.round(((done+failed)/total)*100);
    if(bar)bar.style.width=pctVal+"%";
    if(pct)pct.textContent=pctVal+"%";
  }
  if(status)status.textContent="Saving to Supabase...";
  if(siteChanged){LS.set("ds_site",siteContent);applySiteContent();await syncSiteToSupabase();}
  for(const r of reviewsTouched){await syncReviewToSupabase("save",r);}
  if(reviewsTouched.length){LS.set("ds_r",reviews);renderRevs();}
  for(const s of storiesTouched){await syncStoryToSupabase("save",s);}
  if(storiesTouched.length){LS.set("ds_stories",stories);renderStoriesRail();}
  if(steps.some(s=>s.type==="globalSc")){LS.set("ds_gsc",globalSc);loadGlobalScAdmin();await syncSettingsToSupabase("global_size_chart",globalSc);}
  if(heroChanged){LS.set("ds_hero_grid",heroGrid);renderHeroGrid();renderHeroGridAdmin();await syncSettingsToSupabase("insta_grid",heroGrid);}
  if(status)status.textContent=`Complete: ${done} migrated, ${failed} failed.`;
  const msg=document.getElementById("opt2-msg");
  if(msg){msg.style.display="block";msg.style.color=failed?"#E74C3C":"#4ade80";msg.textContent=failed?`${failed} file(s) failed. First error: ${firstError||"unknown"} — screenshot this exact message.`:"Everything now lives on R2. This closes the egress leak for good — re-check your Supabase Usage tab in a day or two to confirm the daily number drops.";}
  scanRemainingAssets();
}
async function runImageOptimize(){
  const bar=document.getElementById("opt-bar");
  const pct=document.getElementById("opt-pct");
  const status=document.getElementById("opt-status");
  const prog=document.getElementById("opt-progress");
  const goBtn=document.getElementById("opt-go-btn");
  if(prog)prog.style.display="block";
  if(goBtn)goBtn.style.display="none";
  const R2_HOST="r2.dev";
  let done=0,failed=0,total=products.length;
  for(const p of products){
    if(status)status.textContent=`Migrating: ${p.name||p.id}...`;
    let changed=false;
    const newImgs=[...(p.images||[])];
    for(let i=0;i<newImgs.length;i++){
      const u=newImgs[i];
      if(!u||u.startsWith("data:")||u.indexOf(R2_HOST)!==-1)continue;
      try{
        const dataUri=await fetchAsDataUri(u);
        const r2Url=await uploadToR2(dataUri,"products");
        if(r2Url&&r2Url.indexOf(R2_HOST)!==-1){newImgs[i]=r2Url;changed=true;}
      }catch(e){console.warn("Migration failed for",u,e);failed++;}
    }
    if(p.sizeChartImg&&!p.sizeChartImg.startsWith("data:")&&p.sizeChartImg.indexOf(R2_HOST)===-1){
      try{
        const dataUri=await fetchAsDataUri(p.sizeChartImg);
        const r2Url=await uploadToR2(dataUri,"sizecharts");
        if(r2Url&&r2Url.indexOf(R2_HOST)!==-1){p.sizeChartImg=r2Url;changed=true;}
      }catch(e){console.warn("Size chart migration failed for",p.id,e);failed++;}
    }
    if(changed){
      p.images=newImgs;
      try{await syncProductToSupabase("save",p);}
      catch(e){console.error("Save failed for",p.id,e);failed++;}
    }
    done++;
    const pctVal=Math.round((done/total)*100);
    if(bar)bar.style.width=pctVal+"%";
    if(pct)pct.textContent=pctVal+"%";
  }
  if(status)status.textContent=`Done! Refreshing data from server...`;
  try{
    const ok=await loadFromSupabaseIfAvailable();
    if(ok){LS.set("ds_p",products);renderGrid();}
  }catch(e){}
  if(status)status.textContent=`Complete: ${done} products checked, ${failed} image${failed===1?'':'s'} failed.`;
  const msg=document.getElementById("opt-msg");
  if(msg){msg.style.display="block";msg.style.color=failed?"#E74C3C":"#4ade80";msg.textContent=failed?`${failed} image(s) failed to migrate — re-run this tool, it only touches what\'s still on Supabase.`:"All product images now live on R2. Supabase Storage egress stops accumulating from here.";}
  scanImageSizes();
}
function rnStorageView(){
  const el=document.getElementById("storage-view");if(!el)return;
  let totalBytes=0;const rows=[];
  const keys={"ds_p":"Products","ds_orders":"Orders","ds_r":"Reviews","ds_stories":"Story Updates","ds_cart":"Cart","ds_pal":"Palette","gsc-data":"Global Size Chart"};
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      const v=localStorage.getItem(k)||"";
      const bytes=new Blob([v]).size;
      totalBytes+=bytes;
      if(keys[k])rows.push({label:keys[k],bytes});
    }
  }catch(e){el.innerHTML='<p style="color:var(--off);font-size:13px">Could not read storage.</p>';return;}
  const capBytes=5*1024*1024;
  const pct=Math.min(100,Math.round((totalBytes/capBytes)*100));
  const fmtKB=(b)=>b>1024*1024?(b/(1024*1024)).toFixed(2)+" MB":(b/1024).toFixed(1)+" KB";
  const barColor=pct>=90?"#C0392B":pct>=70?"#E67E22":"#27AE60";
  rows.sort((a,b)=>b.bytes-a.bytes);
  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-weight:700;color:var(--white)">${fmtKB(totalBytes)} used of ~5 MB</span>
      <span style="color:${barColor};font-weight:700;font-size:13px">${pct}%</span>
    </div>
    <div style="height:8px;border-radius:6px;background:var(--line2);overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${barColor};transition:width .3s"></div>
    </div>
    <div style="margin-top:14px;font-size:12.5px;color:var(--off)">
      ${rows.map(r=>`<div style="display:flex;justify-content:space-between;padding:4px 0">${r.label}<span>${fmtKB(r.bytes)}</span></div>`).join("")}
    </div>
    ${pct>=80?'<p style="color:#C0392B;font-size:12px;margin-top:10px;font-weight:600">⚠ Getting close to the limit — consider downloading a ZIP backup and trimming old data.</p>':''}
  `;
  if(pct>=80&&!window._storageWarnedThisSession){
    window._storageWarnedThisSession=true;
    showToast("⚠ Storage at "+pct+"% — back up via ZIP soon.",false);
  }
}
async function loadOrdersFromSupabase(){
  if(!_adminPw)return false;
  try{
    const res=await fetch(SB_FN_BASE+"admin-orders",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,action:"list"})
    });
    const data=await res.json();
    if(data.error||!data.orders)return false;
    orders=data.orders.map(o=>({
      orderId:o.order_id,name:o.customer_name,phone:o.phone,
      addr:o.address,pin:o.pincode,items:o.items||[],
      total:o.total,status:o.status,placedAt:new Date(o.placed_at).getTime(),
      paymentMode:o.payment_mode||"prepaid",
      amountPaidOnline:o.amount_paid_online,
      codDue:o.cod_due,
      trackingId:o.tracking_id||"",
      courierPartner:o.courier_partner||"",
      courierOrderId:o.courier_order_id||"",
      email:o.email||"",
      channel:o.channel
    }));
    try{localStorage.setItem("ds_orders",JSON.stringify(orders));}catch(e){}
    return true;
  }catch(e){return false;}
}
let abandonedOrders=[];
let _abExpanded=false;
async function loadAbandonedCount(){
  if(!_adminPw)return;
  try{
    const res=await fetch(SB_FN_BASE+"admin-orders",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,action:"listAbandoned"})
    });
    const data=await res.json();
    if(data.error||!data.orders)return;
    abandonedOrders=data.orders;
    const cntEl=document.getElementById("ab-cnt");
    if(cntEl)cntEl.textContent=`(${_abGroups().filter(x=>x.state==="todo").length} to message)`;
    if(_abExpanded)renderAbandonedList();
  }catch(e){}
}
function toggleAbandoned(){
  _abExpanded=!_abExpanded;
  const listEl=document.getElementById("abandoned-list");
  listEl.style.display=_abExpanded?"block":"none";
  document.getElementById("ab-arrow").textContent=_abExpanded?"▴":"▾";
  if(_abExpanded)renderAbandonedList();
}
/* Open any customer straight in the Lifeline (from order cards, abandoned checkouts, look-up box) */
function lfOpen(q){q=String(q||"").trim();if(!q){showToast("Type a phone number or name first",false);return;}lfGlobalSearch(q);}
/* ===== SEARCHABLE ARTICLE DROPDOWNS =====
   Adds a type-to-search box above every article <select> (Log a sale lines
   and the order editor). It rebuilds the option list with only the matches
   (hiding <option>s doesn't work in Safari). Picks the first match if the
   current choice gets filtered out, and fires the select's own change handler. */
function _psNorm(t){return String(t||"").toLowerCase().replace(/^365-?/,"").replace(/[^a-z0-9]+/g," ").trim();}
function prodSearchify(sel){
  if(!sel||sel.dataset.ps)return; sel.dataset.ps="1";
  const all=[...sel.options].map(o=>({v:o.value,t:o.textContent}));
  const box=document.createElement("input");
  box.type="search";box.className="ps-in";box.placeholder="🔍 Search article… e.g. midwash, noir";box.setAttribute("aria-label","Search articles");
  sel.parentNode.insertBefore(box,sel);
  const info=document.createElement("div");info.className="ps-info";info.hidden=true;sel.parentNode.insertBefore(info,sel.nextSibling);
  box.addEventListener("input",()=>{
    const q=_psNorm(box.value).split(" ").filter(Boolean), cur=sel.value;
    const hits=q.length?all.filter(o=>{const n=_psNorm(o.t),nn=n.replace(/ /g,"");return q.every(w=>n.includes(w)||nn.includes(w));}):all;
    sel.innerHTML=(hits.length?hits:[{v:"",t:"No article matches"}]).map(o=>`<option value="${String(o.v).replace(/"/g,"&quot;")}">${_dspEsc(o.t)}</option>`).join("");
    sel.disabled=!hits.length;
    if(hits.some(o=>o.v===cur))sel.value=cur;
    else if(hits.length){sel.value=hits[0].v;sel.dispatchEvent(new Event("change",{bubbles:true}));}
    info.hidden=!q.length;info.textContent=hits.length?`${hits.length} match${hits.length>1?"es":""}`:"No match — clear the search";
  });
  box.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sel.focus();}});
}
(function(){
  const enhance=()=>document.querySelectorAll('#ap select[id^="wo-prod-"], #ap select.oe-prod').forEach(prodSearchify);
  const ap=document.getElementById("ap"); if(!ap)return;
  new MutationObserver(()=>enhance()).observe(ap,{childList:true,subtree:true});
  enhance();
})();
/* ===== REARRANGE ADMIN TABS =====
   "⇄ Arrange" → drag tabs (desktop) or use ◀ ▶ (phone), "Done" saves.
   Order is remembered on this device; "Reset" restores the default. */
function _tabKey(b){const m=(b.getAttribute("onclick")||"").match(/apTab\('([a-z]+)'\)/);return m?m[1]:null;}
function _tabsEl(){return document.querySelector("#ap .aptabs");}
function applyTabOrder(){
  const bar=_tabsEl();if(!bar)return;
  let order=[];try{order=JSON.parse(localStorage.getItem("ds_admin_tabs")||"[]");}catch(e){}
  if(!Array.isArray(order)||!order.length)return;
  const btns=[...bar.querySelectorAll(".atab")].filter(_tabKey), arr=bar.querySelector(".atab-arr");
  order.forEach(k=>{const b=btns.find(x=>_tabKey(x)===k);if(b)bar.insertBefore(b,arr||null);});
  btns.filter(b=>!order.includes(_tabKey(b))).forEach(b=>bar.insertBefore(b,arr||null));   // tabs added later stay visible
}
function _saveTabOrder(){const bar=_tabsEl();const o=[...bar.querySelectorAll(".atab")].map(_tabKey).filter(Boolean);try{localStorage.setItem("ds_admin_tabs",JSON.stringify(o));}catch(e){}}
function tabArrange(on){
  const bar=_tabsEl();if(!bar)return;
  bar.classList.toggle("arr",on);
  bar.querySelectorAll(".atab").forEach(b=>{
    if(!_tabKey(b))return;
    b.draggable=on;
    b.querySelectorAll(".tab-mv").forEach(x=>x.remove());
    if(on){b.insertAdjacentHTML("afterbegin",'<span class="tab-mv" data-d="-1" title="Move left">◀</span>');b.insertAdjacentHTML("beforeend",'<span class="tab-mv" data-d="1" title="Move right">▶</span>');}
  });
  const ctl=bar.querySelector(".atab-arr");
  if(ctl)ctl.innerHTML=on?'✓ Done <span class="tab-reset" title="Back to the original order">Reset</span>':"⇄ Arrange";
  if(!on)_saveTabOrder();
}
(function(){
  const bar=_tabsEl();if(!bar)return;
  bar.insertAdjacentHTML("beforeend",'<button type="button" class="atab atab-arr" title="Rearrange tabs">⇄ Arrange</button>');
  const DEFAULT=[...bar.querySelectorAll(".atab")].map(_tabKey).filter(Boolean);
  let dragged=null;
  // capture phase: in arrange mode a tap moves/selects instead of switching tab
  bar.addEventListener("click",e=>{
    const ctl=e.target.closest(".atab-arr");
    if(ctl){e.preventDefault();e.stopPropagation();
      if(e.target.closest(".tab-reset")){try{localStorage.removeItem("ds_admin_tabs");}catch(_){}DEFAULT.forEach(k=>{const b=[...bar.querySelectorAll(".atab")].find(x=>_tabKey(x)===k);if(b)bar.insertBefore(b,ctl);});tabArrange(false);try{localStorage.removeItem("ds_admin_tabs");}catch(_){}showToast("Tabs back to the original order",true);return;}
      tabArrange(!bar.classList.contains("arr"));if(!bar.classList.contains("arr"))showToast("Tab order saved",true);return;}
    if(!bar.classList.contains("arr"))return;
    e.preventDefault();e.stopPropagation();
    const mv=e.target.closest(".tab-mv");if(!mv)return;
    const b=mv.closest(".atab"),d=+mv.dataset.d;
    if(d<0&&b.previousElementSibling&&_tabKey(b.previousElementSibling))bar.insertBefore(b,b.previousElementSibling);
    if(d>0&&b.nextElementSibling&&_tabKey(b.nextElementSibling))bar.insertBefore(b.nextElementSibling,b);
  },true);
  bar.addEventListener("dragstart",e=>{dragged=e.target.closest(".atab");if(dragged){e.dataTransfer.effectAllowed="move";dragged.classList.add("dragging");}});
  bar.addEventListener("dragend",()=>{if(dragged)dragged.classList.remove("dragging");dragged=null;});
  bar.addEventListener("dragover",e=>{
    if(!dragged||!bar.classList.contains("arr"))return;e.preventDefault();
    const over=e.target.closest(".atab");if(!over||over===dragged||!_tabKey(over))return;
    const r=over.getBoundingClientRect();bar.insertBefore(dragged,(e.clientX-r.left)>r.width/2?over.nextSibling:over);
  });
  applyTabOrder();
})();
/* ===== CUSTOMER LIFELINE =====
   One search (order ID / phone / email / AWB / name) → the customer's whole
   story: every order and abandoned checkout, payment, shipment, address,
   products (photo + inline product view), timeline, internal comments,
   quick actions. Data: admin-orders → lookup / addNote / deleteNote. */
let _lf=null;
// {data, focus}
const LF_CH={website:"Website",whatsapp:"WhatsApp",instagram:"Instagram",walkin:"Walk-in"};
function _lfE(v){return _dspEsc(String(v==null?"":v));}
function _lfDT(iso){if(!iso)return "—";const d=new Date(iso);return d.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone:"Asia/Kolkata"});}
function _lfT(iso){if(!iso)return "";return new Date(iso).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"numeric",minute:"2-digit",hour12:true,timeZone:"Asia/Kolkata"});}
function _lfDur(ms){if(!(ms>0))return "";const h=Math.round(ms/36e5);return h<24?`${h}h`:`${Math.floor(h/24)}d ${h%24}h`;}
function _lfMask(ph){ph=String(ph||"");return ph.length>4?"XXXXXX"+ph.slice(-4):ph;}
function _lfMaskEmail(e){e=String(e||"");const [u,d]=e.split("@");if(!d)return e;return (u[0]||"")+"•••@"+d;}
function _lfMaskAddr(a){a=String(a||"");return a?a.slice(0,6)+" •••••••• "+a.slice(-6):"—";}
async function _lfCall(body){
  const r=await fetch(SB_FN_BASE+"admin-orders",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,...body})});
  const d=await r.json();if(d.error)throw new Error(d.error);return d;
}
function _lfRecent(){try{return JSON.parse(localStorage.getItem("ds_lf_recent")||"[]");}catch(e){return [];}}
function _lfRememberSearch(q){const r=_lfRecent().filter(x=>x!==q);r.unshift(q);try{localStorage.setItem("ds_lf_recent",JSON.stringify(r.slice(0,6)));}catch(e){}_lfDrawRecent();}
function _lfDrawRecent(){const el=document.getElementById("lf-recent");if(!el)return;const r=_lfRecent();el.innerHTML=r.length?`<span style="font-size:12px;color:var(--lf-sub);align-self:center">Recent:</span>`+r.map(q=>`<button type="button" onclick="lfSearch(${_lfE(JSON.stringify(q))})">${_lfE(q)}</button>`).join(""):"";}
function lfGlobalSearch(q){q=String(q||"").trim();if(!q)return;apTab("lifeline");document.getElementById("lf-q").value=q;document.getElementById("lf-type").value="auto";lfSearch();}
async function lfSearch(qOverride){
  const qi=document.getElementById("lf-q"),ty=document.getElementById("lf-type"),body=document.getElementById("lf-body");
  if(typeof qOverride==="string"){qi.value=qOverride;ty.value="auto";}
  const q=qi.value.trim(); if(!q){qi.focus();return;}
  body.innerHTML=`<div class="lf-empty"><div class="lf-empty-i">⏳</div><b>Searching…</b></div>`;
  try{
    const d=await _lfCall({action:"lookup",q,type:ty.value});
    _lfRememberSearch(q);
    if(d.matches&&d.matches.length>1){
      body.innerHTML=`<div class="lf-card"><div class="lf-sec-h"><b>${d.matches.length} customers match "${_lfE(q)}"</b></div>`+
        d.matches.map(m=>`<button class="lf-match" onclick="lfSearch(${_lfE(JSON.stringify(m.phone||m.email||m.sample))})"><span><b>${_lfE(m.name||"—")}</b><br><small>${_lfE(_lfMask(m.phone))}${m.email?" · "+_lfE(_lfMaskEmail(m.email)):""}</small></span><small>${m.orders} order${m.orders>1?"s":""} · last ${_lfE(_lfT(m.last))}</small></button>`).join("")+`</div>`;
      return;
    }
    if(!d.found){body.innerHTML=`<div class="lf-empty"><div class="lf-empty-i">🤷</div><b>Nothing found</b><span>${_lfE(d.message||"Try another order ID, phone, email or AWB.")}</span></div>`;return;}
    _lf={data:d,focus:d.anchor,reveal:{}};
    lfRender();
  }catch(e){body.innerHTML=`<div class="lf-empty"><div class="lf-empty-i">⚠️</div><b>Couldn't search</b><span>${_lfE(e.message||"Check your connection and try again.")}</span></div>`;}
}
function _lfProd(it){
  const P=(_lf&&_lf.data.products)||{};
  if(it.id&&P[it.id])return P[it.id];
  const n=String(it.name||"").toLowerCase();return Object.values(P).find(p=>(p.name||"").toLowerCase()===n)||null;
}
function _lfStatus(o){
  if(o.status==="awaiting_payment"){
    if(o.pay_fail_reason){const k=(typeof _payFailKind==="function")?_payFailKind(o.pay_fail_reason):"failed";return {cls:"lf-bad",txt:"Payment failed · "+((typeof _PAY_FAIL_LABEL!=="undefined"&&_PAY_FAIL_LABEL[k])||"failed")};}
    return {cls:"lf-warn",txt:"Abandoned checkout"};
  }
  if(o.status==="cancelled")return {cls:"lf-bad",txt:"Cancelled"};
  if(o.status==="failed")return {cls:"lf-bad",txt:"Failed"};
  if(o.status==="fulfilled")return {cls:"lf-ok",txt:o.channel==="walkin"?"Completed":"Delivered"};
  if(o.tracking_id)return {cls:"lf-info",txt:"Shipped"};
  if(o.status==="confirmed")return {cls:"lf-info",txt:"Paid · to ship"};
  return {cls:"lf-neu",txt:o.status||"—"};
}
function _lfPayMode(o){return ({prepaid:"Prepaid",partial_cod:"Partial COD",cod:"Cash on delivery",cash:"Cash",upi:"UPI",card:"Card",bank:"Bank transfer"})[o.payment_mode]||(o.payment_mode||"—");}
function _lfTimeline(o){
  const st=[],bad=["cancelled","failed"].includes(o.status)||(o.status==="awaiting_payment");
  st.push({k:o.status==="awaiting_payment"?"Checkout":"Placed",t:o.placed_at,done:true});
  if(o.status==="awaiting_payment"){
    if(o.pay_fail_at)st.push({k:"Payment failed",t:o.pay_fail_at,bad:true,sub:(o.pay_fail_count>1?`${o.pay_fail_count} tries`:"")});
    else st.push({k:"Payment not done",t:null,bad:true});
    if(o.recovery_wa_sent_at)st.push({k:"Messaged",t:o.recovery_wa_sent_at,done:true});
  }else if(o.channel==="walkin"){
    st.push({k:"Paid",t:o.placed_at,done:true});st.push({k:"Handed over",t:o.updated_at||o.placed_at,done:o.status==="fulfilled"});
  }else{
    st.push({k:"Paid",t:o.placed_at,done:["confirmed","fulfilled"].includes(o.status)});
    st.push({k:"Shipped",t:o.tracking_added_at,done:!!o.tracking_id});
    if(o.status==="cancelled")st.push({k:"Cancelled",t:o.updated_at,bad:true});
    else st.push({k:"Delivered",t:o.status==="fulfilled"?(o.delivered_notified_at||o.updated_at):null,done:o.status==="fulfilled"});
  }
  const doneN=st.filter(x=>x.done).length, pct=Math.round(((Math.max(1,doneN)-1)/Math.max(1,st.length-1))*100);
  let chip="";
  if(o.status==="fulfilled"&&o.channel!=="walkin"){const d=_lfDur(new Date(o.delivered_notified_at||o.updated_at)-new Date(o.placed_at));if(d)chip=`<span class="lf-pill lf-ok">Delivered in ${d}</span>`;}
  else if(o.status==="confirmed"&&!o.tracking_id){const age=Date.now()-new Date(o.placed_at);chip=`<span class="lf-pill ${age>48*36e5?"lf-bad":"lf-warn"}">Not shipped · ${_lfDur(age)} since order</span>`;}
  else if(o.tracking_id&&o.status==="confirmed"){chip=`<span class="lf-pill lf-info">In transit · ${_lfDur(Date.now()-new Date(o.tracking_added_at||o.placed_at))}</span>`;}
  return `<div class="lf-card lf-sec"><div class="lf-sec-h"><b>Order progress</b>${chip}</div>
    <div class="lf-tl ${bad?"bad":"ok"}" style="--lf-p:${pct}%">${st.map(x=>`<div class="lf-step ${x.done?"done":""} ${x.bad?"badst":""}"><div class="lf-dot"></div><b>${_lfE(x.k)}</b>${x.t?_lfE(_lfT(x.t)):(x.bad?"":"—")}${x.sub?`<br>${_lfE(x.sub)}`:""}</div>`).join("")}</div></div>`;
}
function lfToggleReveal(k){_lf.reveal[k]=!_lf.reveal[k];lfRender();}
function lfCopy(t,label){(navigator.clipboard?navigator.clipboard.writeText(String(t)):Promise.reject()).then(()=>showToast((label||"Copied")+" ✓",true)).catch(()=>{try{prompt("Copy:",t);}catch(e){}});}
function lfFocus(id){if(!_lf)return;_lf.focus=id;_lf.prodOpen=null;lfRender();const b=document.getElementById("lf-body");if(b)b.scrollIntoView({behavior:"smooth",block:"start"});}
function lfToggleProduct(key){_lf.prodOpen=_lf.prodOpen===key?null:key;lfRender();
  if(_lf.prodOpen){const el=document.getElementById("lf-prod-"+key);if(el)el.scrollIntoView({behavior:"smooth",block:"nearest"});}}
function lfRender(){
  const body=document.getElementById("lf-body"); if(!body||!_lf)return;
  const d=_lf.data, all=d.orders||[], o=all.find(x=>x.order_id===_lf.focus)||all[0];
  const paid=all.filter(x=>["confirmed","fulfilled"].includes(x.status));
  const spend=paid.reduce((s,x)=>s+(+x.total||0),0);
  const first=all.length?all[all.length-1].placed_at:null;
  const sizes={};paid.forEach(x=>(x.items||[]).forEach(i=>{if(i.size)sizes[i.size]=(sizes[i.size]||0)+(+i.qty||1);}));
  const usual=Object.entries(sizes).sort((a,b)=>b[1]-a[1])[0];
  const name=o.customer_name||"—", ph=o.phone||d.customer.phone, em=o.email||d.customer.email;
  const st=_lfStatus(o), rv=_lf.reveal;
  const notes=d.notes||[];
  const wa=ph?`https://wa.me/91${ph}`:"";
  const sub=(o.items||[]).reduce((s,i)=>s+(+i.price||0)*(+i.qty||1),0);
  const track=o.tracking_id?(courierTrackUrl(o.courier_partner,o.tracking_id)||""):"";
  const others=[...(d.customer.phones||[]).filter(x=>x!==ph).map(_lfMask),...(d.customer.emails||[]).filter(x=>x!==(em||"").toLowerCase()).map(_lfMaskEmail)];

  const items=(o.items||[]).map((it,ix)=>{
    const p=_lfProd(it), img=p&&p.images&&p.images[0], key=o.order_id+"-"+ix, open=_lf.prodOpen===key;
    const inStock=p?!(p.oosizes||[]).includes(it.size):null;
    return `<div class="lf-item">${img?`<img class="lf-thumb" src="${_lfE(img)}" alt="" loading="lazy">`:`<div class="lf-thumb ph">👖</div>`}
      <div class="lf-it"><b>${_lfE(it.name)}</b><span>Size ${_lfE(it.size||"—")} · Qty ${_lfE(it.qty||1)} · ${inr((+it.price||0))} each${p&&inStock!==null?` · ${inStock?"size in stock":"<span style='color:var(--lf-bad)'>size now sold out</span>"}`:""}</span>
      ${p?`<div style="margin-top:6px"><button class="lf-link" onclick="lfToggleProduct('${_lfE(key)}')">${open?"Hide product":"View product"}</button></div>`:""}</div>
      <div class="lf-it-r">${inr((+it.price||0)*(+it.qty||1))}</div></div>
      ${open&&p?`<div class="lf-prod" id="lf-prod-${_lfE(key)}"><div class="lf-gal">${(p.images||[]).map((u,i)=>`<img class="${i===0?"big":""}" src="${_lfE(u)}" alt="" loading="lazy">`).join("")||`<div class="lf-thumb ph">👖</div>`}</div>
        <div class="lf-pinfo"><b>${_lfE(p.name)}</b><div style="margin-top:4px;font-size:13px;color:var(--lf-ink)">${p.fit?_lfE(p.fit)+" · ":""}${inr(p.offer_price||p.price)}${p.offer_price&&p.price>p.offer_price?` <s style="color:var(--lf-sub)">${inr(p.price)}</s>`:""}</div>
        <div class="lf-sz">${(p.sizes||[]).map(z=>`<span class="${(p.oosizes||[]).includes(z)?"oos":""} ${z===it.size?"ord":""}">${_lfE(z)}</span>`).join("")}</div>
        ${p.description?`<p>${_lfE(p.description)}</p>`:""}
        <a class="lf-btn" href="https://365dropstore.com/p/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Open on website ↗</a></div></div>`:""}`;
  }).join("")||`<div class="lf-empty" style="padding:20px"><span>No items recorded on this order.</span></div>`;

  const qa=[
    ph&&{i:"💬",t:"WhatsApp customer",f:`window.open('${wa}','_blank','noopener')`},
    ph&&{i:"📞",t:"Call customer",f:`location.href='tel:+91${ph}'`},
    {i:"🧾",t:"View order & bill",f:`lfBill()`},
    {i:"📋",t:"Copy order ID",f:`lfCopy('${_lfE(o.order_id)}','Order ID copied')`},
    o.channel!=="walkin"&&{i:"🔗",t:"Copy customer tracking link",f:`lfCopy('https://365dropstore.com/?track=${encodeURIComponent(o.order_id)}','Tracking link copied')`},
    o.tracking_id&&ph&&{i:"📦",t:'Send "shipped" on WhatsApp',f:`lfWaUpdate('shipped')`},
    o.status==="fulfilled"&&o.channel!=="walkin"&&ph&&{i:"✅",t:'Send "delivered" on WhatsApp',f:`lfWaUpdate('delivered')`},
    o.status==="awaiting_payment"&&ph&&{i:"🛍️",t:"Send bag link on WhatsApp (win back)",f:`lfWinBack()`},
    o.address&&{i:"📍",t:"Copy delivery address",f:`lfCopy(${_lfE(JSON.stringify((o.address||"")+(o.pincode?" — "+o.pincode:"")))},'Address copied')`},
    o.status!=="awaiting_payment"&&{i:"✏️",t:"Edit this order",f:`lfEditOrder()`},
    {i:"🗒️",t:"Add a comment",f:`document.getElementById('lf-note-in').focus()`}
  ].filter(Boolean);

  body.innerHTML=`<div class="lf-grid"><div class="lf-wrap">
   <div class="lf-card lf-sec">
     <div class="lf-h"><span class="lf-oid">Order #${_lfE(o.order_id)}</span><button class="lf-ic" title="Copy order ID" onclick="lfCopy('${_lfE(o.order_id)}','Order ID copied')">⧉</button>
       <span class="lf-pill ${st.cls}">${_lfE(st.txt)}</span>${o.channel?`<span class="lf-pill lf-neu">${_lfE(LF_CH[o.channel]||o.channel)}</span>`:`<span class="lf-pill lf-neu">Website</span>`}
       ${all.filter(x=>["confirmed","fulfilled"].includes(x.status)).length>1?`<span class="lf-pill lf-info">↩ Repeat customer</span>`:""}
       <div class="lf-hact">${ph?`<a class="lf-btn wa" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a><a class="lf-btn" href="tel:+91${ph}">📞 Call</a>`:""}<button class="lf-btn" onclick="lfSearch(${_lfE(JSON.stringify(o.order_id))})" title="Refresh">↻</button></div></div>
     <div class="lf-date">${_lfE(_lfDT(o.placed_at))}</div>
     <div class="lf-tabs"><a class="on" onclick="document.getElementById('lf-notes').scrollIntoView({behavior:'smooth'})">Comments (${notes.length})</a><a onclick="document.getElementById('lf-histc').scrollIntoView({behavior:'smooth'})">History (${all.length})</a></div>
     <div class="lf-cards">
       <div class="lf-card"><div class="lf-k">👤 Customer</div><div class="lf-name">${_lfE(name)}<button class="lf-ic" title="Copy name" onclick="lfCopy(${_lfE(JSON.stringify(name))},'Name copied')">⧉</button></div>
         ${ph?`<div class="lf-line">📱 ${_lfE(rv.ph?ph:_lfMask(ph))}<button class="lf-ic" title="${rv.ph?"Hide":"Show"}" onclick="lfToggleReveal('ph')">${rv.ph?"🙈":"👁"}</button><button class="lf-ic" title="Copy" onclick="lfCopy('${_lfE(ph)}','Phone copied')">⧉</button></div>`:""}
         ${em?`<div class="lf-line">✉️ ${_lfE(rv.em?em:_lfMaskEmail(em))}<button class="lf-ic" title="${rv.em?"Hide":"Show"}" onclick="lfToggleReveal('em')">${rv.em?"🙈":"👁"}</button></div>`:`<div class="lf-line" style="color:var(--lf-sub)">✉️ No email given</div>`}
         ${others.length?`<div class="lf-line" style="color:var(--lf-sub)">Also used: ${_lfE(others.join(", "))}</div>`:""}
         <div class="lf-row"><span>Customer since</span><b>${_lfE(first?new Date(first).toLocaleDateString("en-IN",{month:"short",year:"numeric",timeZone:"Asia/Kolkata"}):"—")}</b></div>
         <div class="lf-row"><span>Orders paid</span><b>${paid.length}${all.length>paid.length?` <span style="font-weight:500;color:var(--lf-sub)">(+${all.length-paid.length} other)</span>`:""}</b></div>
         <div class="lf-row"><span>Lifetime spend</span><b>${inr(spend)}</b></div>
         ${usual?`<div class="lf-row"><span>Usual size</span><b>${_lfE(usual[0])}</b></div>`:""}</div>
       <div class="lf-card"><div class="lf-k">💳 Payment</div><div><span class="lf-pill ${st.cls}">${_lfE(o.status==="awaiting_payment"?(o.pay_fail_reason?"Failed":"Not paid"):(["confirmed","fulfilled"].includes(o.status)?"Paid":st.txt))}</span></div>
         <div class="lf-amt">${inr(o.total)}</div>
         <div class="lf-row"><span>Mode</span><b>${_lfE(_lfPayMode(o))}</b></div>
         ${o.payment_mode==="partial_cod"?`<div class="lf-row"><span>Paid online</span><b>${inr(o.amount_paid_online)}</b></div><div class="lf-row"><span>Cash at delivery</span><b style="color:var(--lf-bad)">${inr(o.cod_due)}</b></div>`:""}
         ${o.payment_id?`<div class="lf-row"><span>Payment ID</span><b style="font-size:12px">${_lfE(o.payment_id)}<button class="lf-ic" onclick="lfCopy('${_lfE(o.payment_id)}','Payment ID copied')">⧉</button></b></div>`:""}
         ${o.pay_fail_reason?`<div class="lf-line" style="color:var(--lf-bad);font-size:12.5px">${_lfE(o.pay_fail_reason)}</div>`:""}
         <div style="margin-top:8px"><button class="lf-link" onclick="lfBill()">View order & bill</button></div></div>
       <div class="lf-card"><div class="lf-k">📦 Shipment</div>
         ${o.channel==="walkin"?`<div class="lf-line">Walk-in sale: handed over in store</div>`:o.tracking_id?`<div class="lf-name" style="font-size:15px">${_lfE(o.courier_partner||"Courier")}</div>
           <div class="lf-line">AWB <b>${_lfE(o.tracking_id)}</b><button class="lf-ic" title="Copy AWB" onclick="lfCopy('${_lfE(o.tracking_id)}','AWB copied')">⧉</button></div>
           ${track?`<a class="lf-btn" style="margin:6px 0" href="${_lfE(track)}" target="_blank" rel="noopener">Track on ${_lfE(o.courier_partner)} ↗</a>`:""}
           <div class="lf-row"><span>Shipped</span><b>${_lfE(_lfT(o.tracking_added_at)||"—")}</b></div>
           <div class="lf-row"><span>"Shipped" email</span><b>${o.shipped_notified_at?"Sent ✓":(o.email?"Not sent":"No email")}</b></div>`:
           `<div class="lf-line" style="color:var(--lf-sub)">${o.status==="awaiting_payment"?"Not paid, nothing to ship":"Not shipped yet"}</div>`}
         ${o.courier_order_id?`<div class="lf-row"><span>Courier order ID</span><b style="font-size:12px">${_lfE(o.courier_order_id)}</b></div>`:""}
         ${o.status==="fulfilled"&&o.channel!=="walkin"?`<div class="lf-row"><span>"Delivered" email</span><b>${o.delivered_notified_at?"Sent ✓":(o.email?"Not sent":"No email")}</b></div>`:""}</div>
       <div class="lf-card"><div class="lf-k">📍 Address</div>
         <div class="lf-line" style="align-items:flex-start">${_lfE(rv.ad?(o.address||"—"):_lfMaskAddr(o.address))}${o.address?`<button class="lf-ic" title="${rv.ad?"Hide":"Show"}" onclick="lfToggleReveal('ad')">${rv.ad?"🙈":"👁"}</button>`:""}</div>
         ${o.pincode?`<div class="lf-row"><span>Pincode</span><b>${_lfE(o.pincode)}</b></div>`:""}
         ${o.address?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><a class="lf-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((o.address||"")+" "+(o.pincode||""))}">Open in Maps ↗</a></div>`:""}</div>
     </div></div>

   <div class="lf-card lf-sec"><div class="lf-sec-h"><b>Items (${(o.items||[]).length})</b><span style="color:var(--lf-sub);font-size:13px">Subtotal ${inr(sub)}</span></div>${items}</div>
   ${_lfTimeline(o)}

   <div class="lf-card lf-sec" id="lf-notes"><div class="lf-sec-h"><b>Comments</b>${notes.length>3?`<button class="lf-link" onclick="lfAllNotes()">See all (${notes.length})</button>`:""}</div>
     <textarea id="lf-note-in" class="lf-note-in" placeholder="Start typing a comment about this customer… (only your team sees this)"></textarea>
     <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;flex-wrap:wrap"><label style="font-size:12.5px;color:var(--lf-sub);display:flex;align-items:center;gap:6px"><input type="checkbox" id="lf-note-ord" checked> Link to order ${_lfE(o.order_id)}</label><button class="lf-btn lf-pri" onclick="lfAddNote()">Add comment</button></div>
     ${notes.slice(0,3).map(_lfNoteHtml).join("")||`<div style="color:var(--lf-sub);font-size:13px;margin-top:10px">No comments yet.</div>`}</div>

   <div class="lf-card lf-sec" id="lf-histc"><div class="lf-sec-h"><b>Customer history (${all.length})</b><span style="color:var(--lf-sub);font-size:12.5px">Tap a row to open it</span></div>
     <div style="overflow-x:auto"><table class="lf-hist"><thead><tr><th>Date</th><th>Order</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>AWB</th></tr></thead><tbody>
     ${all.map(x=>{const s2=_lfStatus(x);return `<tr class="${x.order_id===o.order_id?"cur":""}" onclick="lfFocus('${_lfE(x.order_id)}')"><td>${_lfE(_lfT(x.placed_at))}</td><td><b>${_lfE(x.order_id)}</b></td>
       <td><div class="lf-mini">${(x.items||[]).slice(0,4).map(i=>{const p=_lfProd(i),u=p&&p.images&&p.images[0];return u?`<img src="${_lfE(u)}" alt="" title="${_lfE(i.name)} · ${_lfE(i.size||"")}" loading="lazy">`:`<span title="${_lfE(i.name)}">👖</span>`;}).join("")}</div></td>
       <td>${inr(x.total)}</td><td>${_lfE(_lfPayMode(x))}</td><td><span class="lf-pill ${s2.cls}">${_lfE(s2.txt)}</span></td><td>${_lfE(x.tracking_id||"—")}</td></tr>`;}).join("")}
     </tbody></table></div></div>
  </div>

  <div class="lf-card lf-qa" style="position:sticky;top:12px"><div class="lf-k">⚡ Quick actions</div>
    <input type="search" placeholder="Search actions…" oninput="lfFilterQA(this.value)" aria-label="Search quick actions">
    <div class="lf-qa-l" id="lf-qa-l">${qa.map(a=>`<button onclick="${a.f}"><span>${a.i}</span>${_lfE(a.t)}</button>`).join("")}</div>
    <div class="lf-qa-empty" id="lf-qa-empty" hidden>No matching action.</div></div>
  </div>`;
}
function _lfNoteHtml(n){return `<div class="lf-note"><p>${_lfE(n.note)}</p><small><span>${_lfE(n.author||"Admin")}${n.order_id?` · ${_lfE(n.order_id)}`:""}</span><span>${_lfE(_lfT(n.created_at))} <button class="lf-ic" title="Delete comment" onclick="lfDeleteNote(${+n.id})">🗑</button></span></small></div>`;}
function lfFilterQA(q){q=q.toLowerCase().trim();let n=0;document.querySelectorAll("#lf-qa-l button").forEach(b=>{const show=!q||b.textContent.toLowerCase().includes(q);b.hidden=!show;if(show)n++;});const e=document.getElementById("lf-qa-empty");if(e)e.hidden=n>0;}
function _lfFocusOrder(){const d=_lf.data;return d.orders.find(x=>x.order_id===_lf.focus)||d.orders[0];}
async function lfAddNote(){
  const ta=document.getElementById("lf-note-in"),note=ta.value.trim();if(!note){ta.focus();return;}
  const o=_lfFocusOrder(),d=_lf.data;
  const author=(window._adminEmail||"Admin").split("@")[0];
  try{const r=await _lfCall({action:"addNote",note,author,phone:o.phone||d.customer.phone,email:o.email||d.customer.email,orderId:document.getElementById("lf-note-ord").checked?o.order_id:""});
    d.notes=[r.note,...(d.notes||[])];lfRender();showToast("Comment added",true);}
  catch(e){showToast("Couldn't add the comment — "+e.message,false);}
}
async function lfDeleteNote(id){
  if(!confirm("Delete this comment?"))return;
  try{await _lfCall({action:"deleteNote",noteId:id});_lf.data.notes=(_lf.data.notes||[]).filter(n=>+n.id!==+id);lfRender();lfCloseModal();showToast("Comment deleted",true);}
  catch(e){showToast("Couldn't delete — "+e.message,false);}
}
function lfModal(html){document.getElementById("lf-mbody").innerHTML=html;document.getElementById("lf-modal").hidden=false;}
function lfCloseModal(){const m=document.getElementById("lf-modal");if(m)m.hidden=true;}
document.addEventListener("keydown",e=>{if(e.key==="Escape")lfCloseModal();});
function lfAllNotes(){lfModal(`<h3 style="margin:0 0 6px">Comments (${(_lf.data.notes||[]).length})</h3>${(_lf.data.notes||[]).map(_lfNoteHtml).join("")}`);}
function lfBill(){
  const o=_lfFocusOrder(), st=_lfStatus(o), sub=(o.items||[]).reduce((s,i)=>s+(+i.price||0)*(+i.qty||1),0);
  const extra=(+o.total||0)-sub;
  lfModal(`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><h3 style="margin:0">Items & bill</h3><span class="lf-pill ${st.cls}">${_lfE(st.txt)}</span></div>
   <div style="color:var(--lf-sub);font-size:12.5px;margin-bottom:6px">Order ${_lfE(o.order_id)} · ${_lfE(_lfDT(o.placed_at))}</div>
   <table class="lf-bill" style="width:100%;border-collapse:collapse">
   ${(o.items||[]).map(i=>`<tr><td>${_lfE(i.name)}<small>${_lfE(i.qty||1)} × ${inr(i.price)} · Size ${_lfE(i.size||"—")}</small></td><td>${inr((+i.price||0)*(+i.qty||1))}</td></tr>`).join("")}
   <tr><td>Item total</td><td>${inr(sub)}</td></tr>
   ${extra>0?`<tr><td>${o.payment_mode==="partial_cod"?"COD charge":"Other charges"}</td><td>${inr(extra)}</td></tr>`:""}
   ${extra<0?`<tr><td>Discount</td><td>− ${inr(-extra)}</td></tr>`:""}
   <tr><td>Shipping</td><td style="color:var(--lf-info)">FREE</td></tr>
   ${o.payment_mode==="partial_cod"?`<tr><td>Paid online</td><td>${inr(o.amount_paid_online)}</td></tr><tr class="due"><td>Due at delivery (cash)</td><td>${inr(o.cod_due)}</td></tr>`:""}
   <tr class="tot"><td>Order total</td><td>${inr(o.total)}</td></tr></table>
   <div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><button class="lf-btn" onclick="lfCopy(${_lfE(JSON.stringify((o.items||[]).map(i=>`${i.name} (${i.size||"-"}) x${i.qty||1} = ₹${(+i.price||0)*(+i.qty||1)}`).join("\n")+`\nTotal ₹${o.total}`))},'Bill copied')">📋 Copy bill</button></div>`);
}
function lfWaUpdate(kind){
  const o=_lfFocusOrder();if(typeof shipWaMessage!=="function"||!o.phone)return;
  const m=shipWaMessage({orderId:o.order_id,name:o.customer_name,phone:o.phone,courierPartner:o.courier_partner,trackingId:o.tracking_id,paymentMode:o.payment_mode,codDue:o.cod_due},kind);
  window.open(`https://wa.me/91${o.phone}?text=${encodeURIComponent(m)}`,"_blank","noopener");
}
function lfWinBack(){
  const o=_lfFocusOrder();if(typeof abMessage!=="function"||!o.phone)return;
  window.open(`https://wa.me/91${o.phone}?text=${encodeURIComponent(abMessage(o))}`,"_blank","noopener");
}
function lfEditOrder(){
  const o=_lfFocusOrder();apTab("orders");
  setTimeout(()=>{try{if(typeof toggleOrderEditor==="function")toggleOrderEditor(o.order_id);const el=document.getElementById("ord-edit-"+o.order_id);if(el)el.scrollIntoView({behavior:"smooth",block:"center"});}catch(e){}},300);
}
setTimeout(_lfDrawRecent,0);
/* ===== WHATSAPP RECOVERY (abandoned checkouts) =====
   One row per PERSON (latest attempt), one tap opens WhatsApp with a ready
   message + a link that rebuilds their exact bag. Tracks who was messaged
   and who came back and bought (server matches by phone). */
let _abTab="todo";
function _abFirst(n){n=String(n||"").trim().split(/\s+/)[0]||"";return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"";}
function abResumeLink(o){
  const parts=(o.items||[]).filter(i=>i&&(i.id||i.name)).map(i=>[i.id||("name:"+i.name),i.size||"",Math.max(1,parseInt(i.qty,10)||1)].map(x=>encodeURIComponent(String(x))).join("~"));
  return "https://365dropstore.com/checkout?bag="+parts.join(",")+"&utm_source=whatsapp&utm_medium=recovery";
}
function abMessage(o){
  const fn=_abFirst(o.customer_name);
  const it=(o.items||[]);const first=it[0]||{};
  let itemTxt=_abItemName(first.name)+(first.size?` in ${first.size}`:"");
  if(it.length>1)itemTxt+=` (+${it.length-1} more)`;
  const cfg=(typeof getPayCfg==="function")?getPayCfg():{};
  const tot=Number(o.total)||0;
  let adv=0;try{if(cfg.partialCod)adv=computePartialAdvance(cfg,tot);}catch(e){}
  const lines=[
    `Hi${fn?" "+fn:""} 👋 365 Drop Store here.`,
    `You were checking out the ${itemTxt}, looks like the payment didn't go through.`,
    ``,
    `Your bag is saved, finish in one tap:`,
    abResumeLink(o)];
  const fk=_payFailKind(o.pay_fail_reason);
  if(fk==="unsupported")lines.push(``,`(Some wallet apps like FamPay can't pay us. GPay, PhonePe or Paytm work fine.)`);
  else if(fk==="timeout")lines.push(``,`(UPI requests expire in a few minutes, so approve it in your UPI app right away.)`);
  if(adv&&adv<tot)lines.push(``,`Prefer paying on delivery? Pay just ₹${adv.toLocaleString("en-IN")} now, rest in cash when it arrives.`);
  lines.push(``,`Not sure about the size? Just reply here, we'll help 🙂`);
  return lines.join("\n");
}
function _abGroups(){
  const by={};
  (abandonedOrders||[]).forEach(o=>{const k=o.phone||("id:"+o.order_id);(by[k]=by[k]||[]).push(o);});
  return Object.values(by).map(list=>{
    list.sort((a,b)=>new Date(b.placed_at)-new Date(a.placed_at));
    const o=list[0];
    const recovered=list.find(x=>x.recovered_order_id);
    const sent=list.map(x=>x.recovery_wa_sent_at).filter(Boolean).sort().pop()||null;
    return {o,attempts:list.length,recovered,sent,state:recovered?"won":sent?"sent":"todo"};
  }).sort((a,b)=>new Date(b.o.placed_at)-new Date(a.o.placed_at));
}
function _abAgo(iso){
  const t=iso?new Date(iso).getTime():NaN; if(!isFinite(t))return "—";
  const m=Math.max(0,Math.floor((Date.now()-t)/60000));
  return m<1?"just now":m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;
}
function setAbTab(t){_abTab=t;renderAbandonedList();}
function renderAbandonedList(){
  const el=document.getElementById("abandoned-list"); if(!el)return;
  const g=_abGroups();
  const cnt=document.getElementById("ab-cnt");
  const todo=g.filter(x=>x.state==="todo"),sent=g.filter(x=>x.state==="sent"),won=g.filter(x=>x.state==="won");
  if(cnt)cnt.textContent=`(${todo.length} to message)`;
  if(!g.length){el.innerHTML='<p style="color:var(--off);font-size:13px;padding-top:10px">No abandoned checkouts right now — nice.</p>';return;}
  const left=todo.concat(sent).reduce((s,x)=>s+(Number(x.o.total)||0),0);
  const wonVal=won.reduce((s,x)=>s+(Number(x.recovered.recovered_total)||0),0);
  const list=_abTab==="todo"?todo:_abTab==="sent"?sent:_abTab==="won"?won:g;
  const tab=(k,l,n)=>`<button class="ab-tab${_abTab===k?" on":""}" onclick="setAbTab('${k}')">${l} <b>${n}</b></button>`;
  el.innerHTML=`<div class="ab-sum"><div><b>${g.length}</b><span>people</span></div><div><b>${inr(left)}</b><span>still waiting</span></div><div><b>${won.length}</b><span>came back &amp; bought${wonVal?` · ${inr(wonVal)}`:""}</span></div><div><b>${sent.length+won.filter(x=>x.sent).length}</b><span>messaged</span></div></div>
    <div class="ab-tabs">${tab("todo","To message",todo.length)}${tab("sent","Messaged",sent.length)}${tab("won","Bought",won.length)}${tab("all","All",g.length)}</div>
    ${list.length?list.map(x=>_abRow(x)).join(""):`<p class="ab-empty">${_abTab==="todo"?"Everyone's been messaged. 🙌":"Nothing here yet."}</p>`}`;
}
function _abRow(x){
  const o=x.o;
  const items=(o.items||[]).map(i=>`${_dspEsc(_abItemName(i.name))}${i.size?` · ${_dspEsc(i.size)}`:""}${(i.qty||1)>1?` ×${i.qty}`:""}`).join("<br>")||"—";
  const mode=o.payment_mode==="partial_cod"?"Partial COD":o.payment_mode==="cod"?"COD":"Prepaid";
  let actions="";
  if(x.state==="won"){
    actions=`<span class="ab-won">✓ Bought ${_dspEsc(x.recovered.recovered_order_id)}${x.recovered.recovered_total?" · "+inr(x.recovered.recovered_total):""}${x.sent?" after your message":""}</span>`;
  }else if(o.phone){
    actions=`<button class="ab-wa" onclick="abSendWa('${_dspEsc(o.order_id)}')">${x.state==="sent"?"Message again":"WhatsApp"}</button>
      <button class="tb" onclick="abCopyLink('${_dspEsc(o.order_id)}')" title="Copy the bag link">Copy link</button>
      <button class="tb lf-open" onclick="lfOpen('${_dspEsc(o.order_id)}')">🔎 Lifeline</button>
      ${x.state==="sent"?`<span class="ab-sent">Messaged ${_abAgo(x.sent)} · <a onclick="abMark('${_dspEsc(o.order_id)}',false)">undo</a></span>`:""}`;
  }else actions=`<span class="ab-sent">No phone number</span>`;
  const fresh=(Date.now()-new Date(o.placed_at).getTime())<30*60000&&x.state==="todo";
  const fk=_payFailKind(o.pay_fail_reason);
  const why=`<span class="ab-why ab-why-${fk}">${_PAY_FAIL_LABEL[fk]||"Payment failed"}${(o.pay_fail_count||0)>1?` ×${o.pay_fail_count}`:""}</span>`;
  return `<div class="ab-row ab-${x.state}">
    <div class="ab-top"><b>${_dspEsc(o.customer_name||"—")}</b><span>${o.phone?_dspEsc(o.phone):""}</span>${why}<span class="ab-ago">${_abAgo(o.placed_at)}${x.attempts>1?` · ${x.attempts} tries`:""}</span></div>
    <div class="ab-mid"><div class="ab-items">${items}</div><div class="ab-val">${o.total?inr(o.total):"—"}<small>${mode}</small></div></div>
    ${fresh?`<div class="ab-note">Just left — they may still be paying. Best to message after 30 min.</div>`:""}
    <div class="ab-act">${actions}</div></div>`;
}
function _abFind(id){return (abandonedOrders||[]).find(o=>o.order_id===id);}
function abSendWa(id){
  const o=_abFind(id); if(!o||!o.phone)return;
  const url=`https://wa.me/91${o.phone}?text=${encodeURIComponent(abMessage(o))}`;
  window.open(url,"_blank","noopener");
  abMark(id,true);
}
function abCopyLink(id){
  const o=_abFind(id); if(!o)return;
  const t=abResumeLink(o);
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>showToast("Bag link copied",true)).catch(()=>{prompt("Copy this link:",t);});
}
async function abMark(id,sent){
  const o=_abFind(id); if(!o)return;
  const prev=o.recovery_wa_sent_at;
  // mark every attempt from this person so the row moves tabs as one
  const same=(abandonedOrders||[]).filter(x=>(x.phone&&x.phone===o.phone)||x.order_id===id);
  same.forEach(x=>{x.recovery_wa_sent_at=sent?new Date().toISOString():null;});
  renderAbandonedList();
  try{
    const r=await fetch(SB_FN_BASE+"admin-orders",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,action:"setRecovery",orderId:id,sent})});
    const d=await r.json(); if(d.error)throw new Error(d.error);
  }catch(e){
    same.forEach(x=>{x.recovery_wa_sent_at=prev;}); renderAbandonedList();
    showToast("Couldn't save the 'messaged' mark — "+(e.message||"try again"),false);
  }
}
// ===== PRODUCT SEQUENCE =====
let _seqPending=false;
function populateFsBulkFits(){
  const sel=document.getElementById("fs-bulk-fit");
  if(!sel||sel.options.length)return; // populate once; fit list doesn't change at runtime
  const fits=[...new Set(products.map(p=>p.fit).filter(Boolean))].sort();
  sel.innerHTML=fits.map(f=>`<option value="${f.replace(/"/g,"&quot;")}">${f}</option>`).join("");
}
async function fsBulkSet(enabled){
  const fit=(document.getElementById("fs-bulk-fit")||{}).value;
  if(!fit)return;
  const statusEl=document.getElementById("fs-bulk-status");
  const targets=products.filter(p=>p.fit===fit);
  if(!targets.length){if(statusEl)statusEl.textContent="No products found for that fit.";return;}
  if(statusEl){statusEl.textContent=`${enabled?"Enabling":"Disabling"} for ${targets.length} ${fit} product${targets.length>1?"s":""}...`;statusEl.style.color="var(--off)";}
  targets.forEach(p=>{p.fitStudioEnabled=enabled;});
  try{
    const results=await Promise.all(targets.map(p=>
      fetch(SB_FN_BASE+"admin-product-meta",{
        method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
        body:JSON.stringify({password:_adminPw,id:p.id,soldCount:p.soldCount,shade:p.shade||"",
          sizeGuideMode:p.sizeGuideMode,customSizeGuide:p.customSizeGuide,fitStudioEnabled:enabled})
      }).then(r=>r.json())
    ));
    const failed=results.filter(r=>r.error);
    if(failed.length){
      if(statusEl){statusEl.textContent=`⚠️ ${failed.length} of ${targets.length} failed to save. Try again.`;statusEl.style.color="#e88a80";}
    }else{
      try{localStorage.setItem("ds_p",JSON.stringify(products));}catch(e){}
      if(statusEl){statusEl.textContent=`✓ ${enabled?"Enabled":"Disabled"} for all ${targets.length} ${fit} products.`;statusEl.style.color="#4ade80";}
    }
  }catch(e){
    if(statusEl){statusEl.textContent="⚠️ Network error — some products may not have saved.";statusEl.style.color="#e88a80";}
  }
}
function renderSequenceList(){
  populateFsBulkFits();
  const q=(document.getElementById("seq-search")||{value:""}).value.trim().toLowerCase();
  const list=document.getElementById("seq-list");
  if(!list)return;
  // Sort by current order (matches the storefront's own default sort exactly),
  // then filter for display -- filtering never changes underlying order values.
  const all=[...products].sort((a,b)=>(a.order||99)-(b.order||99));
  const shown=q?all.filter(p=>(p.name||"").toLowerCase().includes(q)||(p.fit||"").toLowerCase().includes(q)||(p.id||"").toLowerCase().includes(q)):all;
  if(!shown.length){list.innerHTML='<p style="color:var(--off);font-size:13px">No products match.</p>';return;}
  list.innerHTML=shown.map((p,i)=>{
    const globalIdx=all.indexOf(p);
    const img=(p.images||[])[0]||"";
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.02)">
      <span style="font-size:11px;color:var(--off);width:26px;flex:0 0 26px">#${p.order||"?"}</span>
      ${img?`<img src="${img}" style="width:34px;height:44px;object-fit:cover;border-radius:4px;flex:0 0 34px"/>`:'<div style="width:34px;height:44px;background:var(--bg2);border-radius:4px;flex:0 0 34px"></div>'}
      <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name||""}</div>
      <div style="font-size:11px;color:var(--off)">${p.fit||""}</div></div>
      <div style="display:flex;gap:4px;flex:0 0 auto">
        <button class="tb" onclick="seqMove('${p.id}','top')" title="Move to top" ${globalIdx===0?"disabled":""}>⤒</button>
        <button class="tb" onclick="seqMove('${p.id}','up')" title="Move up" ${globalIdx===0?"disabled":""}>↑</button>
        <button class="tb" onclick="seqMove('${p.id}','down')" title="Move down" ${globalIdx===all.length-1?"disabled":""}>↓</button>
      </div>
    </div>`;
  }).join("");
}
function seqMove(id,dir){
  if(_seqPending)return; // ignore rapid double-taps mid-save
  const all=[...products].sort((a,b)=>(a.order||99)-(b.order||99));
  const idx=all.findIndex(p=>p.id===id);
  if(idx<0)return;
  if(dir==="up"&&idx>0){[all[idx-1],all[idx]]=[all[idx],all[idx-1]];}
  else if(dir==="down"&&idx<all.length-1){[all[idx+1],all[idx]]=[all[idx],all[idx+1]];}
  else if(dir==="top"&&idx>0){const [item]=all.splice(idx,1);all.unshift(item);}
  else return;
  // Renumber the FULL list 1..N by construction -- no duplicates or gaps
  // are possible because every value is freshly assigned from scratch here,
  // never incremented or shifted relative to a previous number.
  all.forEach((p,i)=>{p.order=i+1;});
  renderSequenceList();
  seqSaveAll(all);
}
async function seqSaveAll(all){
  _seqPending=true;
  const statusEl=document.getElementById("seq-status");
  if(statusEl){statusEl.textContent="Saving order...";statusEl.style.color="var(--off)";}
  try{
    const results=await Promise.all(all.map(p=>
      fetch(SB_FN_BASE+"admin-product-meta",{
        method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
        body:JSON.stringify({password:_adminPw,id:p.id,soldCount:p.soldCount,shade:p.shade||"",
          sizeGuideMode:p.sizeGuideMode,customSizeGuide:p.customSizeGuide,displayOrder:p.order})
      }).then(r=>r.json())
    ));
    const failed=results.filter(r=>r.error);
    if(failed.length){
      if(statusEl){statusEl.textContent="⚠️ "+failed.length+" product(s) failed to save — reordering may be incomplete. Try again.";statusEl.style.color="#C0392B";}
    }else{
      try{localStorage.setItem("ds_p",JSON.stringify(products));}catch(e){}
      if(statusEl){statusEl.textContent="✓ Order saved";statusEl.style.color="#2ecc71";}
    }
  }catch(e){
    if(statusEl){statusEl.textContent="⚠️ Network error — order may not have saved. Try again.";statusEl.style.color="#C0392B";}
  }finally{
    _seqPending=false;
  }
}
let _dashRange="30d";
function setDashRange(r){_dashRange=r;renderDashboard();}
function _dashFiltered(){
  const now=Date.now();
  let cutoff=0,upper=now;
  if(_dashRange==="today"){const d=new Date();d.setHours(0,0,0,0);cutoff=d.getTime();}
  else if(_dashRange==="7d")cutoff=now-7*86400000;
  else if(_dashRange==="30d")cutoff=now-30*86400000;
  else if(_dashRange==="month"){const d=new Date();d.setDate(1);d.setHours(0,0,0,0);cutoff=d.getTime();}
  else if(_dashRange==="custom"){
    const fromEl=document.getElementById("dash-custom-from"),toEl=document.getElementById("dash-custom-to");
    if(fromEl&&fromEl.value)cutoff=new Date(fromEl.value+"T00:00:00").getTime();
    if(toEl&&toEl.value)upper=new Date(toEl.value+"T23:59:59").getTime();
  }
  // "all" leaves cutoff at 0
  return orders.filter(o=>o.placedAt>=cutoff && o.placedAt<=upper && ["confirmed","fulfilled"].includes(o.status));
}
let _dashLastList=[];
function renderDashboard(){
  document.querySelectorAll("#dash-range .sfd-rbtn").forEach(b=>b.classList.toggle("on",b.dataset.r===_dashRange));
  const list=_dashFiltered();
  _dashLastList=list;
  const revenue=list.reduce((s,o)=>s+(Number(o.total)||0),0);
  const n=list.length;
  const aov=n?Math.round(revenue/n):0;
  const units=list.reduce((s,o)=>s+(o.items||[]).reduce((si,i)=>si+(Number(i.qty)||1),0),0);

  const statsEl=document.getElementById("dash-stats");
  if(statsEl)statsEl.innerHTML=[
    ["Revenue",inr(revenue)],["Orders",n],["AOV",inr(aov)],["Units Sold",units]
  ].map(([k,v])=>`<div class="apstat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join("");

  // Channel breakdown
  const byChan={};
  list.forEach(o=>{const c=o.channel||"website";byChan[c]=byChan[c]||{n:0,rev:0};byChan[c].n++;byChan[c].rev+=Number(o.total)||0;});
  const chanLabel={website:"Website",whatsapp:"WhatsApp",walkin:"Walk-in / Store",instagram:"Instagram"};
  const chanEl=document.getElementById("dash-channel");
  if(chanEl){
    const rows=Object.keys(byChan).sort((a,b)=>byChan[b].rev-byChan[a].rev);
    chanEl.innerHTML=rows.length?rows.map(c=>`<div class="sfd-row">
      <span>${chanLabel[c]||c}</span><span><b>${inr(byChan[c].rev)}</b> <span class="off">(${byChan[c].n})</span></span></div>`).join("")
      :'<p style="color:#8A8683;font-size:12.5px">No orders in this range.</p>';
  }

  // Payment method breakdown
  const byPay={};
  list.forEach(o=>{const p=o.paymentMode||"prepaid";byPay[p]=byPay[p]||{n:0,rev:0};byPay[p].n++;byPay[p].rev+=Number(o.total)||0;});
  const payLabel={prepaid:"Prepaid",cod:"Cash on Delivery",partial_cod:"Partial COD"};
  const payEl=document.getElementById("dash-paymethod");
  if(payEl){
    const rows=Object.keys(byPay).sort((a,b)=>byPay[b].rev-byPay[a].rev);
    payEl.innerHTML=rows.length?rows.map(p=>`<div class="sfd-row">
      <span>${payLabel[p]||p}</span><span><b>${inr(byPay[p].rev)}</b> <span class="off">(${byPay[p].n})</span></span></div>`).join("")
      :'<p style="color:#8A8683;font-size:12.5px">No orders in this range.</p>';
  }

  // Outstanding COD due -- money that's confirmed sold but not yet in hand.
  // Deliberately NOT date-filtered by _dashRange: an order placed 3 weeks ago
  // with cash still due at delivery is still real outstanding cash today,
  // regardless of which reporting window is selected.
  const codWrap=document.getElementById("dash-coddue-wrap");
  if(codWrap){
    const outstanding=orders.filter(o=>["confirmed"].includes(o.status)&&Number(o.codDue||0)>0);
    const total=outstanding.reduce((s,o)=>s+Number(o.codDue||0),0);
    codWrap.innerHTML=outstanding.length?`<div class="box">
      <b>${inr(total)} still to collect</b> <span class="off">across ${outstanding.length} confirmed COD/Partial COD order${outstanding.length>1?"s":""} not yet marked fulfilled</span>
    </div>`:"";
  }

  // Top products by units, computed from this range's orders
  const byProd={};
  list.forEach(o=>(o.items||[]).forEach(i=>{
    const key=i.name||"Unknown";
    byProd[key]=byProd[key]||{units:0,rev:0};
    byProd[key].units+=Number(i.qty)||1;
    byProd[key].rev+=(Number(i.price)||0)*(Number(i.qty)||1);
  }));
  const prodEl=document.getElementById("dash-products");
  const prodCountEl=document.getElementById("dash-prod-count");
  if(prodCountEl)prodCountEl.textContent=Object.keys(byProd).length?`(${Object.keys(byProd).length} sold)`:"";
  if(prodEl){
    const rows=Object.keys(byProd).sort((a,b)=>byProd[b].units-byProd[a].units).slice(0,10);
    prodEl.innerHTML=rows.length?rows.map((name,i)=>`<div class="sfd-row">
      <span><span class="off" style="margin-right:8px">${String(i+1).padStart(2,"0")}</span>${name}</span>
      <span><b>${byProd[name].units}</b> <span class="off">units</span> &middot; ${inr(byProd[name].rev)}</span></div>`).join("")
      :'<p style="color:#8A8683;font-size:12.5px">No sales in this range.</p>';
  }

  // Daily revenue bars -- one bar per calendar day covered by the current
  // range, capped at 60 bars so a full "All time" view stays legible rather
  // than rendering hundreds of illegible slivers.
  renderCustomerPanel();
  const dailyEl=document.getElementById("dash-daily");
  if(dailyEl){
    const byDay={};
    list.forEach(o=>{
      const d=new Date(o.placedAt);d.setHours(0,0,0,0);
      const key=d.getTime();
      byDay[key]=(byDay[key]||0)+(Number(o.total)||0);
    });
    let days=Object.keys(byDay).map(Number).sort((a,b)=>a-b);
    if(days.length>60)days=days.slice(-60);
    if(!days.length){
      dailyEl.innerHTML='<p style="color:#8A8683;font-size:12.5px">No sales in this range.</p>';
    }else{
      const max=Math.max(...days.map(d=>byDay[d]),1);
      const bars=days.map(d=>{
        const v=byDay[d];
        const pct=Math.max(2,Math.round(v/max*100));
        return `<div class="sfd-bar" style="height:${pct}%" data-v="${inr(v)}"></div>`;
      }).join("");
      const labels=days.map(d=>`<span>${new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>`).join("");
      dailyEl.innerHTML=`<div class="sfd-bar-wrap">${bars}</div><div class="sfd-daylabels">${labels}</div>`;
    }
  }
}
// CSV export -- three sections in one file (summary, channel/payment
// breakdown, order-level detail) so it opens straight into Excel/Sheets
// with everything from the current range in one place. UTF-8 BOM included
// so ₹ and non-ASCII customer names render correctly in Excel specifically
// (Excel mis-decodes UTF-8 without it).
function _csvCell(v){
  const s=String(v==null?"":v);
  return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function exportDashboardCSV(){
  const list=_dashLastList||[];
  const lines=[];
  lines.push(["365 Drop Store — Sales Export"].map(_csvCell).join(","));
  lines.push(["Range",_dashRange,"Generated",new Date().toLocaleString("en-IN")].map(_csvCell).join(","));
  lines.push([]);
  lines.push(["Order ID","Date","Channel","Payment Mode","Status","Items","Total","COD Due","Customer","Phone"].map(_csvCell).join(","));
  list.forEach(o=>{
    const itemsStr=(o.items||[]).map(i=>`${i.name} (${i.size||""}) x${i.qty||1}`).join(" | ");
    lines.push([
      o.orderId, new Date(o.placedAt).toLocaleString("en-IN"), o.channel||"website",
      o.paymentMode||"prepaid", o.status, itemsStr, o.total, o.codDue||0, o.name, o.phone
    ].map(_csvCell).join(","));
  });
  const csv="\uFEFF"+lines.join("\r\n"); // BOM for Excel
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="365dropstore-sales-"+_dashRange+"-"+new Date().toISOString().slice(0,10)+".csv";
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV downloaded — "+list.length+" orders",true);
}
function clearOrderFilters(){
  ["ord-f-from","ord-f-to","ord-f-channel","ord-f-paymode"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  rnAdmOrders();
}
function _filteredOrders(){
  const from=(document.getElementById("ord-f-from")||{}).value;
  const to=(document.getElementById("ord-f-to")||{}).value;
  const channel=(document.getElementById("ord-f-channel")||{}).value;
  const paymode=(document.getElementById("ord-f-paymode")||{}).value;
  const fromTs=from?new Date(from+"T00:00:00").getTime():0;
  const toTs=to?new Date(to+"T23:59:59").getTime():Infinity;
  return orders.filter(o=>{
    if(o.placedAt<fromTs||o.placedAt>toTs)return false;
    if(channel&&(o.channel||"website")!==channel)return false;
    if(paymode&&(o.paymentMode||"prepaid")!==paymode)return false;
    return true;
  });
}
function rnAdmOrders(){
  const filtered=_filteredOrders();
  document.getElementById("ocnt").textContent=filtered.length===orders.length
    ?(orders.length?`(${orders.length})`:"")
    :`(${filtered.length} of ${orders.length})`;
  const pend=filtered.filter(o=>o.status==="pending").length;
  const conf=filtered.filter(o=>o.status==="confirmed").length;
  const fulf=filtered.filter(o=>o.status==="fulfilled").length;
  const canc=filtered.filter(o=>o.status==="cancelled").length;
  document.getElementById("ordstats").innerHTML=`<div class="apstat"><div class="v">${filtered.length}</div><div class="k">Total</div></div><div class="apstat"><div class="v">${pend}</div><div class="k">Pending</div></div><div class="apstat"><div class="v">${conf}</div><div class="k">Confirmed</div></div><div class="apstat"><div class="v">${fulf}</div><div class="k">Fulfilled</div></div>`;
  const list=document.getElementById("ord-list");
  if(!filtered.length){list.innerHTML='<p style="color:var(--off);font-size:13px">No orders match these filters.</p>';return;}
  const orders_=filtered;
  const statusColor={pending:"#C0392B",confirmed:"#2980B9",fulfilled:"#27AE60",cancelled:"#7A756E"};
  // Repeat-customer map across ALL orders (not just the filtered view)
  const byPhone={};orders.forEach(x=>{const k=_normPhone(x.phone);if(/^[6-9]\d{9}$/.test(k))(byPhone[k]=byPhone[k]||[]).push(x);});
  Object.values(byPhone).forEach(a=>a.sort((a,b)=>a.placedAt-b.placedAt));
  list.innerHTML=orders_.map(o=>{
    const hist=byPhone[_normPhone(o.phone)]||[]; const nth=hist.indexOf(o)+1;
    const repeatBadge=hist.length>1?`<button class="rep-badge" onclick="showCustomerHistory('${_normPhone(o.phone)}')" title="See this customer's full history">↩ Order ${nth} of ${hist.length}</button>`:"";
    const itemsHtml=(o.items||[]).map(i=>{
      const attrs=[i.size,i.color].filter(Boolean).join(", ");
      return `${i.name}${attrs?" ("+attrs+")":""} x${i.qty} — ${inr(i.price*i.qty)}`;
    }).join("<br>");
    const when=new Date(o.placedAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
    const waLink=`https://wa.me/91${o.phone}`;
    return`<div style="border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <b style="color:var(--white)">${o.orderId}</b>
          <span style="color:var(--off);font-size:12.5px;margin-left:8px">${when}</span>
        </div>
        <select onchange="setOrderStatus('${o.orderId}',this.value)" style="font-size:12.5px;padding:5px 8px;border-radius:6px;border:1px solid var(--line);background:#fff;color:${statusColor[o.status]||'#141312'};font-weight:700">
          <option value="pending" ${o.status==="pending"?"selected":""}>Pending</option>
          <option value="confirmed" ${o.status==="confirmed"?"selected":""}>${o.trackingId?"Confirmed · Shipped":"Confirmed · Packing"}</option>
          <option value="fulfilled" ${o.status==="fulfilled"?"selected":""}>Delivered</option>
          <option value="cancelled" ${o.status==="cancelled"?"selected":""}>Cancelled</option>
        </select>
        <button class="tb" onclick="toggleTrackingEditor('${o.orderId}')" title="Add or edit courier tracking">${o.trackingId?"✎ Tracking":"+ Tracking"}</button>
        <button class="tb" onclick="toggleOrderEditor('${o.orderId}')" title="Edit customer, items or amounts">✎ Edit</button>
        <button class="tb tb-del" onclick="deleteOrder('${o.orderId}')" title="Delete this order permanently" style="margin-left:6px">Delete</button>
      </div>
      <div style="margin-top:10px;font-size:13.5px;color:var(--white);display:flex;align-items:center;gap:6px;flex-wrap:wrap"><a class="lf-name-link" onclick="lfOpen('${o.orderId}')" title="Open in Customer Lifeline">${o.name}</a> · <a href="${waLink}" target="_blank" rel="noopener" style="color:#2980B9">${o.phone}</a> ${repeatBadge}<button class="tb lf-open" onclick="lfOpen('${o.orderId}')">🔎 Lifeline</button></div>
      <div id="ord-edit-${o.orderId}" class="oe-box" style="display:none"></div>
      <div style="font-size:13px;color:var(--off);margin-top:2px">${o.addr} — ${o.pin}</div>
      <div style="font-size:13px;color:var(--off);margin-top:8px;line-height:1.6">${itemsHtml}</div>
      <div style="margin-top:8px;font-weight:700;color:var(--white)">Total: ${inr(o.total)}</div>
      ${o.trackingId?`<div style="margin-top:6px;font-size:12.5px;color:#2980B9">📦 ${o.courierPartner} · AWB ${o.trackingId}</div>`:""}${o.courierOrderId?`<div style="margin-top:3px;font-size:11.5px;color:var(--off)">🔒 Courier order ID (internal): <b>${o.courierOrderId}</b></div>`:""}${_shipWaBtns(o)}
      <div id="trk-editor-${o.orderId}" style="display:none;margin-top:10px;padding:12px;background:var(--bg2,rgba(0,0,0,.03));border-radius:8px;border:1px solid var(--line)">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="trk-courier-${o.orderId}" style="flex:1;min-width:130px">
            <option value="">Courier…</option>
            ${["Delhivery","Shiprocket","Blue Dart","DTDC","Ecom Express","Xpressbees","Borzo","India Post","Other"].map(c=>`<option value="${c}" ${o.courierPartner===c?"selected":""}>${c}</option>`).join("")}
          </select>
          <input type="text" id="trk-awb-${o.orderId}" placeholder="AWB — customer sees this" value="${(o.trackingId||"").replace(/"/g,"&quot;")}" style="flex:1;min-width:150px"/>
        </div>
        <input type="text" id="trk-coid-${o.orderId}" placeholder="Courier order ID — internal only, customer never sees it" value="${(o.courierOrderId||"").replace(/"/g,"&quot;")}" style="width:100%;margin-top:8px"/>
        <small style="display:block;margin-top:4px;color:var(--off)">Adding an AWB shows the customer "Shipped". Set the status to Delivered once it lands.</small>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-w" style="font-size:12px;padding:8px 14px" onclick="saveTracking('${o.orderId}')">Save</button>
          ${o.trackingId?`<button class="tb tb-del" style="font-size:12px" onclick="saveTracking('${o.orderId}',true)">Clear tracking</button>`:""}
        </div>
        <small id="trk-msg-${o.orderId}" style="display:block;margin-top:6px;color:var(--off)"></small>
      </div>
      ${(()=>{
        const mode=o.paymentMode||"prepaid";
        const codDue=Number(o.codDue||0);
        const paidOnline=o.amountPaidOnline!=null?Number(o.amountPaidOnline):null;
        if(mode==="cod"&&codDue>0){
          return `<div style="margin-top:8px;padding:8px 10px;background:rgba(192,57,43,.12);border:1px solid rgba(192,57,43,.35);border-radius:7px;font-size:12.5px;font-weight:700;color:#C0392B">💰 Full COD — collect ${inr(codDue)} at delivery</div>`;
        }
        if(mode==="partial_cod"&&codDue>0){
          return `<div style="margin-top:8px;padding:8px 10px;background:rgba(192,57,43,.12);border:1px solid rgba(192,57,43,.35);border-radius:7px;font-size:12.5px;font-weight:700;color:#C0392B">💰 Partial COD — paid ${inr(paidOnline||0)} online, collect ${inr(codDue)} at delivery</div>`;
        }
        if(mode==="prepaid"){
          return `<div style="margin-top:6px;font-size:11.5px;color:var(--off)">Prepaid — nothing due at delivery</div>`;
        }
        return "";
      })()}
    </div>`;
  }).join("");
}
function toggleTrackingEditor(orderId){
  const el=document.getElementById("trk-editor-"+orderId);
  if(el)el.style.display=el.style.display==="none"?"block":"none";
}
/* ===== SHIPPING UPDATES =====
   Emails go automatically from the server (admin-orders v22) when an AWB is
   saved / an order is marked delivered. These buttons send the same update on
   WhatsApp in one tap — for customers who didn't leave an email, or as well. */
function _shipFirst(n){n=String(n||"").trim().split(/\s+/)[0]||"";return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"";}
function shipWaMessage(o,kind){
  const fn=_shipFirst(o.name);
  if(kind==="delivered"){
    return [`Hi${fn?" "+fn:""}, your 365 Drop Store order ${o.orderId} has been delivered 🖤 Hope the fit is perfect!`,``,
      `If the size isn't right, just reply here and we'll help you out.`,``,
      `Wear it loud and tag @365dropstore 🙌`].join("\n");
  }
  const url=courierTrackUrl(o.courierPartner,o.trackingId)||("https://365dropstore.com/?track="+encodeURIComponent(o.orderId));
  const cash=(o.paymentMode==="partial_cod"||o.paymentMode==="cod")&&Number(o.codDue||0)>0?[``,`Please keep ${inr(o.codDue)} cash ready to pay the delivery partner.`]:[];
  return [`Hi${fn?" "+fn:""} 👋 Your 365 Drop Store order ${o.orderId} has shipped!`,``,
    `📦 ${o.courierPartner} · AWB ${o.trackingId}`,`Track it: ${url}`,...cash,``,
    `Usually arrives in 3–5 working days. Any questions, just reply here 🙂`].join("\n");
}
function _shipWaBtns(o){
  if(!o||!o.phone||o.channel==="walkin")return "";
  const b=[];
  if(o.trackingId&&o.status!=="fulfilled"&&o.status!=="cancelled")b.push(`<button class="ship-wa" onclick="shipWa('${_dspEsc(o.orderId)}','shipped')">💬 Send "shipped" on WhatsApp</button>`);
  if(o.status==="fulfilled")b.push(`<button class="ship-wa" onclick="shipWa('${_dspEsc(o.orderId)}','delivered')">💬 Send "delivered" on WhatsApp</button>`);
  return b.length?`<div class="ship-wa-row">${b.join("")}</div>`:"";
}
function shipWa(id,kind){
  const o=orders.find(x=>x.orderId===id); if(!o||!o.phone)return;
  const url=`https://wa.me/91${o.phone}?text=${encodeURIComponent(shipWaMessage(o,kind))}`;
  let w=null;try{w=window.open(url,"_blank","noopener");}catch(e){}
  if(!w)location.href=url;
}
function _emailNote(email,what){
  if(!email)return "";
  if(email.sent)return ` · ${what} email sent to ${email.to}`;
  if(email.reason==="no email on this order")return ` · no email on this order, send it on WhatsApp`;
  return ` · ⚠️ email not sent (${email.reason})`;
}
async function saveTracking(orderId,clear){
  const msg=document.getElementById("trk-msg-"+orderId);
  const courier=clear?"":(document.getElementById("trk-courier-"+orderId)||{}).value||"";
  let trackingId=clear?"":((document.getElementById("trk-awb-"+orderId)||{}).value||"").trim();
  const courierOrderId=clear?"":((document.getElementById("trk-coid-"+orderId)||{}).value||"").trim();
  let courierOut=courier;
  if(!clear&&!trackingId&&courierOrderId){courierOut="";}          // internal id saved on its own, before an AWB exists
  else if(!clear&&(!courier||!trackingId)){
    if(msg){msg.textContent="Pick a courier and enter the AWB (or just the internal courier order ID).";msg.style.color="#C0392B";}
    return;
  }
  if(!_adminPw){showToast("Admin session expired — refresh and log in again.",false);return;}
  if(msg){msg.textContent="Saving…";msg.style.color="";}
  try{
    const res=await fetch(SB_FN_BASE+"admin-orders",{
      method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,action:"setTracking",orderId,trackingId,courierPartner:courierOut,courierOrderId})
    });
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const o=orders.find(x=>x.orderId===orderId);
    if(o){o.trackingId=trackingId;o.courierPartner=courierOut;o.courierOrderId=courierOrderId;}
    showToast(clear?"Tracking cleared":("Tracking saved"+_emailNote(data.email,"Shipped")),!(data.email&&data.email.sent===false&&data.email.reason!=="no email on this order"));
    rnAdmOrders();
  }catch(e){
    if(msg){msg.textContent="Couldn't save: "+e.message;msg.style.color="#C0392B";}
  }
}
/* ===== ADMIN: EDIT AN ORDER ===== */
const _OE_CH=[["website","Website"],["whatsapp","WhatsApp"],["instagram","Instagram DM"],["walkin","Walk-in / Store"]];
const _OE_PAY=[["prepaid","Prepaid (online)"],["partial_cod","Partial COD"],["cod","Full COD"],["cash","Cash"],["upi","UPI"],["card","Card"],["bank","Bank transfer"]];
let _oeSeq=0;
function _oeOpts(list,cur){return list.map(([v,l])=>`<option value="${v}" ${v===cur?"selected":""}>${l}</option>`).join("");}
function _oeProdOpts(it){
  const byId=products.find(p=>p.id===it.id)||products.find(p=>(p.name||"").toLowerCase()===(it.name||"").toLowerCase());
  const keep=byId?"":`<option value="__keep" selected>${_dspEsc(it.name||"—")} (as logged)</option>`;
  return keep+[...products].sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(p=>`<option value="${_dspEsc(p.id)}" ${byId&&byId.id===p.id?"selected":""}>${_dspEsc(p.name)}</option>`).join("");
}
function _oeLine(oid,it){
  const k=++_oeSeq;
  return `<div class="oe-line" data-k="${k}" data-name="${_dspEsc(it.name||"")}" data-id="${_dspEsc(it.id||"")}" data-color="${_dspEsc(it.color||"")}">
    <select class="oe-prod" onchange="oeProdChange(this,'${oid}')">${_oeProdOpts(it)}</select>
    <input class="oe-size" placeholder="Size" value="${_dspEsc(it.size||"")}"/>
    <input class="oe-qty" type="number" min="1" value="${it.qty||1}" oninput="oeRecalc('${oid}')"/>
    <input class="oe-price" type="number" min="0" placeholder="₹ each" value="${it.price!=null?it.price:""}" oninput="oeRecalc('${oid}')"/>
    <button class="tb tb-del" onclick="this.parentNode.remove();oeRecalc('${oid}')" title="Remove item">×</button></div>`;
}
function toggleOrderEditor(oid){
  const box=document.getElementById("ord-edit-"+oid); if(!box)return;
  if(box.style.display!=="none"){box.style.display="none";box.innerHTML="";return;}
  const o=orders.find(x=>x.orderId===oid); if(!o)return;
  const v=x=>_dspEsc(x==null?"":x);
  box.innerHTML=`<div class="oe-grid">
      <label>Name<input id="oe-name-${oid}" value="${v(o.name)}"/></label>
      <label>Phone<input id="oe-phone-${oid}" value="${v(o.phone)}" inputmode="tel"/></label>
      <label class="oe-wide">Address<textarea id="oe-addr-${oid}" rows="2">${v(o.addr)}</textarea></label>
      <label>Pincode<input id="oe-pin-${oid}" value="${v(o.pin)}" inputmode="numeric" maxlength="6"/></label>
      <label>Channel<select id="oe-ch-${oid}">${_oeOpts(_OE_CH,o.channel||"website")}</select></label>
      <label>Payment<select id="oe-pay-${oid}" onchange="oeRecalc('${oid}')">${_oeOpts(_OE_PAY,o.paymentMode||"prepaid")}</select></label>
    </div>
    <div class="oe-h">Items <span>product · size · qty · price each</span></div>
    <div id="oe-lines-${oid}">${(o.items||[]).map(it=>_oeLine(oid,it)).join("")}</div>
    <button class="tb" onclick="document.getElementById('oe-lines-${oid}').insertAdjacentHTML('beforeend',_oeLine('${oid}',{qty:1}));oeRecalc('${oid}')">+ Add item</button>
    <div class="oe-grid" style="margin-top:10px">
      <label>Paid online (₹)<input id="oe-paid-${oid}" type="number" min="0" value="${o.amountPaidOnline!=null?o.amountPaidOnline:""}" oninput="oeRecalc('${oid}')"/></label>
      <label>Collect at delivery (₹)<input id="oe-due-${oid}" type="number" min="0" value="${o.codDue!=null?o.codDue:""}" oninput="oeRecalc('${oid}')"/></label>
      <label>Order total (₹)<input id="oe-total-${oid}" type="number" min="0" value="${o.total||0}" oninput="this.dataset.manual='1';oeRecalc('${oid}')"/></label>
    </div>
    <div class="oe-hint" id="oe-hint-${oid}"></div>
    <div class="oe-act"><button class="btn btn-w" onclick="saveOrderEdit('${oid}')">Save changes</button><button class="tb" onclick="toggleOrderEditor('${oid}')">Cancel</button><small id="oe-msg-${oid}"></small></div>`;
  box.style.display="block"; oeRecalc(oid);
}
function oeProdChange(sel,oid){
  const line=sel.closest(".oe-line"); const p=products.find(x=>x.id===sel.value);
  if(p){line.dataset.id=p.id;line.dataset.name=p.name;const pr=line.querySelector(".oe-price");if(pr&&!pr.value)pr.value=Number(p.offerPrice||p.price||0)||"";}
  oeRecalc(oid);
}
function _oeItems(oid){
  return [...document.querySelectorAll(`#oe-lines-${oid} .oe-line`)].map(l=>({
    id:l.dataset.id||"",name:l.dataset.name||"",color:l.dataset.color||"",
    size:l.querySelector(".oe-size").value.trim(),qty:parseInt(l.querySelector(".oe-qty").value,10)||0,
    price:Number(l.querySelector(".oe-price").value)}));
}
function oeRecalc(oid){
  const items=_oeItems(oid); const sum=items.reduce((s,i)=>s+(Number(i.price)||0)*(i.qty||0),0);
  const pay=(document.getElementById("oe-pay-"+oid)||{}).value;
  const paid=Number((document.getElementById("oe-paid-"+oid)||{}).value)||0, due=Number((document.getElementById("oe-due-"+oid)||{}).value)||0;
  const tot=document.getElementById("oe-total-"+oid); const hint=document.getElementById("oe-hint-"+oid);
  // Total follows the items (or paid+due for COD orders) until you type your own
  const auto=(pay==="partial_cod"||pay==="cod")&&(paid||due)?paid+due:sum;
  if(tot&&!tot.dataset.manual)tot.value=Math.round(auto);
  if(hint){const t=Number(tot&&tot.value)||0;let m=`Items add up to ${inr(sum)}.`;
    if(pay==="partial_cod"||pay==="cod")m+=` Paid ${inr(paid)} + collect ${inr(due)} = ${inr(paid+due)}.`;
    if(t!==Math.round(auto))m+=` <b>Total is set by hand to ${inr(t)}.</b> <a onclick="const e=document.getElementById('oe-total-${oid}');delete e.dataset.manual;oeRecalc('${oid}')">Reset</a>`;
    hint.innerHTML=m;}
}
async function saveOrderEdit(oid){
  const msg=document.getElementById("oe-msg-"+oid); const g=id=>(document.getElementById(id+"-"+oid)||{}).value;
  const fail=t=>{if(msg){msg.textContent="✗ "+t;msg.style.color="#C0392B";}};
  const items=_oeItems(oid);
  if(!items.length)return fail("An order needs at least one item.");
  for(const i of items){if(!i.name)return fail("Pick a product for every item line.");if(!(i.qty>=1))return fail(`Quantity for ${i.name} must be at least 1.`);if(!(i.price>=0))return fail(`Enter a price for ${i.name}.`);}
  if(!_adminPw)return fail("Admin session expired — refresh and log in again.");
  const updates={name:g("oe-name").trim(),phone:g("oe-phone").trim(),address:g("oe-addr").trim(),pincode:g("oe-pin").trim(),
    channel:g("oe-ch"),paymentMode:g("oe-pay"),items,amountPaidOnline:g("oe-paid"),codDue:g("oe-due"),total:Number(g("oe-total"))||0};
  if(msg){msg.textContent="Saving…";msg.style.color="";}
  try{
    const r=await fetch(SB_FN_BASE+"admin-orders",{method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},body:JSON.stringify({password:_adminPw,action:"update",orderId:oid,updates})});
    const d=await r.json(); if(d.error)throw new Error(d.error);
    const x=d.order, o=orders.find(q=>q.orderId===oid);
    if(o&&x)Object.assign(o,{name:x.customer_name,phone:x.phone,addr:x.address,pin:x.pincode,items:x.items||[],total:x.total,paymentMode:x.payment_mode||"prepaid",amountPaidOnline:x.amount_paid_online,codDue:x.cod_due,channel:x.channel});
    _woCache={};   // customer summaries may have changed
    try{localStorage.setItem("ds_orders",JSON.stringify(orders));}catch(e){}
    rnAdmOrders(); showToast("✓ Order "+oid+" updated",true);
  }catch(e){fail(e.message||"Could not save. Try again.");}
}
async function lookupCustomer(){
  const phone=(document.getElementById("ch-phone")||{}).value||"";
  const name=(document.getElementById("ch-name")||{}).value||"";
  const resultEl=document.getElementById("ch-result");
  if(!phone.trim()&&!name.trim()){resultEl.innerHTML='<p style="color:#C0392B;font-size:13px">Enter a phone number or a name.</p>';return;}
  if(!_adminPw){resultEl.innerHTML='<p style="color:#C0392B;font-size:13px">Admin session expired — refresh and log in again.</p>';return;}
  resultEl.innerHTML='<p style="color:var(--off);font-size:13px">Searching…</p>';
  try{
    const res=await fetch(SB_FN_BASE+"admin-orders",{
      method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,action:"customerHistory",phone:phone.trim(),name:name.trim()})
    });
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    if(!data.orders.length){resultEl.innerHTML='<p style="color:var(--off);font-size:13px">No orders found for that phone/name.</p>';return;}
    const s=data.summary;
    const chanStr=Object.entries(s.channels).map(([c,n])=>`${c}: ${n}`).join(" · ");
    const rowsHtml=data.orders.map(o=>{
      const when=new Date(o.placed_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
      const items=(o.items||[]).map(i=>`${i.name}${i.size?" ("+i.size+")":""} x${i.qty}`).join(", ");
      return `<div style="padding:8px 0;border-top:1px solid var(--line);font-size:12.5px">
        <div style="display:flex;justify-content:space-between"><b>${o.order_id}</b><span style="color:var(--off)">${when}</span></div>
        <div style="color:var(--off);margin-top:2px">${items||"—"}</div>
        <div style="margin-top:2px"><b>${inr(o.total)}</b> · ${o.status}${o.tracking_id?` · 📦 ${o.tracking_id}`:""}</div>
      </div>`;
    }).join("");
    resultEl.innerHTML=`<div style="padding:12px;background:var(--bg2,rgba(0,0,0,.03));border-radius:8px">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px">
        <div><b style="font-size:20px">${s.totalOrders}</b><br><span style="color:var(--off);font-size:11px">Total orders</span></div>
        <div><b style="font-size:20px">${inr(s.lifetimeSpend)}</b><br><span style="color:var(--off);font-size:11px">Lifetime spend</span></div>
        <div><b style="font-size:20px">${s.paidOrders}</b><br><span style="color:var(--off);font-size:11px">Paid</span></div>
      </div>
      <div style="color:var(--off);font-size:11.5px;margin-bottom:8px">Channels — ${chanStr}</div>
      ${rowsHtml}
    </div>`;
  }catch(e){
    resultEl.innerHTML=`<p style="color:#C0392B;font-size:13px">${e.message}</p>`;
  }
}
function deleteOrder(orderId){
  if(!confirm("Delete order "+orderId+" permanently? This cannot be undone."))return;
  if(!_adminPw){showToast("Admin session expired — refresh and log in again.",false);return;}
  fetch(SB_FN_BASE+"admin-orders",{
    method:"POST",headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
    body:JSON.stringify({password:_adminPw,action:"delete",orderId})
  }).then(r=>r.json()).then(d=>{
    if(d.error){showToast("⚠️ Could not delete: "+d.error,false);return;}
    orders=orders.filter(o=>o.orderId!==orderId);
    try{localStorage.setItem("ds_orders",JSON.stringify(orders));}catch(e){}
    rnAdmOrders();
    showToast("Order "+orderId+" deleted",true);
  }).catch(()=>showToast("⚠️ Network error — order may not have been deleted.",false));
}
function setOrderStatus(orderId,status){
  const o=orders.find(x=>x.orderId===orderId);if(!o)return;
  o.status=status;
  try{localStorage.setItem("ds_orders",JSON.stringify(orders));}catch(e){}
  rnAdmOrders();
  showToast("Order "+orderId+" marked "+status,true);
  if(_adminPw){
    fetch(SB_FN_BASE+"admin-orders",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,action:"setStatus",orderId,status})
    }).then(r=>r.json()).then(d=>{
      if(d.error){showToast("⚠️ Status saved locally but live sync failed: "+d.error,false);return;}
      if(d.email)showToast("Order "+orderId+" marked delivered"+_emailNote(d.email,"Delivered"),!(d.email.sent===false&&d.email.reason!=="no email on this order"));
    }).catch(()=>showToast("⚠️ Status saved locally but live sync failed (network).",false));
  }
}
// ── Admin reviews manager: sequence (drag / ↑↓ / top) + photo slot ─────
// The list order here IS the order customers see (after "Save order").
let _seqDirty={rev:false,ugc:false}, _dragId=null, _dragList=null;
function _admList(kind){return sortBySeq(reviews.filter(r=>kind==="ugc"?isUgc(r):!isUgc(r)));}
function _applyOrder(kind,ids){
  // rebuild the reviews array: this kind in the new order, the other kind untouched
  const other=reviews.filter(r=>kind==="ugc"?!isUgc(r):isUgc(r));
  const byId=Object.fromEntries(reviews.map(r=>[r.id,r]));
  const mine=ids.map((id,i)=>{const r=byId[id];r.sortOrder=i+1;return r;});
  reviews=kind==="ugc"?other.concat(mine):mine.concat(other);
  _seqDirty[kind]=true; lsSafeSet("ds_r",reviews); renderRevs(); rnAdmRev();
}
function revSeqMove(kind,id,to){ // to: "up" | "down" | "top" | index
  const ids=_admList(kind).map(r=>r.id); const i=ids.indexOf(id); if(i<0)return;
  let j=to==="up"?i-1:to==="down"?i+1:to==="top"?0:to;
  j=Math.max(0,Math.min(ids.length-1,j)); if(j===i)return;
  ids.splice(i,1); ids.splice(j,0,id); _applyOrder(kind,ids);
}
async function saveSeq(){
  const btn=document.getElementById("seq-save"); if(btn){btn.disabled=true;btn.textContent="Saving…";}
  let ok=true;
  for(const kind of ["rev","ugc"]){
    if(!_seqDirty[kind])continue;
    const res=await _callAdminFn("admin-reviews",{action:"reorder",ids:_admList(kind).map(r=>r.id)});
    if(res&&res.success)_seqDirty[kind]=false; else ok=false;
  }
  rnAdmRev(); if(ok)showToast("✓ Order saved — the site shows reviews in this sequence now.",true);
}
function _seqBar(){
  const dirty=_seqDirty.rev||_seqDirty.ugc;
  return dirty?`<div class="seq-bar"><span>Order changed — customers still see the old order until you save.</span><button id="seq-save" class="btn btn-w" onclick="saveSeq()">Save order</button></div>`:"";
}
function _dragAttrs(kind,id){return `draggable="true" ondragstart="_dragId='${id}';_dragList='${kind}';this.classList.add('dragging')" ondragend="this.classList.remove('dragging')" ondragover="event.preventDefault();this.classList.add('drop-on')" ondragleave="this.classList.remove('drop-on')" ondrop="event.preventDefault();this.classList.remove('drop-on');_dropOn('${kind}','${id}',event)"`;}
function _dropOn(kind,id,ev){
  const f=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];
  if(f&&kind==="rev"&&!_dragId){revAttachPhoto({files:[f]},id);return;}   // image dropped on a review = attach it
  if(!_dragId||_dragList!==kind)return;
  const ids=_admList(kind).map(r=>r.id); const to=ids.indexOf(id); const from=ids.indexOf(_dragId);
  _dragId=null; if(to<0||from<0||to===from)return;
  ids.splice(from,1); ids.splice(to,0,_admList(kind)[from].id); _applyOrder(kind,ids);
}
function rnAdmRev(){
  rnAdmUgc();
  const list=_admList("rev"), el=document.getElementById("rev-adm");
  if(!list.length){el.innerHTML='<p style="color:var(--off);font-size:13px">No reviews yet.</p>';return;}
  el.innerHTML=`<div class="seq-head"><b>SEQUENCE ON SITE</b><span>Drag ⠿ or use ↑ ↓ ⤒. #1 shows first. New reviews start at the top.</span></div>`+_seqBar()+
  list.map((r,i)=>{
    const star="★".repeat(r.stars||5);
    const slot=r.img
      ?`<div class="rv-slot has"><img src="${r.img}" alt="Review photo" onclick="openImgReview('${r.id}')"/><div class="rv-slot-act"><label>Replace<input type="file" accept="image/*,.heic,.heif" hidden onchange="revAttachPhoto(this,'${r.id}')"/></label>${r.text?`<button onclick="revRemovePhoto('${r.id}')">Remove</button>`:""}</div></div>`
      :`<label class="rv-slot empty" title="Click or drop a photo here"><span>＋</span><small>Add photo</small><input type="file" accept="image/*,.heic,.heif" hidden onchange="revAttachPhoto(this,'${r.id}')"/></label>`;
    const body=r.text
      ?`<div class="rv-who"><b>${_revEsc(r.who||"")}</b><span>${_revEsc(r.where||"")} · ${star}</span></div><div class="rv-text">"${_revEsc(r.text)}"</div>`
      :`<div class="rv-who"><b>Photo review</b><span>screenshot / image only</span></div>`;
    return `<div class="rv-row" ${_dragAttrs("rev",r.id)}>
      <div class="rv-grip" title="Drag to reorder">⠿</div><div class="rv-pos">#${i+1}</div>${slot}
      <div class="rv-body">${body}</div>
      <div class="rv-ctl"><button onclick="revSeqMove('rev','${r.id}','top')" title="Move to top" ${i===0?"disabled":""}>⤒</button><button onclick="revSeqMove('rev','${r.id}','up')" ${i===0?"disabled":""}>↑</button><button onclick="revSeqMove('rev','${r.id}','down')" ${i===list.length-1?"disabled":""}>↓</button><button class="tb-del" onclick="if(confirm('Delete this review?'))delRev('${r.id}')">Del</button></div>
    </div>`;}).join("");
}
// SETTINGS
async function chgPwd(){const p1=document.getElementById("st0").value;const p2=document.getElementById("st1").value;if(!p1||p1!==p2){alert("Passwords don't match.");return;}if(p1.length<8){alert("Min 8 chars.");return;}const h=await sha256(p1);
  // Update Supabase FIRST - if that fails, don't change local either, so they never diverge
  try{
    const res=await fetch(SB_FN_BASE+"admin-settings",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":SB_APIKEY},
      body:JSON.stringify({password:_adminPw,table:"__change_password__",content:h})
    });
    const data=await res.json();
    if(data.error){alert("Password NOT changed — live-sync update failed: "+data.error);return;}
  }catch(e){alert("Password NOT changed — couldn't reach the server. Try again when online.");return;}
  AH=h;_adminPw=p1;LS.set("adm_pd",h);
  alert("Password updated everywhere ✓");
  document.getElementById("st0").value="";document.getElementById("st1").value="";}
function togglePartialModeFields(){
  const mode=document.getElementById("pay-partial-mode").value;
  document.getElementById("pay-partial-flat-wrap").style.display=mode==="flat"?"":"none";
  document.getElementById("pay-partial-pct-wrap").style.display=mode==="percent"?"":"none";
  document.getElementById("pay-partial-min-wrap").style.display=mode==="percent"?"":"none";
}
function loadPaySettings(){
  const cfg=getPayCfg();
  document.getElementById("pay-prepaid").value=cfg.prepaid?"1":"0";
  document.getElementById("pay-cod").value=cfg.cod?"1":"0";
  document.getElementById("pay-cod-charge").value=cfg.codCharge||0;
  document.getElementById("pay-partial").value=cfg.partialCod?"1":"0";
  document.getElementById("pay-partial-mode").value=cfg.partialCodMode||"flat";
  document.getElementById("pay-partial-adv").value=cfg.partialCodAdvance||199;
  document.getElementById("pay-partial-pct").value=cfg.partialCodPercent||20;
  document.getElementById("pay-partial-min").value=cfg.partialCodMin||99;

  // Vault override lives inside paymentConfig so it saves and syncs with
  // everything else, and the Vault page reads the same object.
  const v=cfg.vault||{};
  document.getElementById("pay-vault-on").value=v.enabled?"1":"0";
  document.getElementById("pay-vault-partial").value=(v.partialCod===false)?"0":"1";
  document.getElementById("pay-vault-cod-charge").value=(v.codCharge!=null?v.codCharge:(cfg.codCharge||0));
  document.getElementById("pay-vault-mode").value=v.partialCodMode||"flat";
  document.getElementById("pay-vault-adv").value=v.partialCodAdvance||999;
  document.getElementById("pay-vault-pct").value=v.partialCodPercent||50;
  document.getElementById("pay-vault-min").value=v.partialCodMin||499;

  togglePartialModeFields();
  toggleVaultPayFields();
}
function toggleVaultPayFields(){
  const on=document.getElementById("pay-vault-on").value==="1";
  document.querySelectorAll(".vault-pay-field").forEach(el=>el.style.display=on?"":"none");
  if(!on)return;
  const mode=document.getElementById("pay-vault-mode").value;
  document.getElementById("pay-vault-flat-wrap").style.display=mode==="flat"?"":"none";
  document.getElementById("pay-vault-pct-wrap").style.display=mode==="percent"?"":"none";
  document.getElementById("pay-vault-min-wrap").style.display=mode==="percent"?"":"none";
  updateVaultPayPreview();
}
// Shows what a real Vault order would actually charge, so the numbers
// aren't abstract while you're setting them.
function updateVaultPayPreview(){
  const box=document.getElementById("pay-vault-preview");
  if(!box)return;
  if(document.getElementById("pay-vault-partial").value==="0"){
    box.innerHTML="Vault is <b>prepaid only</b> \u2014 the full amount is collected online, nothing rides on delivery.";
    return;
  }
  const mode=document.getElementById("pay-vault-mode").value;
  const flat=parseInt(document.getElementById("pay-vault-adv").value,10)||0;
  const pct=Math.max(1,Math.min(100,parseInt(document.getElementById("pay-vault-pct").value,10)||50));
  const min=parseInt(document.getElementById("pay-vault-min").value,10)||0;
  const cc=parseInt(document.getElementById("pay-vault-cod-charge").value,10)||0;
  const advOf=t=>mode==="percent"
    ? Math.max(Math.min(min,t),Math.min(Math.round(t*pct/100),t))
    : Math.min(flat,t);
  box.innerHTML=[1899,5999].map(t=>{
    const a=advOf(t), due=Math.max(0,t-a)+cc;
    return "On a \u20B9"+t.toLocaleString("en-IN")+" piece: customer pays <b>\u20B9"+a.toLocaleString("en-IN")+"</b> online, <b>\u20B9"+due.toLocaleString("en-IN")+"</b> on delivery.";
  }).join("<br>");
}
function savePaySettings(){
  siteContent.paymentConfig={
    prepaid:document.getElementById("pay-prepaid").value==="1",
    cod:document.getElementById("pay-cod").value==="1",
    codCharge:parseInt(document.getElementById("pay-cod-charge").value,10)||0,
    partialCod:document.getElementById("pay-partial").value==="1",
    partialCodMode:document.getElementById("pay-partial-mode").value,
    partialCodAdvance:parseInt(document.getElementById("pay-partial-adv").value,10)||0,
    partialCodPercent:Math.max(1,Math.min(100,parseInt(document.getElementById("pay-partial-pct").value,10)||20)),
    partialCodMin:parseInt(document.getElementById("pay-partial-min").value,10)||0,
    vault:{
      enabled:document.getElementById("pay-vault-on").value==="1",
      partialCod:document.getElementById("pay-vault-partial").value==="1",
      codCharge:parseInt(document.getElementById("pay-vault-cod-charge").value,10)||0,
      partialCodMode:document.getElementById("pay-vault-mode").value,
      partialCodAdvance:parseInt(document.getElementById("pay-vault-adv").value,10)||0,
      partialCodPercent:Math.max(1,Math.min(100,parseInt(document.getElementById("pay-vault-pct").value,10)||50)),
      partialCodMin:parseInt(document.getElementById("pay-vault-min").value,10)||0
    }
  };
  lsSafeSet("ds_site",siteContent);
  syncSiteToSupabase();
  showToast("Payment settings saved \u2713",true);
}
function expData(){const blob=new Blob([JSON.stringify({products,reviews,siteContent,banner,fits,palette,globalSizeChart:globalSc,stories,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="365ds-backup-"+Date.now()+".json";a.click();}
function rstProds(){products=[...DP];LS.set("ds_p",products);renderGrid();ldProds();apSts();}
async function downloadZip(){
  if(typeof JSZip==="undefined"){
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    }).catch(()=>{alert("Couldn't load ZIP export tool — check your connection.");return;});
    if(typeof JSZip==="undefined")return;
  }
  let src='';
  try{const r=await fetch(location.href);src=await r.text();}
  catch(e){alert("ZIP export not available in preview mode. Use the file from Claude directly.");return;}
  const _state={p:products,r:reviews,s:siteContent,b:banner,f:fits,pal:palette,gsc:globalSc,st:stories};const inject='<scr'+'ipt>try{const _s='+JSON.stringify(_state)+';localStorage.setItem("ds_p",JSON.stringify(_s.p));localStorage.setItem("ds_r",JSON.stringify(_s.r));localStorage.setItem("ds_site",JSON.stringify(_s.s));localStorage.setItem("ds_ban",JSON.stringify(_s.b));localStorage.setItem("ds_fits",JSON.stringify(_s.f));if(_s.pal)localStorage.setItem("ds_pal",JSON.stringify(_s.pal));if(_s.gsc)localStorage.setItem("ds_gsc",JSON.stringify(_s.gsc));if(_s.st)localStorage.setItem("ds_stories",JSON.stringify(_s.st));}catch(e){}<\/scr'+'ipt>';
  const out=src.replace('</body>',inject+'</body>');
  const zip=new JSZip();zip.file("index.html",out);
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="365dropstore-deploy.zip";a.click();
  alert("✓ ZIP ready — drag '365dropstore-deploy.zip' to app.netlify.com/drop to go live.");
}
function loadPaletteAdmin(){
  ['glow','herotop','btn','cardglow'].forEach(k=>{
    const inp=document.getElementById('pal-'+k);
    const hex=document.getElementById('pal-'+k+'-hex');
    if(inp){inp.value=palette[k]||DPAL[k];inp.oninput=()=>{if(hex)hex.textContent=inp.value;};}
    if(hex)hex.textContent=palette[k]||DPAL[k];
  });
}
function previewPalette(){
  const g=document.getElementById('pal-glow').value;
  const ht=document.getElementById('pal-herotop').value;
  const bt=document.getElementById('pal-btn').value;
  const pv=document.getElementById('pal-preview');pv.style.display='block';
  const bg=document.getElementById('pal-prev-bg');bg.style.background=`linear-gradient(180deg,${ht},${hexDarken(ht,8)})`;
  const h1=document.getElementById('pal-prev-h1');h1.style.background=`linear-gradient(135deg,${g},${g}CC,#1a1a1a)`;h1.style.webkitBackgroundClip='text';h1.style.webkitTextFillColor='transparent';h1.style.backgroundClip='text';h1.textContent='365 DROP STORE';
  const btn=document.getElementById('pal-prev-btn');btn.style.background=bt;btn.style.color=isLight(bt)?'#141312':'#F8F7F4';
}
function savePalette(){
  palette={glow:document.getElementById('pal-glow').value,herotop:document.getElementById('pal-herotop').value,btn:document.getElementById('pal-btn').value,cardglow:document.getElementById('pal-cardglow').value};
  LS.set('ds_pal',palette);applyPalette();
  const m=document.getElementById('pal-msg');m.textContent='Palette saved ✓ — refresh to see full effect.';m.style.color='#4ade80';m.style.background='rgba(74,222,128,.08)';m.style.display='block';setTimeout(()=>m.style.display='none',3000);
  syncSettingsToSupabase("palette",palette);
}
function resetPalette(){palette={...DPAL};LS.set('ds_pal',palette);applyPalette();loadPaletteAdmin();alert('Reset to defaults ✓');syncSettingsToSupabase("palette",palette);}
async function globalScUpload(inp){if(!inp.files||!inp.files[0])return;try{const bf=await toBrowserFile(inp.files[0]);let d=await compressImg(bf,1800,undefined,'png');document.getElementById('gsc-prv').innerHTML='<img src="'+d+'" alt="Uploading..." style="width:160px;border-radius:8px;border:1px solid rgba(255,255,255,.1)"/>';d=await uploadToR2(d,"sizecharts");document.getElementById('gsc-data').value=d;document.getElementById('gsc-prv').innerHTML='<img src="'+d+'" alt="Uploaded size chart" style="width:160px;border-radius:8px;border:1px solid rgba(255,255,255,.1)"/>';}catch(e){alert("Couldn't read that image — try a JPEG/PNG.");}}
function saveGlobalSc(){const v=document.getElementById('gsc-data').value;if(v)globalSc=v;LS.set('ds_gsc',globalSc);const m=document.getElementById('gsc-msg');m.textContent='Size chart saved ✓';m.style.color='#4ade80';m.style.background='rgba(74,222,128,.08)';m.style.display='block';setTimeout(()=>m.style.display='none',2500);syncSettingsToSupabase("global_size_chart",globalSc).then(res=>{if(res&&res.content&&res.content!==globalSc){globalSc=res.content;LS.set('ds_gsc',globalSc);loadGlobalScAdmin();}});}
function loadGlobalScAdmin(){if(globalSc){document.getElementById('gsc-data').value=globalSc;document.getElementById('gsc-prv').innerHTML='<img src="'+globalSc+'" alt="Global size chart" style="width:160px;border-radius:8px;border:1px solid rgba(255,255,255,.1)"/>';}}
// ===== IMAGE COMPRESSION =====
function compressImg(file,maxDim,q,format){maxDim=maxDim||1600;q=q||0.82;format=format||'jpeg';return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=e=>{const img=new Image();img.onload=()=>{let{width:w,height:h}=img;if(w>maxDim||h>maxDim){if(w>h){h=Math.round(h*maxDim/w);w=maxDim;}else{w=Math.round(w*maxDim/h);h=maxDim;}}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);try{res(c.toDataURL('image/'+format,format==='png'?undefined:q));}catch(err){res(e.target.result);}};img.onerror=()=>res(e.target.result);img.src=e.target.result;};rd.onerror=rej;rd.readAsDataURL(file);});}
// ===== HEIC/HEIF support: most browsers (Chrome, Firefox, Android) cannot decode HEIC files from an iPhone.
// We lazy-load a small conversion library only when a HEIC/HEIF file is actually picked, convert it to a
// normal JPEG blob, then hand it to compressImg() like any other photo. PNG/JPEG/WEBP files skip this entirely.
let _heicLibPromise=null;
function loadHeicLib(){
  if(window.heic2any)return Promise.resolve();
  if(_heicLibPromise)return _heicLibPromise;
  _heicLibPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload=()=>res();s.onerror=()=>rej(new Error('heic2any failed to load'));
    document.head.appendChild(s);
  });
  return _heicLibPromise;
}
function isHeicFile(f){if(!f)return false;const n=(f.name||'').toLowerCase();const t=(f.type||'').toLowerCase();return t==='image/heic'||t==='image/heif'||n.endsWith('.heic')||n.endsWith('.heif');}
// Returns a browser-renderable image File. If it's already PNG/JPEG/WEBP/etc, returns it untouched.
// If it's HEIC/HEIF (iPhone default photo format), converts it to JPEG first.
async function toBrowserFile(f){
  if(!isHeicFile(f))return f;
  await loadHeicLib();
  const out=await window.heic2any({blob:f,toType:'image/jpeg',quality:0.85});
  const blob=Array.isArray(out)?out[0]:out;
  return new File([blob],(f.name||'image').replace(/\.(heic|heif)$/i,'.jpg'),{type:'image/jpeg'});
}
function lsSafeSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){alert("⚠ Storage limit reached. This browser caps saved data (~5MB). Remove some images or download your ZIP, then continue. Newest change was NOT saved.");return false;}}
// ===== EDITORIAL / STORY GALLERIES =====
function addGalleryLink(k){
  const inp=document.getElementById(k==='ed'?'ed-gallery-link':'st-gallery-link');
  const url=inp.value.trim();
  if(!url){showToast("Paste an image link first.",false);return;}
  const key=k==='ed'?'edImgs':'stImgs';
  if(!Array.isArray(siteContent[key]))siteContent[key]=[];
  siteContent[key].push(url);
  lsSafeSet('ds_site',siteContent);
  renderGmgr(k);applySiteContent();
  inp.value='';
  showToast("Photo added ✓ — syncing live...",true);
  syncSiteToSupabase();
}
async function galleryUp(k,inp){if(!inp.files||!inp.files.length)return;const key=k==='ed'?'edImgs':'stImgs';if(!Array.isArray(siteContent[key]))siteContent[key]=[];for(const f of inp.files){try{const bf=await toBrowserFile(f);const compressed=await compressImg(bf,800,0.75);const d=await uploadToR2(compressed,"site");siteContent[key].push(d);}catch(e){showToast("Skipped \""+(f.name||"an image")+"\" — couldn't read it.",false);}}lsSafeSet('ds_site',siteContent);renderGmgr(k);applySiteContent();inp.value='';syncSiteToSupabase();}
function renderGmgr(k){const key=k==='ed'?'edImgs':'stImgs';const el=document.getElementById(k+'-gmgr');if(!el)return;const arr=siteContent[key]||[];el.innerHTML=arr.map((s,i)=>`<div class="gmgr-item"><img src="${s}" alt="Preview"/><button class="gmgr-rm" onclick="rmGalleryImg('${k}',${i})">×</button></div>`).join('')||'<span style="color:var(--off);font-size:12px">No photos yet — uploads appear here. If empty, the default image is used.</span>';}
function rmGalleryImg(k,i){const key=k==='ed'?'edImgs':'stImgs';siteContent[key].splice(i,1);lsSafeSet('ds_site',siteContent);renderGmgr(k);applySiteContent();syncSiteToSupabase();}
async function styUp(inp){if(!inp.files||!inp.files[0])return;try{const bf=await toBrowserFile(inp.files[0]);let d=await compressImg(bf,700,0.75);document.getElementById('sty-prv').innerHTML=`<img src="${d}" style="width:90px;border-radius:8px" alt="Uploading..."/>`;d=await uploadToR2(d,"stories");document.getElementById('sty-imgdata').value=d;document.getElementById('sty-prv').innerHTML=`<img src="${d}" style="width:90px;border-radius:8px" alt="Uploaded preview"/>`;}catch(e){alert("Couldn't read that image — try a JPEG/PNG.");}}
function saveStory(){const img=document.getElementById('sty-imgdata').value;if(!img){alert('Upload a story image first.');return;}const label=document.getElementById('sty-label').value.trim()||'Update';const cap=document.getElementById('sty-cap').value.trim();const prodSel=document.getElementById('sty-product');const productId=prodSel?prodSel.value:'';const date=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'});const newStory={id:'S'+uid(),img,label,caption:cap,productId,date};stories.unshift(newStory);if(!lsSafeSet('ds_stories',stories)){stories.shift();return;}document.getElementById('sty-imgdata').value='';document.getElementById('sty-prv').innerHTML='';document.getElementById('sty-label').value='';document.getElementById('sty-cap').value='';if(prodSel)prodSel.value='';renderStoryAdmin();renderStoriesRail();const m=document.getElementById('sty-msg');m.textContent='Story added ✓';m.style.color='#4ade80';m.style.background='rgba(74,222,128,.08)';m.style.display='block';setTimeout(()=>m.style.display='none',2000);showToast(productId?'Story added ✓ — linked to a product Buy Now button.':'Story added ✓',true);syncStoryToSupabase("save",newStory).then(res=>{if(res&&res.imgUrl){newStory.img=res.imgUrl;lsSafeSet('ds_stories',stories);renderStoryAdmin();renderStoriesRail();}});}
function delStory(id){stories=stories.filter(s=>s.id!==id);lsSafeSet('ds_stories',stories);renderStoryAdmin();renderStoriesRail();syncStoryToSupabase("delete",{id});}
function populateStoryProductSelect(){const sel=document.getElementById('sty-product');if(!sel)return;const cur=sel.value;sel.innerHTML='<option value="">— None —</option>'+products.map(p=>`<option value="${p.id}">${(p.name||'').replace(/</g,'&lt;')}</option>`).join('');sel.value=cur;}
function renderStoryAdmin(){populateStoryProductSelect();const el=document.getElementById('sty-adm');if(!el)return;el.innerHTML=stories.length?stories.map(s=>`<div style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);align-items:center"><img src="${s.img}" style="width:46px;height:62px;object-fit:cover;border-radius:6px" alt="Story photo"/><div style="flex:1"><div style="color:var(--w2);font-weight:600;font-size:14px">${(s.label||'').replace(/</g,'&lt;')}</div><div style="color:var(--off);font-size:12px">${(s.caption||'').replace(/</g,'&lt;')} · ${s.date||''}${s.productId?' · 🛒 linked':''}</div></div><button class="btn btn-g" style="padding:6px 12px" onclick="delStory('${s.id}')">Delete</button></div>`).join(''):'<p style="color:var(--off);font-size:13px">No stories yet.</p>';}
// ===== IMAGE REVIEWS =====
// Attach a photo to an EXISTING text review (combined card), or remove one
// already attached. Reuses the same admin-reviews "save" upsert the
// text-only and image-only flows already use — no backend change needed,
// since reviews.img and reviews.text_content are independent columns.
async function revAttachPhoto(inp,id){
  if(!inp.files||!inp.files[0])return;
  const rev=reviews.find(r=>r.id===id);if(!rev)return;
  try{
    const bf=await toBrowserFile(inp.files[0]);
    const compressed=await compressImg(bf,700,0.75);
    const d=await uploadToR2(compressed,"reviews");
    rev.img=d;
    if(!lsSafeSet('ds_r',reviews))return;
    renderRevs();rnAdmRev();
    showToast('✓ Photo attached',true);
    syncReviewToSupabase("save",rev).then(res=>{if(res&&res.imgUrl){rev.img=res.imgUrl;lsSafeSet('ds_r',reviews);renderRevs();rnAdmRev();}});
  }catch(e){showToast("Couldn't read that image — try JPEG/PNG.",false);}
}
function revRemovePhoto(id){const rev=reviews.find(r=>r.id===id);if(!rev)return;rev.img=null;lsSafeSet('ds_r',reviews);renderRevs();rnAdmRev();syncReviewToSupabase("save",rev);}
function rnAdmUgc(){const el=document.getElementById("ugc-adm");if(!el)return;const u=_admList("ugc");
el.innerHTML=u.length?u.map((r,i)=>`<div class="ug-tile" ${_dragAttrs("ugc",r.id)}><div class="rv-pos ug">#${i+1}</div><img src="${r.img}" alt="Customer photo" draggable="false"/><div class="ug-name">${_revEsc(r.who||"—")}</div><div class="ug-ctl"><button onclick="revSeqMove('ugc','${r.id}','up')" ${i===0?"disabled":""} title="Earlier">←</button><button onclick="revSeqMove('ugc','${r.id}','down')" ${i===u.length-1?"disabled":""} title="Later">→</button><button class="tb-del" onclick="if(confirm('Remove this photo?'))delRev('${r.id}')">✕</button></div></div>`).join(""):'<p style="color:var(--off);font-size:13px;grid-column:1/-1">No customer photos yet.</p>';}
async function ugcUp(inp){if(!inp.files||!inp.files.length)return;const nameEl=document.getElementById("ugc-name");const who=(nameEl&&nameEl.value.trim())||"";let added=0;const newRows=[];for(const f of inp.files){try{const bf=await toBrowserFile(f);const c=await compressImg(bf,900,0.8);const d=await uploadToR2(c,"reviews");const row={id:"U"+uid(),type:"ugc",img:d,who:who||null,where:"Customer photo"};reviews.unshift(row);newRows.push(row);added++;}catch(e){}}if(!added){showToast("Couldn't read those images — try JPEG/PNG.",false);return;}if(!lsSafeSet("ds_r",reviews))return;renderRevs();rnAdmRev();inp.value="";if(nameEl)nameEl.value="";showToast("✓ "+added+" customer photo(s) added to the wall.",true);for(const r of newRows){syncReviewToSupabase("save",r).then(res=>{if(res&&res.imgUrl){r.img=res.imgUrl;lsSafeSet("ds_r",reviews);renderRevs();rnAdmRev();}});}}
async function revImgUp(inp){if(!inp.files||!inp.files.length)return;let added=0;const newRevs=[];for(const f of inp.files){try{const bf=await toBrowserFile(f);const compressed=await compressImg(bf,700,0.75);const d=await uploadToR2(compressed,"reviews");const newRev={id:'R'+uid(),type:'img',img:d};reviews.unshift(newRev);newRevs.push(newRev);added++;}catch(e){}}if(!added){showToast("Couldn't read those images — try JPEG/PNG.",false);return;}if(!lsSafeSet('ds_r',reviews))return;renderRevs();rnAdmRev();inp.value='';showToast('✓ '+added+' image review(s) added.',true);for(const r of newRevs){syncReviewToSupabase("save",r).then(res=>{if(res&&res.imgUrl){r.img=res.imgUrl;lsSafeSet('ds_r',reviews);renderRevs();rnAdmRev();}});}}
function pubMsg(t,ok){const m=document.getElementById("pub-msg");if(!m)return;m.style.display="block";m.style.background=ok?"rgba(40,160,80,.15)":"rgba(192,57,43,.15)";m.style.color=ok?"#2a8a4a":"#c0392b";m.textContent=t;}
function getToken(force){let t=localStorage.getItem("ds_pub_token");if(!t||force){t=prompt("Enter your publish token (from Netlify env var PUBLISH_TOKEN):");if(t)localStorage.setItem("ds_pub_token",t.trim());}return t?t.trim():"";}
// Build the publish payload from current in-memory state (same keys as ZIP export)
function buildState(){return{p:products,r:reviews,s:siteContent,b:banner,f:fits,pal:palette,gsc:globalSc,st:stories};}
// PREVIEW: open the storefront in a new tab in draft mode (reads localStorage, not backend)
function previewDraft(){
  // ensure current edits are in localStorage first
  LS.set("ds_p",products);LS.set("ds_r",reviews);LS.set("ds_site",siteContent);
  LS.set("ds_ban",banner);LS.set("ds_fits",fits);LS.set("ds_pal",palette);
  LS.set("ds_gsc",globalSc);LS.set("ds_stories",stories);
  sessionStorage.setItem("ds_preview","1");
  const w=window.open(location.pathname,"_blank");
  pubMsg("Preview opened in a new tab. Only you can see it. Close it when done.",true);
}
// PUBLISH: send current state to backend -> live for everyone
async function publishLive(){
  if(!API.live){pubMsg("Publish only works on the deployed site, not a local file.",false);return;}
  const btn=document.getElementById("pub-btn");if(btn){btn.disabled=true;btn.textContent="Publishing…";}
  let token=getToken(false);
  if(!token){pubMsg("Publish cancelled — no token entered.",false);if(btn){btn.disabled=false;btn.textContent="🚀 Publish to Live";}return;}
  const payload=JSON.stringify(buildState());
  const sizeMB=(payload.length/1024/1024).toFixed(2);
  if(payload.length>5.5*1024*1024){
    pubMsg("⚠ Your data is "+sizeMB+"MB — most hosting functions reject requests over ~6MB. This is almost always too many/too-large product or story photos saved as base64. Remove a few images (or re-upload smaller ones) and try again.",false);
    if(btn){btn.disabled=false;btn.textContent="🚀 Publish to Live";}
    return;
  }
  try{
    const r=await fetch(API.publish,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:payload});
    if(r.status===401){localStorage.removeItem("ds_pub_token");pubMsg("Wrong token. Click Publish again to re-enter.",false);}
    else if(r.ok){const j=await r.json();pubMsg("✅ Published! Live for everyone now. ("+new Date(j.publishedAt).toLocaleTimeString()+")",true);showToast("✅ Published — live for everyone now.",true);sessionStorage.removeItem("ds_preview");}
    else{const j=await r.json().catch(()=>({}));
      let hint=j.error||r.status;
      if(r.status===400)hint+=" — usually means the payload ("+sizeMB+"MB) is too large or malformed for the publish function. Try removing a couple of product images and publish again.";
      pubMsg("Publish failed: "+hint,false);showToast("Publish failed ("+r.status+"). See Settings for details.",false);
    }
  }catch(e){pubMsg("Network error while publishing. Try again.",false);}
  if(btn){btn.disabled=false;btn.textContent="🚀 Publish to Live";}
}
// Upload a single image file to Blobs, return its served URL (or null on failure)
async function uploadImageToBlob(file){
  if(!API.live)return null;
  const token=getToken(false);if(!token)return null;
  try{
    const r=await fetch(API.upload,{method:"POST",headers:{"content-type":file.type,"authorization":"Bearer "+token},body:file});
    if(!r.ok)return null;const j=await r.json();return j.url||null;
  }catch(e){return null;}
}
async function refreshSectionFromSupabase(section){
  if(!sbClient){showToast("⚠️ Can't reach Supabase right now.",false);return;}
  try{
    if(section==="reviews"){
      const {data,error}=await sbClient.from('reviews').select('*');
      if(error)throw new Error(error.message);
      reviews=sortBySeq((data||[]).map(r=>({id:r.id,type:r.type,stars:r.stars,text:r.text_content,who:r.who,where:r.where_loc,img:r.img,sortOrder:r.sort_order??null})));
      LS.set("ds_r",reviews);rnAdmRev();
    }else if(section==="site"){
      const {data,error}=await sbClient.from('site_content').select('content').eq('id',1).single();
      if(error)throw new Error(error.message);
      if(data&&data.content&&Object.keys(data.content).length){siteContent=Object.assign({},siteContent,data.content);LS.set("ds_site",siteContent);loadSiteEd();}
    }else if(section==="banner"){
      const {data,error}=await sbClient.from('banner').select('content').eq('id',1).single();
      if(error)throw new Error(error.message);
      if(data&&data.content&&Object.keys(data.content).length){banner=data.content;LS.set("ds_ban",banner);loadBannerAdmin();}
    }else if(section==="fits"){
      const [fitsRes,hsRes]=await Promise.all([
        sbClient.from('fits').select('content').eq('id',1).single(),
        sbClient.from('home_sections').select('content').eq('id',1).single()
      ]);
      if(fitsRes.error)throw new Error(fitsRes.error.message);
      if(fitsRes.data&&Array.isArray(fitsRes.data.content)&&fitsRes.data.content.length){fits=fitsRes.data.content;LS.set("ds_fits",fits);populateFitSelect();buildFilterUI();}
      if(!hsRes.error&&hsRes.data&&Array.isArray(hsRes.data.content)){homeSections=hsRes.data.content;LS.set("ds_home_sections",homeSections);}
      loadFitsAdmin();
    }else if(section==="stories"){
      const {data,error}=await sbClient.from('stories').select('*').order('display_order',{ascending:true});
      if(error)throw new Error(error.message);
      stories=(data||[]).map(s=>({id:s.id,img:s.img,label:s.label,caption:s.caption,productId:s.product_id,date:s.story_date,order:s.display_order}));
      LS.set("ds_stories",stories);renderStoryAdmin();renderStoriesRail();
    }else if(section==="settings"){
      const [palRes,gscRes]=await Promise.all([
        sbClient.from('palette').select('content').eq('id',1).single(),
        sbClient.from('global_size_chart').select('content').eq('id',1).single()
      ]);
      if(palRes.data&&palRes.data.content&&Object.keys(palRes.data.content).length){palette=palRes.data.content;LS.set("ds_pal",palette);applyPalette();}
      if(gscRes.data&&gscRes.data.content){globalSc=gscRes.data.content;LS.set("ds_gsc",globalSc);}
      loadPaletteAdmin();loadGlobalScAdmin();
    }else if(section==="instagrid"){
      const {data,error}=await sbClient.from('insta_grid').select('content').eq('id',1).single();
      if(error)throw new Error(error.message);
      if(data&&data.content){heroGrid=normalizeHeroGrid(data.content);LS.set("ds_hero_grid",heroGrid);}
      renderHeroGridAdmin();
      renderHeroGrid();
    }
    showToast("✓ Refreshed from live.",true);
  }catch(e){showToast("⚠️ Refresh failed: "+e.message,false);}
}
async function refreshProductsFromSupabase(){
  if(!sbClient){showToast("⚠️ Can't reach Supabase right now.",false);return;}
  try{
    const {data,error}=await sbClient.from('products').select('*');
    if(error||!data){showToast("⚠️ Refresh failed: "+(error?error.message:"no data"),false);return;}
    products=data.map(p=>({
      id:p.id,name:p.name,category:p.category,fit:p.fit,
      price:p.price,offerPrice:p.offer_price,
      images:p.images||[],sizeChartImg:p.size_chart_img||'',
      badges:p.badges||[],sizes:p.sizes||[],oosizes:p.oosizes||[],colors:p.colors||[],
      desc:p.description||'',desc2:p.description_long||'',
      shippingInfo:p.shipping_info||'',features:p.features||[],
      reelUrl:p.reel_url||'',videoUrl:p.video_url||'',order:p.display_order||0,
      addedAt:p.added_at?new Date(p.added_at).getTime():Date.now(),
      restockAt:p.restock_at||'',
      sizeRestockDates:p.size_restock_dates||{},
      stock:(p.stock&&typeof p.stock==="object")?p.stock:null,
      soldCount:p.sold_count||0,shade:p.shade||"",sizeGuideMode:p.size_guide_mode||'default',customSizeGuide:p.custom_size_guide||undefined,fitStudioEnabled:!!p.fit_studio_enabled
    }));
    LS.set("ds_p",products);
    ldProds();apSts();renderGrid();
    if(typeof renderFooterFits==="function")renderFooterFits();
    showToast("✓ Refreshed — "+products.length+" products from live.",true);
  }catch(e){showToast("⚠️ Refresh failed (network).",false);}
}
async function syncSoldFromOrders(){
  const msg=document.getElementById("sync-sold-msg");
  if(msg)msg.textContent="Loading orders from Supabase...";
  // load fresh orders
  const ok=await loadOrdersFromSupabase();
  if(!ok&&!orders.length){if(msg)msg.textContent="No orders found.";return;}
  // count items per product name (orders store name, not ID — match by name)
  const counts={};
  orders.forEach(o=>{
    if(o.status==="cancelled")return;// skip cancelled
    (o.items||[]).forEach(item=>{
      const name=(item.name||"").trim();
      if(!name)return;
      counts[name]=(counts[name]||0)+(item.qty||1);
    });
  });
  // match to products and update soldCount
  let updated=0;
  products.forEach(p=>{
    const c=counts[p.name]||0;
    if(c>0){p.soldCount=c;updated++;}
  });
  LS.set("ds_p",products);
  ldProds();renderGrid();
  if(msg)msg.textContent=`✓ Updated ${updated} products from ${orders.length} orders. Highest: ${Math.max(...Object.values(counts))} units. Save each product to sync to Supabase.`;
  showToast(`Sold counts synced from ${orders.length} orders`,true);
}
// Storefront boot code that also touched admin elements ran before this panel was
// on the page: the product form's Fit dropdown and the palette's .btn-w colours.
// Run them again now that it is here.
populateFitSelect();
applyPalette();
