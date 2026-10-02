const API_BASE="https://coly-paint-quotation-api.onrender.com/api";
const $=id=>document.getElementById(id);
let managerPin="";
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return esc(s).replace(/\x60/g,"&#096;")}
function quotationRemark(r){
  // Old API responses may still supply item remarks during deployment.
  if(typeof r.remark==="string") return r.remark;
  return [...new Set((r.items||[]).map(it=>String(it.remark||"").trim()).filter(Boolean))].join("\n");
}

function fmtDate(v){if(!v)return"";const d=new Date(v+"T00:00:00");return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`}
async function api(path,options={}){
  const res=await fetch(API_BASE+path,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  let data={};try{data=await res.json()}catch(e){}
  if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
async function unlockManager(){
  const pin=$("managerRecordsPin").value.trim();
  if(!pin){alert("Enter manager PIN.");return}
  managerPin=pin;
  try{
    await refreshManagerRecords();
    $("managerContent").style.display="block";
    await renderSalesmanList();
  }catch(e){managerPin="";$("managerContent").style.display="none";alert(e.message)}
}
function lockManager(){
  managerPin="";$("managerRecordsPin").value="";$("managerContent").style.display="none";
  $("managerQuoteDetail").style.display="none";
}
async function populateManagerSalesmen(){
  const list=await api("/salesmen");
  const sel=$("mgrSalesman");
  const current=sel.value;
  sel.innerHTML='<option value="">All salesmen</option>';
  list.forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.name;sel.appendChild(o)});
  if(current)sel.value=current;
  return list;
}
async function refreshManagerRecords(){
  if(!managerPin)throw new Error("Manager PIN required");
  await populateManagerSalesmen();
  const payload={
    managerPin,
    query:$("mgrSearch")?.value||"",
    status:$("mgrStatus")?.value||"",
    salesmanId:$("mgrSalesman")?.value||"",
    dateFrom:$("mgrDateFrom")?.value||"",
    dateTo:$("mgrDateTo")?.value||""
  };
  const data=await api("/manager/quotes/search",{method:"POST",body:JSON.stringify(payload)});
  const s=data.stats||{};
  $("mgrStatTotal").textContent=s.total??0;$("mgrStatPending").textContent=s.pending??0;
  $("mgrStatApproved").textContent=s.approved??0;$("mgrStatRejected").textContent=s.rejected??0;
  const body=$("managerRecordsBody");body.innerHTML="";
  if(!data.quotes.length){body.innerHTML='<tr><td colspan="7" class="small">No quotations match the selected filters.</td></tr>';return}
  data.quotes.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><b>${esc(r.quote_no)}</b></td>
      <td>${esc(fmtDate(String(r.quote_date).slice(0,10)))}</td>
      <td>${esc(r.customer)}</td>
      <td>${esc(r.salesman)}</td>
      <td><span class="mgr-status mgr-${esc(r.status)}">${esc(r.status.toUpperCase())}</span></td>
      <td>${(r.items||[]).length}</td>
      <td><div class="mgr-actions">
        <button class="btn secondary" type="button" data-action="view">View</button>
        ${r.status!=="approved"?'<button class="btn success" type="button" data-action="approve">Approve</button>':""}
        ${r.status!=="rejected"?'<button class="btn secondary" type="button" data-action="reject">Reject</button>':""}
        <button class="btn danger" type="button" data-action="delete">Delete</button>
      </div></td>`;
    tr.querySelector('[data-action="view"]').onclick=()=>showQuoteDetail(r);
    const a=tr.querySelector('[data-action="approve"]');if(a)a.onclick=()=>approveQuote(r.id);
    const j=tr.querySelector('[data-action="reject"]');if(j)j.onclick=()=>rejectQuote(r.id);
    const d=tr.querySelector('[data-action="delete"]');if(d)d.onclick=()=>deleteQuote(r.id,r.quote_no,r.customer);
    body.appendChild(tr);
  });
}
function showQuoteDetail(r){
  const box=$("managerQuoteDetail");
  box.style.display="block";
  box.innerHTML=`
    <div class="manager-records-head">
      <div><h2 style="margin:0">${esc(r.quote_no)} — ${esc(r.customer)}</h2>
      <div class="small">Prepared by ${esc(r.salesman)} · ${esc(fmtDate(String(r.quote_date).slice(0,10)))}</div></div>
      <button class="btn secondary" type="button" onclick="document.getElementById('managerQuoteDetail').style.display='none'">Close</button>
    </div>
    <div class="formgrid">
      <div><label>Status</label><div><span class="mgr-status mgr-${esc(r.status)}">${esc(r.status.toUpperCase())}</span></div></div>
      <div><label>Payment</label><div>${esc(r.payment||"")}</div></div>
      <div><label>Attention</label><div>${esc(r.attention||"")}</div></div>
      <div><label>Phone</label><div>${esc(r.phone||"")}</div></div>
      <div><label>Email</label><div>${esc(r.email||"")}</div></div>
      <div class="full"><label>Address</label><div>${esc(r.address||"")}</div></div>
    </div>
    <div class="manager-table-wrap" style="margin-top:12px">
    <table class="manager-table manager-items">
      <thead><tr><th>Item</th><th>Description</th><th>Code</th><th>Packing</th><th>Unit Price</th></tr></thead>
      <tbody>${(r.items||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.desc)}</td><td>${esc(it.code)}</td><td>${esc(it.pack)}</td><td>RM ${Number(it.price||0).toFixed(2)}</td></tr>`).join("")}</tbody>
    </table>
    </div>
    ${quotationRemark(r).trim()?`<div class="quotation-remark"><b>REMARK:</b><div class="remark-text">${esc(quotationRemark(r))}</div></div>`:""}
    <div class="actions">
      ${r.status!=="approved"?`<button class="btn success" onclick="approveQuote(${r.id})">Approve Quotation</button>`:""}
      ${r.status!=="rejected"?`<button class="btn secondary" onclick="rejectQuote(${r.id})">Reject / Return</button>`:""}
      <button class="btn danger" onclick="deleteQuote(${r.id},'${escAttr(r.quote_no)}','${escAttr(r.customer)}')">Delete Quotation</button>
    </div>`;
  box.scrollIntoView({behavior:"smooth",block:"start"});
}
async function approveQuote(id){
  if(!confirm("Approve this quotation?"))return;
  try{await api(`/manager/quotes/${id}/approve`,{method:"POST",body:JSON.stringify({managerPin})});$("managerQuoteDetail").style.display="none";await refreshManagerRecords()}catch(e){alert(e.message)}
}
async function rejectQuote(id){
  if(!confirm("Reject / return this quotation to the salesman?"))return;
  try{await api(`/manager/quotes/${id}/reject`,{method:"POST",body:JSON.stringify({managerPin})});$("managerQuoteDetail").style.display="none";await refreshManagerRecords()}catch(e){alert(e.message)}
}

async function deleteQuote(id,quoteNo,customer){
  const label=[quoteNo,customer].filter(Boolean).join(" — ");
  if(!confirm(`Permanently delete ${label || "this quotation"}?\n\nThis cannot be undone.`))return;
  try{
    await api(`/manager/quotes/${id}`,{method:"DELETE",body:JSON.stringify({managerPin})});
    $("managerQuoteDetail").style.display="none";
    await refreshManagerRecords();
  }catch(e){alert(e.message)}
}
function clearManagerFilters(){
  ["mgrSearch","mgrSalesman","mgrStatus","mgrDateFrom","mgrDateTo"].forEach(id=>{const el=$(id);if(el)el.value=""});
  refreshManagerRecords();
}
async function renderSalesmanList(){
  const list=await api("/salesmen");
  const box=$("salesmanList");box.innerHTML="";
  if(!list.length){box.innerHTML='<div class="small">No salesman names created yet.</div>';return}
  list.forEach(rec=>{
    const row=document.createElement("div");row.className="salesman-chip";
    row.innerHTML=`<span>${esc(rec.name)}</span><span style="display:flex;gap:5px">
      <button type="button" class="btn secondary" data-action="reset">Reset PIN</button>
      <button type="button" class="btn secondary" data-action="remove">Remove</button>
    </span>`;
    row.querySelector('[data-action="reset"]').onclick=()=>resetSalesmanPin(rec.id,rec.name);
    row.querySelector('[data-action="remove"]').onclick=()=>removeSalesman(rec.id,rec.name);
    box.appendChild(row);
  });
}
async function addSalesman(){
  const name=$("newSalesmanName").value.trim(),salesmanPin=$("newSalesmanPin").value.trim();
  try{
    await api("/manager/salesmen",{method:"POST",body:JSON.stringify({managerPin,name,salesmanPin})});
    $("newSalesmanName").value="";$("newSalesmanPin").value="";await renderSalesmanList();await populateManagerSalesmen();
  }catch(e){alert(e.message)}
}
async function resetSalesmanPin(id,name){
  const newPin=prompt(`Enter a new 4 to 8 digit PIN for ${name}:`);
  if(newPin===null)return;
  try{await api(`/manager/salesmen/${id}/pin`,{method:"PATCH",body:JSON.stringify({managerPin,newPin})});alert("PIN updated.")}catch(e){alert(e.message)}
}
async function removeSalesman(id,name){
  if(!confirm(`Remove ${name} from the active salesman list? Existing quotations remain.`))return;
  try{await api(`/manager/salesmen/${id}`,{method:"DELETE",body:JSON.stringify({managerPin})});await renderSalesmanList();await populateManagerSalesmen();await refreshManagerRecords()}catch(e){alert(e.message)}
}
