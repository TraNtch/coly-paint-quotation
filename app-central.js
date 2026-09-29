const API_BASE = "https://coly-paint-quotation-api.onrender.com/api";
const state = { approved:false, currentQuoteId:null, currentQuoteNo:"", currentStatus:"draft", historyPin:"" };
const $ = id => document.getElementById(id);
const watch = ["salesmanName","quoteDate","customer","attention","phone","email","address","payment"];

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return esc(s).replace(/`/g,"&#096;")}
function fmtDate(v){ if(!v) return ""; const d=new Date(v+"T00:00:00"); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; }

async function api(path, options={}){
  const res = await fetch(API_BASE+path,{
    headers:{"Content-Type":"application/json",...(options.headers||{})},
    ...options
  });
  let data={};
  try{ data=await res.json(); }catch(e){}
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function items(){
  return [...$("itemRows").children].map(tr=>({
    desc:tr.querySelector(".i-desc")?.value||"",
    code:tr.querySelector(".i-code")?.value||"",
    pack:tr.querySelector(".i-pack")?.value||"",
    price:parseFloat(tr.querySelector(".i-price")?.value)||0
  }));
}
function bindItemRow(tr){
  tr.querySelectorAll("input").forEach(inp=>inp.addEventListener("input",()=>{
    if(state.currentStatus==="approved"){ state.currentQuoteId=null; state.currentQuoteNo=""; }
    state.approved=false; state.currentStatus="draft"; setStatus(); render();
  }));
}
function addItem(data={desc:"",code:"",pack:"",price:0}){
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><span class="item-number"></span></td>
    <td><div class="desc-wrap"><input class="i-desc" value="${escAttr(data.desc)}" placeholder="Product / description">
      <div class="desc-actions">
        <button class="variant-inline" type="button" onclick="addPackingVariant(this)">+ Pack</button>
        <button class="remove-inline" type="button" onclick="this.closest('tr').remove();state.approved=false;state.currentStatus='draft';setStatus();render()">✕</button>
      </div></div></td>
    <td><input class="i-code" value="${escAttr(data.code)}" placeholder="Code"></td>
    <td><input class="i-pack" value="${escAttr(data.pack)}" placeholder="e.g. 1 LT"></td>
    <td><input class="i-price" type="number" min="0" step="0.01" value="${Number(data.price||0)}" placeholder="0.00"></td>`;
  bindItemRow(tr); $("itemRows").appendChild(tr); render();
}
function addPackingVariant(button){
  const row=button.closest("tr");
  const desc=row.querySelector(".i-desc")?.value||"";
  const code=row.querySelector(".i-code")?.value||"";
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><span class="item-number"></span></td>
    <td><div class="desc-wrap"><input class="i-desc" value="${escAttr(desc)}" placeholder="Product / description">
      <div class="desc-actions">
        <button class="variant-inline" type="button" onclick="addPackingVariant(this)">+ Pack</button>
        <button class="remove-inline" type="button" onclick="this.closest('tr').remove();state.approved=false;state.currentStatus='draft';setStatus();render()">✕</button>
      </div></div></td>
    <td><input class="i-code" value="${escAttr(code)}" placeholder="Code"></td>
    <td><input class="i-pack" value="" placeholder="e.g. 5 LT"></td>
    <td><input class="i-price" type="number" min="0" step="0.01" value="0" placeholder="0.00"></td>`;
  bindItemRow(tr); row.insertAdjacentElement("afterend",tr);
  state.approved=false; state.currentStatus="draft"; setStatus(); render();
  tr.querySelector(".i-pack")?.focus();
}

function setStatus(){
  const b=$("statusBadge");
  if(state.currentStatus==="approved"){
    b.textContent="APPROVED — PDF UNLOCKED"; b.classList.add("approved"); $("pdfBtn").disabled=false;
  }else if(state.currentStatus==="pending"){
    b.textContent="PENDING GM APPROVAL"; b.classList.remove("approved"); $("pdfBtn").disabled=true;
  }else if(state.currentStatus==="rejected"){
    b.textContent="REJECTED / RETURNED"; b.classList.remove("approved"); $("pdfBtn").disabled=true;
  }else{
    b.textContent="DRAFT"; b.classList.remove("approved"); $("pdfBtn").disabled=true;
  }
}
function render(){
  [...$("itemRows").children].forEach((tr,i)=>{const n=tr.querySelector(".item-number"); if(n)n.textContent=i+1;});
  $("pQuoteNo").textContent=state.currentQuoteNo||"DRAFT";
  $("pDate").textContent=fmtDate($("quoteDate").value);
  const sel=$("salesmanName");
  $("pSalesman").textContent=sel.options[sel.selectedIndex]?.text||"—";
  $("pCustomer").textContent=$("customer").value||"—";
  $("pAddress").textContent=$("address").value||"—";
  $("pPhone").textContent=$("phone").value||"—";
  $("pEmail").textContent=$("email").value||"";
  $("emailLine").style.display=$("email").value.trim()?"block":"none";
  $("pAttention").textContent=$("attention").value||"";
  $("attnLine").style.display=$("attention").value.trim()?"block":"none";
  $("pPayment").textContent=$("payment").value||"—";
  const tbody=$("previewItems"); tbody.innerHTML="";
  const list=items();
  list.forEach((it,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td><td>${esc(it.desc)}</td><td>${esc(it.code)}</td><td>${esc(it.pack)}</td><td>RM ${it.price.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  for(let i=list.length;i<8;i++){
    const tr=document.createElement("tr");
    tr.innerHTML="<td>&nbsp;</td><td></td><td></td><td></td><td></td>";
    tbody.appendChild(tr);
  }
}

async function loadSalesmen(selected=""){
  try{
    const list=await api("/salesmen");
    const sel=$("salesmanName");
    sel.innerHTML='<option value="">Select salesman</option>';
    list.forEach(s=>{
      const o=document.createElement("option"); o.value=s.id; o.textContent=s.name; sel.appendChild(o);
    });
    if(selected) sel.value=String(selected);
    return list;
  }catch(e){
    alert("Central database is not ready yet: "+e.message);
    return [];
  }
}
function selectedSalesman(){
  const sel=$("salesmanName");
  return {id:Number(sel.value)||null,name:sel.options[sel.selectedIndex]?.text||""};
}

function toggleSalesmanSetup(){
  const box=$("salesmanSetup"); box.style.display=box.style.display==="none"?"block":"none";
  if(box.style.display==="block") renderSalesmanList();
}
async function renderSalesmanList(){
  try{
    const list=await api("/salesmen");
    const box=$("salesmanList"); box.innerHTML="";
    if(!list.length){box.innerHTML='<div class="small">No salesman names created yet.</div>';return;}
    list.forEach(rec=>{
      const row=document.createElement("div"); row.className="salesman-chip";
      row.innerHTML=`<span>${esc(rec.name)}</span><span style="display:flex;gap:5px">
        <button type="button" class="btn secondary" onclick="resetSalesmanPin(${rec.id},'${escAttr(rec.name)}')">Reset PIN</button>
        <button type="button" class="btn secondary" onclick="removeSalesman(${rec.id},'${escAttr(rec.name)}')">Remove</button></span>`;
      box.appendChild(row);
    });
  }catch(e){ alert(e.message); }
}
async function addSalesman(){
  const name=$("newSalesmanName").value.trim(), salesmanPin=$("newSalesmanPin").value.trim(), managerPin=$("salesmanSetupPin").value;
  try{
    const rec=await api("/manager/salesmen",{method:"POST",body:JSON.stringify({managerPin,name,salesmanPin})});
    $("newSalesmanName").value=""; $("newSalesmanPin").value="";
    await loadSalesmen(rec.id); await renderSalesmanList(); alert("Salesman added.");
  }catch(e){alert(e.message)}
}
async function resetSalesmanPin(id,name){
  const managerPin=$("salesmanSetupPin").value;
  const newPin=prompt(`Enter a new 4 to 8 digit PIN for ${name}:`);
  if(newPin===null) return;
  try{await api(`/manager/salesmen/${id}/pin`,{method:"PATCH",body:JSON.stringify({managerPin,newPin})}); alert("Salesman PIN updated.");}
  catch(e){alert(e.message)}
}
async function removeSalesman(id,name){
  const managerPin=$("salesmanSetupPin").value;
  if(!confirm(`Remove ${name} from the active salesman list? Existing quotations remain.`))return;
  try{
    await api(`/manager/salesmen/${id}`,{method:"DELETE",body:JSON.stringify({managerPin})});
    await loadSalesmen(); await renderSalesmanList(); lockQuoteHistory();
  }catch(e){alert(e.message)}
}

async function submitQuote(){
  const s=selectedSalesman();
  if(!s.id){alert("Select salesman first.");return null}
  if(!$("customer").value.trim()){alert("Enter customer/company.");return null}
  if(!items().length){alert("Add at least one item.");return null}
  const payload={
    id: state.currentStatus==="approved" ? null : state.currentQuoteId,
    quoteNo: state.currentQuoteNo||null,
    salesmanId:s.id, quoteDate:$("quoteDate").value, customer:$("customer").value.trim(),
    attention:$("attention").value,phone:$("phone").value,email:$("email").value,address:$("address").value,payment:$("payment").value,
    items:items()
  };
  const r=await api("/quotes",{method:"POST",body:JSON.stringify(payload)});
  state.currentQuoteId=r.id; state.currentQuoteNo=r.quoteNo; state.currentStatus="pending"; state.approved=false;
  setStatus(); render(); return r;
}
async function saveDraft(){
  try{ const r=await submitQuote(); if(r) alert(`Quotation ${r.quoteNo} saved centrally and submitted for approval.`);}
  catch(e){alert(e.message)}
}
async function approveQuote(){
  try{
    if(!state.currentQuoteId) await submitQuote();
    const managerPin=$("managerPin").value;
    const r=await api(`/manager/quotes/${state.currentQuoteId}/approve`,{method:"POST",body:JSON.stringify({managerPin})});
    state.currentStatus="approved"; state.approved=true; state.currentQuoteNo=r.quote_no||state.currentQuoteNo; setStatus(); render();
    alert("Quotation approved. PDF generation is unlocked.");
  }catch(e){alert(e.message)}
}
async function rejectQuote(){
  try{
    if(!state.currentQuoteId){alert("Save/submit quotation first.");return}
    const managerPin=$("managerPin").value;
    await api(`/manager/quotes/${state.currentQuoteId}/reject`,{method:"POST",body:JSON.stringify({managerPin})});
    state.currentStatus="rejected"; state.approved=false; setStatus(); render(); alert("Quotation returned to salesman.");
  }catch(e){alert(e.message)}
}
function generatePDF(){
  if(state.currentStatus!=="approved"){alert("GM approval is required before PDF generation.");return}
  document.title=(state.currentQuoteNo||"Coly-Quotation").replaceAll("/","-"); window.print();
}

async function unlockQuoteHistory(){
  const s=selectedSalesman(), pin=$("salesmanHistoryPin").value;
  if(!s.id){alert("Select your salesman name first.");return}
  if(!pin){alert("Enter your PIN.");return}
  state.historyPin=pin;
  $("historySearchWrap").style.display="block";
  await renderQuoteHistory();
}
function lockQuoteHistory(){
  state.historyPin="";
  if($("salesmanHistoryPin"))$("salesmanHistoryPin").value="";
  if($("historyCustomerSearch"))$("historyCustomerSearch").value="";
  if($("historySearchWrap"))$("historySearchWrap").style.display="none";
  $("quoteHistory").innerHTML='<div class="history-locked">Quotation history is locked. Enter your personal PIN above.</div>';
}
async function renderQuoteHistory(){
  const s=selectedSalesman();
  if(!s.id || !state.historyPin){lockQuoteHistory();return}
  try{
    const query=$("historyCustomerSearch")?.value||"";
    const data=await api("/salesmen/history",{method:"POST",body:JSON.stringify({salesmanId:s.id,pin:state.historyPin,query})});
    const box=$("quoteHistory"); box.innerHTML="";
    if(!data.quotes.length){box.innerHTML='<div class="small">No matching quotations found.</div>';return}
    data.quotes.forEach(r=>{
      const row=document.createElement("div"); row.className="history-row";
      row.innerHTML=`<div><div class="history-customer">${esc(r.customer)}</div><div>${esc(r.quote_no)}</div></div>
        <div>${esc(fmtDate(String(r.quote_date).slice(0,10)))}</div>
        <div>${esc(r.status.toUpperCase())}</div>
        <button type="button" class="btn secondary">View</button>`;
      row.querySelector("button").onclick=()=>loadQuoteRecord(r,s.id);
      box.appendChild(row);
    });
  }catch(e){ lockQuoteHistory(); alert(e.message); }
}
function loadQuoteRecord(r,salesmanId){
  state.currentQuoteId=r.id; state.currentQuoteNo=r.quote_no; state.currentStatus=r.status; state.approved=r.status==="approved";
  $("salesmanName").value=String(salesmanId);
  $("quoteDate").value=String(r.quote_date).slice(0,10);
  $("customer").value=r.customer||""; $("attention").value=r.attention||""; $("phone").value=r.phone||"";
  $("email").value=r.email||""; $("address").value=r.address||""; $("payment").value=r.payment||"30 days";
  $("itemRows").innerHTML=""; (r.items||[]).forEach(it=>addItem({desc:it.desc,code:it.code,pack:it.pack,price:Number(it.price)}));
  if(!(r.items||[]).length)addItem();
  setStatus(); render();
}
function resetAllInputs(){
  if(!confirm("Reset all entered quotation details?"))return;
  state.approved=false; state.currentQuoteId=null; state.currentQuoteNo=""; state.currentStatus="draft";
  ["customer","attention","phone","email","address"].forEach(id=>$(id).value="");
  $("payment").value="30 days"; $("quoteDate").value=new Date().toISOString().slice(0,10);
  $("itemRows").innerHTML=""; addItem(); clearNamecard(); setStatus(); render();
}

$("namecardInput").addEventListener("change", async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  $("namecardImage").src=URL.createObjectURL(file);
  $("scanPreview").style.display="block";
  $("scanResult").style.display="none";
  $("scanStatus").textContent="Scanning name card with cloud document recognition…";
  try{
    const form=new FormData();
    form.append("image",file);
    const res=await fetch(API_BASE+"/namecard/scan",{method:"POST",body:form});
    let data={}; try{data=await res.json()}catch(_){}
    if(!res.ok) throw new Error(data.error || "Name card scan failed");
    $("scanCompany").value=data.company||"";
    $("scanPerson").value=data.person||"";
    $("scanPhone").value=data.mobile||data.phone||"";
    $("scanEmail").value=data.email||"";
    $("scanAddress").value=data.address||"";
    $("scanResult").style.display="block";
    const extras=[
      data.jobTitle ? "Title: "+data.jobTitle : "",
      data.website ? "Website: "+data.website : "",
      data.fax ? "Fax: "+data.fax : ""
    ].filter(Boolean).join(" · ");
    $("scanStatus").textContent="Name card scanned. Review the extracted fields before using them."+(extras?" "+extras:"");
  }catch(err){
    $("scanStatus").textContent="Could not scan the name card: "+err.message;
  }
});

function applyScannedCustomer(){
  $("customer").value=$("scanCompany").value;
  $("attention").value=$("scanPerson").value;
  $("phone").value=$("scanPhone").value;
  $("email").value=$("scanEmail").value;
  $("address").value=$("scanAddress").value;
  render();
  $("scanStatus").textContent="Customer details applied to quotation.";
}
function clearNamecard(){
  $("namecardInput").value="";
  $("scanPreview").style.display="none";
  $("scanResult").style.display="none";
  $("scanStatus").textContent="Take or upload a clear photo of the business card. Cloud scanning will extract the contact details.";
  ["scanCompany","scanPerson","scanPhone","scanEmail","scanAddress"].forEach(id=>$(id).value="");
}
async function init(){
  $("quoteDate").value=new Date().toISOString().slice(0,10);
  watch.forEach(id=>$(id).addEventListener("input",()=>{ if(id!=="salesmanName"){state.approved=false;if(state.currentStatus==="approved"){state.currentQuoteId=null;state.currentQuoteNo="";}state.currentStatus="draft";setStatus();render();}}));
  $("salesmanName").addEventListener("change",()=>{state.approved=false;state.currentQuoteId=null;state.currentQuoteNo="";state.currentStatus="draft";setStatus();render();lockQuoteHistory();});
  await loadSalesmen(); addItem(); setStatus(); render(); lockQuoteHistory();
}

let managerRecordsUnlocked=false;
let managerRecordsPin="";

function openManagerRecords(){
  const panel=$("managerRecordsPage");
  if(!panel) return;
  panel.style.display="block";
  panel.scrollIntoView({behavior:"smooth",block:"start"});
  if(managerRecordsUnlocked) refreshManagerRecords();
}
function closeManagerRecords(){
  const panel=$("managerRecordsPage");
  if(panel) panel.style.display="none";
}
async function unlockManagerRecords(){
  const pin=$("managerRecordsPin").value;
  if(!pin){alert("Enter manager PIN.");return}
  managerRecordsPin=pin;
  try{
    managerRecordsUnlocked=true;
    await populateManagerSalesmen();
    $("managerRecordsFilters").style.display="grid";
    $("managerRecordsStats").style.display="grid";
    $("managerRecordsTableWrap").style.display="block";
    await refreshManagerRecords();
  }catch(e){
    managerRecordsUnlocked=false;
    $("managerRecordsFilters").style.display="none";
    $("managerRecordsStats").style.display="none";
    $("managerRecordsTableWrap").style.display="none";
    alert(e.message);
  }
}
function lockManagerRecords(){
  managerRecordsUnlocked=false; managerRecordsPin="";
  if($("managerRecordsPin"))$("managerRecordsPin").value="";
  if($("managerRecordsFilters"))$("managerRecordsFilters").style.display="none";
  if($("managerRecordsStats"))$("managerRecordsStats").style.display="none";
  if($("managerRecordsTableWrap"))$("managerRecordsTableWrap").style.display="none";
  if($("managerRecordsBody"))$("managerRecordsBody").innerHTML="";
}
async function refreshManagerRecords(){
  if(!managerRecordsUnlocked) return;
  const payload={
    managerPin:managerRecordsPin,
    query:$("mgrSearch")?.value||"",
    status:$("mgrStatus")?.value||"",
    salesmanId:$("mgrSalesman")?.value||"",
    dateFrom:$("mgrDateFrom")?.value||"",
    dateTo:$("mgrDateTo")?.value||""
  };
  const data=await api("/manager/quotes/search",{method:"POST",body:JSON.stringify(payload)});
  const stats=data.stats||{};
  $("mgrStatTotal").textContent=stats.total??0;
  $("mgrStatPending").textContent=stats.pending??0;
  $("mgrStatApproved").textContent=stats.approved??0;
  $("mgrStatRejected").textContent=stats.rejected??0;
  const body=$("managerRecordsBody"); body.innerHTML="";
  if(!data.quotes.length){
    body.innerHTML='<tr><td colspan="7" class="small">No quotations match the selected filters.</td></tr>';
    return;
  }
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
        <button class="btn secondary" type="button">View</button>
        ${r.status!=="approved"?'<button class="btn success" type="button" data-action="approve">Approve</button>':""}
        ${r.status!=="rejected"?'<button class="btn secondary" type="button" data-action="reject">Reject</button>':""}
      </div></td>`;
    tr.querySelector(".btn.secondary").onclick=()=>loadManagerQuote(r);
    const approveBtn=tr.querySelector('[data-action="approve"]');
    if(approveBtn) approveBtn.onclick=()=>managerRecordApprove(r.id);
    const rejectBtn=tr.querySelector('[data-action="reject"]');
    if(rejectBtn) rejectBtn.onclick=()=>managerRecordReject(r.id);
    body.appendChild(tr);
  });
}
function loadManagerQuote(r){
  closeManagerRecords();
  state.currentQuoteId=r.id; state.currentQuoteNo=r.quote_no; state.currentStatus=r.status; state.approved=r.status==="approved";
  $("salesmanName").value=String(r.salesman_id);
  $("quoteDate").value=String(r.quote_date).slice(0,10);
  $("customer").value=r.customer||""; $("attention").value=r.attention||""; $("phone").value=r.phone||"";
  $("email").value=r.email||""; $("address").value=r.address||""; $("payment").value=r.payment||"30 days";
  $("itemRows").innerHTML=""; (r.items||[]).forEach(it=>addItem({desc:it.desc,code:it.code,pack:it.pack,price:Number(it.price)}));
  if(!(r.items||[]).length)addItem();
  setStatus(); render();
  window.scrollTo({top:0,behavior:"smooth"});
}
async function managerRecordApprove(id){
  try{
    await api(`/manager/quotes/${id}/approve`,{method:"POST",body:JSON.stringify({managerPin:managerRecordsPin})});
    await refreshManagerRecords();
  }catch(e){alert(e.message)}
}
async function managerRecordReject(id){
  if(!confirm("Reject / return this quotation to the salesman?")) return;
  try{
    await api(`/manager/quotes/${id}/reject`,{method:"POST",body:JSON.stringify({managerPin:managerRecordsPin})});
    await refreshManagerRecords();
  }catch(e){alert(e.message)}
}
async function populateManagerSalesmen(){
  const list=await api("/salesmen");
  const sel=$("mgrSalesman");
  if(!sel) return;
  sel.innerHTML='<option value="">All salesmen</option>';
  list.forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.name;sel.appendChild(o);});
}

init();
