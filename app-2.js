const MANAGER_PIN = "1234";

function salesmanRecords(){
  try{
    const raw=JSON.parse(localStorage.getItem("colySalesmen") || "[]");
    if(raw.length && typeof raw[0]==="string"){
      const migrated=raw.map(name=>({name,pin:""}));
      localStorage.setItem("colySalesmen",JSON.stringify(migrated));
      return migrated;
    }
    return raw;
  }catch(e){return []}
}
function saveSalesmanRecords(records){
  localStorage.setItem("colySalesmen", JSON.stringify(records));
}
function salesmanNames(){
  return salesmanRecords().map(x=>x.name);
}
function populateSalesmanDropdown(selected){
  const sel=$("salesmanName");
  if(!sel) return;
  const current = selected !== undefined ? selected : sel.value;
  sel.innerHTML='<option value="">Select salesman</option>';
  salesmanRecords().forEach(rec=>{
    const opt=document.createElement("option");
    opt.value=rec.name; opt.textContent=rec.name;
    sel.appendChild(opt);
  });
  if(current && salesmanNames().includes(current)) sel.value=current;
}
function toggleSalesmanSetup(){
  const box=$("salesmanSetup");
  box.style.display=box.style.display==="none"?"block":"none";
  if(box.style.display==="block") renderSalesmanList();
}
function addSalesman(){
  if($("salesmanSetupPin").value!==MANAGER_PIN){alert("Incorrect manager PIN.");return}
  const name=$("newSalesmanName").value.trim();
  const pin=$("newSalesmanPin").value.trim();
  if(!name){alert("Enter salesman name.");return}
  if(!/^\d{4,8}$/.test(pin)){alert("Set a 4 to 8 digit PIN for this salesman.");return}
  const records=salesmanRecords();
  if(records.some(x=>x.name.toLowerCase()===name.toLowerCase())){alert("Salesman already exists.");return}
  records.push({name,pin});
  records.sort((a,b)=>a.name.localeCompare(b.name));
  saveSalesmanRecords(records);
  $("newSalesmanName").value="";
  $("newSalesmanPin").value="";
  populateSalesmanDropdown(name);
  renderSalesmanList();
  lockQuoteHistory();
}
function removeSalesman(name){
  if($("salesmanSetupPin").value!==MANAGER_PIN){alert("Enter the correct manager PIN first.");return}
  if(!confirm(`Remove ${name} from the salesman list? Existing quotation records will remain.`)) return;
  saveSalesmanRecords(salesmanRecords().filter(x=>x.name!==name));
  populateSalesmanDropdown("");
  renderSalesmanList();
  lockQuoteHistory();
}
function resetSalesmanPin(name){
  if($("salesmanSetupPin").value!==MANAGER_PIN){alert("Enter the correct manager PIN first.");return}
  const newPin=prompt(`Enter a new 4 to 8 digit PIN for ${name}:`);
  if(newPin===null) return;
  if(!/^\d{4,8}$/.test(newPin.trim())){alert("PIN must be 4 to 8 digits.");return}
  const records=salesmanRecords();
  const rec=records.find(x=>x.name===name);
  if(!rec) return;
  rec.pin=newPin.trim();
  saveSalesmanRecords(records);
  renderSalesmanList();
  lockQuoteHistory();
  alert("Salesman PIN updated.");
}
function renderSalesmanList(){
  const box=$("salesmanList");
  if(!box) return;
  const records=salesmanRecords();
  if(!records.length){box.innerHTML='<div class="small">No salesman names created yet.</div>';return}
  box.innerHTML="";
  records.forEach(rec=>{
    const row=document.createElement("div");
    row.className="salesman-chip";
    const safe=esc(rec.name).replace(/'/g,"&#39;");
    const pinState=rec.pin ? "PIN set" : "PIN not set";
    row.innerHTML=`<span>${esc(rec.name)} <span class="small">(${pinState})</span></span>
      <span style="display:flex;gap:5px">
        <button type="button" class="btn secondary" onclick="resetSalesmanPin('${safe}')">Reset PIN</button>
        <button type="button" class="btn secondary" onclick="removeSalesman('${safe}')">Remove</button>
      </span>`;
    box.appendChild(row);
  });
}
function quotationRecords(){
  try{return JSON.parse(localStorage.getItem("colyQuotationRecords") || "[]")}catch(e){return []}
}
function saveQuotationRecord(data){
  const records=quotationRecords();
  const idx=records.findIndex(r=>r.quoteNo===data.quoteNo);
  if(idx>=0) records[idx]=data; else records.unshift(data);
  localStorage.setItem("colyQuotationRecords", JSON.stringify(records));
}
let historyUnlockedFor="";

function unlockQuoteHistory(){
  const salesman=$("salesmanName")?.value || "";
  if(!salesman){alert("Select your salesman name first.");return}
  const rec=salesmanRecords().find(x=>x.name===salesman);
  if(!rec){alert("Salesman record not found.");return}
  if(!rec.pin){alert("No PIN has been assigned to this salesman. Please ask the manager.");return}
  if($("salesmanHistoryPin").value!==rec.pin){alert("Incorrect salesman PIN.");return}
  historyUnlockedFor=salesman;
  if($("historySearchWrap")) $("historySearchWrap").style.display="block";
  renderQuoteHistory();
}
function lockQuoteHistory(){
  historyUnlockedFor="";
  if($("salesmanHistoryPin")) $("salesmanHistoryPin").value="";
  if($("historyCustomerSearch")) $("historyCustomerSearch").value="";
  if($("historySearchWrap")) $("historySearchWrap").style.display="none";
  renderQuoteHistory();
}
function renderQuoteHistory(){
  const box=$("quoteHistory");
  if(!box) return;
  const salesman=$("salesmanName")?.value || "";
  if(!salesman){
    box.innerHTML='<div class="history-locked">Select a salesman and enter the correct PIN to view quotation history.</div>';
    return;
  }
  if(historyUnlockedFor!==salesman){
    box.innerHTML='<div class="history-locked">Quotation history is locked. Enter your personal PIN above.</div>';
    return;
  }
  let records=quotationRecords().filter(r=>r.salesman===salesman);
  const q=($("historyCustomerSearch")?.value || "").trim().toLowerCase();
  if(q){
    records=records.filter(r=>
      (r.customer||"").toLowerCase().includes(q) ||
      (r.quoteNo||"").toLowerCase().includes(q)
    );
  }
  if(!records.length){
    box.innerHTML=q
      ? '<div class="small">No matching quotation found for this customer name or quotation number.</div>'
      : '<div class="small">No approved quotations found for this salesman.</div>';
    return;
  }
  box.innerHTML="";
  records.forEach(r=>{
    const row=document.createElement("div");
    row.className="history-row";
    row.innerHTML=`
      <div>
        <div class="history-customer">${esc(r.customer||"—")}</div>
        <div>${esc(r.quoteNo||"")}</div>
      </div>
      <div>${esc(r.date||"")}</div>
      <div>${(r.items||[]).length} item(s)</div>
      <button type="button" class="btn secondary" onclick="loadQuoteRecord('${escAttr(r.quoteNo||"")}')">View</button>`;
    box.appendChild(row);
  });
}
function loadQuoteRecord(quoteNo){
  const r=quotationRecords().find(x=>x.quoteNo===quoteNo);
  if(!r) return;
  state.currentQuoteNo=r.quoteNo;
  $("salesmanName").value=r.salesman||"";
  $("quoteDate").value=r.rawDate||new Date().toISOString().slice(0,10);
  $("customer").value=r.customer||"";
  $("attention").value=r.attention||"";
  $("phone").value=r.phone||"";
  $("email").value=r.email||"";
  $("address").value=r.address||"";
  $("payment").value=r.payment||"30 days";
  $("itemRows").innerHTML="";
  (r.items||[]).forEach(addItem);
  if(!(r.items||[]).length) addItem();
  state.approved=true;
  setStatus();
  render();
  alert("Previous quotation loaded for viewing. Editing it will require approval again.");
}
