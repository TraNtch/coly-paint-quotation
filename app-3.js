$("namecardInput").addEventListener("change", async (e)=>{
  const file=e.target.files && e.target.files[0];
  if(!file) return;
  $("namecardImage").src=URL.createObjectURL(file);
  $("scanPreview").style.display="block";
  $("scanResult").style.display="none";
  $("scanStatus").textContent="Reading name card… this may take a few seconds.";
  try{
    if(!window.Tesseract) throw new Error("OCR library could not be loaded. Check internet connection.");
    const result = await Tesseract.recognize(file, "eng", {
      logger:m=>{
        if(m.status){
          const pct = m.progress ? ` ${Math.round(m.progress*100)}%` : "";
          $("scanStatus").textContent=`${m.status}${pct}`;
        }
      }
    });
    const text = result.data.text || "";
    parseNamecard(text);
    $("scanResult").style.display="block";
    $("scanStatus").textContent="Name card read. Please review the extracted fields.";
  }catch(err){
    $("scanStatus").textContent="Could not read the name card: "+err.message;
  }
});

function parseNamecard(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const email=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[""])[0];
  const phones=[...text.matchAll(/(?:\+?\d[\d\s\-().]{7,}\d)/g)].map(m=>m[0].trim());
  let phone=phones[0]||"";

  const companyKeywords=/\b(sdn\.?\s*bhd\.?|berhad|enterprise|trading|industries|industry|manufacturing|marketing|resources|solutions|services|company|co\.?|ltd\.?|pte\.?\s*ltd\.?|llp)\b/i;
  let company=lines.find(l=>companyKeywords.test(l)) || "";

  const noise=/(@|www\.|http|tel|fax|mobile|email|address|jalan|jln|lorong|taman|selangor|kuala lumpur|malaysia|\d{5})/i;
  let person=lines.find(l=>!noise.test(l) && !companyKeywords.test(l) && l.length>2 && l.length<45) || "";

  const addrLines=lines.filter(l=>
    /jalan|jln|lorong|persiaran|taman|industrial|selangor|kuala lumpur|malaysia|\b\d{5}\b/i.test(l)
  );
  let address=addrLines.join(", ");

  if(!company && lines.length) company=lines[0];
  if(person===company) person=lines[1]||"";

  $("scanCompany").value=company;
  $("scanPerson").value=person;
  $("scanPhone").value=phone;
  $("scanEmail").value=email;
  $("scanAddress").value=address;
}

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
  $("scanStatus").textContent="Take a clear photo of the business card. OCR will extract the contact details.";
  ["scanCompany","scanPerson","scanPhone","scanEmail","scanAddress"].forEach(id=>$(id).value="");
}

function init(){
  populateSalesmanDropdown();
  $("salesmanName").addEventListener("change",()=>{
    state.approved=false;
    setStatus();
    render();
    lockQuoteHistory();
  });
  $("quoteDate").value=new Date().toISOString().slice(0,10);
  const saved=localStorage.getItem("colyQuoteDraft");
  if(saved){
    try{
      const d=JSON.parse(saved);
      state.currentQuoteNo=d.quoteNo || getNextQuoteNo();
      Object.entries(d.fields||{}).forEach(([k,v])=>{if($(k))$(k).value=v});
      populateSalesmanDropdown((d.fields||{}).salesmanName||"");
      (d.items||[]).forEach(addItem);
      state.approved=!!d.approved;
    }catch(e){}
  }
  if(!state.currentQuoteNo) state.currentQuoteNo=getNextQuoteNo();
  if(!$("itemRows").children.length)addItem();
  setStatus();render();renderQuoteHistory();
}
init();
