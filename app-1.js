const state = {approved:false,currentQuoteNo:""};
const $ = id => document.getElementById(id);
const watch = ["salesmanName","quoteDate","customer","attention","phone","email","address","payment"];
watch.forEach(id=>$(id).addEventListener("input", render));

function getNextQuoteNo(){
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const key = `colyQuoteSequence_${yy}`;
  let seq = parseInt(localStorage.getItem(key) || "0", 10);
  seq += 1;
  localStorage.setItem(key, String(seq));
  return `QT/${yy}/${String(seq).padStart(3,"0")}`;
}

function fmtDate(v){
  if(!v) return "";
  const d=new Date(v+"T00:00:00");
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}
function addItem(data={desc:"",code:"",pack:"",price:0}){
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><span class="item-number"></span></td>
    <td>
      <div class="desc-wrap">
        <input class="i-desc" value="${escAttr(data.desc||"")}" placeholder="Product / description">
        <div class="desc-actions">
          <button class="variant-inline" type="button" title="Add another packing size for this product"
            onclick="addPackingVariant(this)">+ Pack</button>
          <button class="remove-inline" type="button" title="Remove item"
            onclick="this.closest('tr').remove();state.approved=false;setStatus();render()">✕</button>
        </div>
      </div>
    </td>
    <td><input class="i-code" value="${escAttr(data.code||"")}" placeholder="Code"></td>
    <td><input class="i-pack" value="${escAttr(data.pack||"")}" placeholder="e.g. 1 LT / 5 LT"></td>
    <td><input class="i-price" type="number" min="0" step="0.01" value="${Number(data.price||0)}" placeholder="0.00"></td>`;
  tr.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("input",()=>{
      state.approved=false;
      setStatus();
      render();
    });
  });
  $("itemRows").appendChild(tr);
  render();
}

function addPackingVariant(button){
  const row=button.closest("tr");
  const desc=row.querySelector(".i-desc")?.value || "";
  const code=row.querySelector(".i-code")?.value || "";
  const newRow=document.createElement("tr");
  newRow.innerHTML=`
    <td><span class="item-number"></span></td>
    <td>
      <div class="desc-wrap">
        <input class="i-desc" value="${escAttr(desc)}" placeholder="Product / description">
        <div class="desc-actions">
          <button class="variant-inline" type="button" title="Add another packing size for this product"
            onclick="addPackingVariant(this)">+ Pack</button>
          <button class="remove-inline" type="button" title="Remove item"
            onclick="this.closest('tr').remove();state.approved=false;setStatus();render()">✕</button>
        </div>
      </div>
    </td>
    <td><input class="i-code" value="${escAttr(code)}" placeholder="Code"></td>
    <td><input class="i-pack" value="" placeholder="e.g. 1 LT / 5 LT"></td>
    <td><input class="i-price" type="number" min="0" step="0.01" value="0" placeholder="0.00"></td>`;
  newRow.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("input",()=>{
      state.approved=false;
      setStatus();
      render();
    });
  });
  row.insertAdjacentElement("afterend",newRow);
  state.approved=false;
  setStatus();
  render();
  newRow.querySelector(".i-pack")?.focus();
}

function items(){
  return [...$("itemRows").children].map(tr=>({
    desc:tr.querySelector(".i-desc")?.value || "",
    code:tr.querySelector(".i-code")?.value || "",
    pack:tr.querySelector(".i-pack")?.value || "",
    price:parseFloat(tr.querySelector(".i-price")?.value) || 0
  }));
}
function render(){
  state.approved=false; setStatus();
  [...$("itemRows").children].forEach((tr,i)=>{
    const n=tr.querySelector(".item-number");
    if(n) n.textContent=i+1;
  });
  $("pQuoteNo").textContent=state.currentQuoteNo||"";
  $("pDate").textContent=fmtDate($("quoteDate").value);
  $("pSalesman").textContent=$("salesmanName").value||"—";
  $("pCustomer").textContent=$("customer").value||"—";
  $("pAddress").textContent=$("address").value||"—";
  $("pAttention").textContent=$("attention").value||"";
  $("attnLine").style.display=$("attention").value.trim()?"block":"none";
  $("pPhone").textContent=$("phone").value||"—";
  $("pEmail").textContent=$("email").value||"";
  $("emailLine").style.display=$("email").value.trim()?"block":"none";
  $("pPayment").textContent=$("payment").value||"—";

  const list=items(), tbody=$("previewItems"); tbody.innerHTML="";
  list.forEach((it,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td><td>${esc(it.desc)}</td><td>${esc(it.code)}</td><td>${esc(it.pack)}</td><td>RM ${it.price.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  const minRows = 8;
  for(let i=list.length;i<minRows;i++){
    const tr=document.createElement("tr");
    tr.innerHTML="<td>&nbsp;</td><td></td><td></td><td></td><td></td>";
    tbody.appendChild(tr);
  }

}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return esc(s).replace(/`/g,"&#096;")}
function setStatus(){
  const b=$("statusBadge");
  if(state.approved){b.textContent="APPROVED — PDF UNLOCKED";b.classList.add("approved");$("pdfBtn").disabled=false}
  else{b.textContent="DRAFT / PENDING APPROVAL";b.classList.remove("approved");$("pdfBtn").disabled=true}
}
function saveDraft(){
  const data={quoteNo:state.currentQuoteNo,fields:Object.fromEntries(watch.map(id=>[id,$(id).value])),items:items(),approved:false};
  localStorage.setItem("colyQuoteDraft",JSON.stringify(data));
  alert("Quotation saved and marked Pending Approval.");
}
function approveQuote(){
  if($("managerPin").value!=="1234"){alert("Incorrect manager PIN.");return}
  if(!$("salesmanName").value.trim()){alert("Please enter salesman name first.");return}
  if(!$("customer").value.trim()){alert("Please enter customer/company first.");return}
  if(!items().length){alert("Please add at least one item.");return}
  state.approved=true; setStatus();
  const data={quoteNo:state.currentQuoteNo,fields:Object.fromEntries(watch.map(id=>[id,$(id).value])),items:items(),approved:true,approvedAt:new Date().toISOString()};
  localStorage.setItem("colyQuoteDraft",JSON.stringify(data));
  saveQuotationRecord({
    quoteNo:state.currentQuoteNo,
    salesman:$("salesmanName").value,
    customer:$("customer").value,
    attention:$("attention").value,
    phone:$("phone").value,
    email:$("email").value,
    address:$("address").value,
    payment:$("payment").value,
    rawDate:$("quoteDate").value,
    date:fmtDate($("quoteDate").value),
    items:items(),
    approvedAt:new Date().toISOString()
  });
  renderQuoteHistory();
  alert("Quotation approved. PDF generation is now unlocked and the quotation has been added to this salesman's history.");
}
function rejectQuote(){state.approved=false;setStatus();alert("Quotation returned to salesman for amendment.");}
function generatePDF(){
  if(!state.approved){alert("GM approval is required before PDF generation.");return}
  document.title=(state.currentQuoteNo||"Coly-Quotation").replaceAll("/","-");
  window.print();
}
function resetAllInputs(){
  if(!confirm("Reset all entered quotation details?")) return;

  // Clear customer / quotation input fields, but keep the current quotation sequence number.
  ["customer","attention","phone","email","address"].forEach(id=>{
    if($(id)) $(id).value="";
  });

  $("payment").value="30 days";
  $("quoteDate").value=new Date().toISOString().slice(0,10);

  // Clear all product rows and restore one blank row.
  $("itemRows").innerHTML="";
  addItem();

  // Clear name card scan area.
  clearNamecard();

  // Reset approval and saved draft.
  state.approved=false;
  localStorage.removeItem("colyQuoteDraft");
  setStatus();
  render();
}
