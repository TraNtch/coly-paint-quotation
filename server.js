const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const port = process.env.PORT || 10000;
const managerPin = process.env.MANAGER_PIN || "1234";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({
  origin: allowedOrigin === "*" ? true : allowedOrigin.split(",").map(s=>s.trim()),
  methods: ["GET","POST","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({limit:"2mb"}));

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
}) : null;

function requireDb(req,res,next){
  if(!pool) return res.status(503).json({error:"Database not linked yet. Set DATABASE_URL in Render."});
  next();
}
function managerOk(pin){ return String(pin||"") === String(managerPin); }

async function initDb(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salesmen (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quote_sequences (
      year SMALLINT PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id BIGSERIAL PRIMARY KEY,
      quote_no TEXT UNIQUE NOT NULL,
      salesman_id INTEGER NOT NULL REFERENCES salesmen(id),
      quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
      customer TEXT NOT NULL,
      attention TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      payment TEXT DEFAULT '30 days',
      remark TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quote_items (
      id BIGSERIAL PRIMARY KEY,
      quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      description TEXT DEFAULT '',
      code TEXT DEFAULT '',
      packing TEXT DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_quotes_salesman ON quotes(salesman_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_customer_lower ON quotes(LOWER(customer));
  `);
  await pool.query(fs.readFileSync(path.join(__dirname,"migrations/001_item_remark.sql"),"utf8"));
  await pool.query(fs.readFileSync(path.join(__dirname,"migrations/002_quotation_remark.sql"),"utf8"));
}

async function verifySalesman(salesmanId,pin){
  const r = await pool.query("SELECT id,name,pin_hash FROM salesmen WHERE id=$1 AND active=TRUE",[salesmanId]);
  if(!r.rowCount) return null;
  const ok = await bcrypt.compare(String(pin||""), r.rows[0].pin_hash);
  return ok ? r.rows[0] : null;
}

async function nextQuoteNo(client){
  const yy = new Date().getFullYear() % 100;
  const r = await client.query(`
    INSERT INTO quote_sequences(year,last_number) VALUES($1,1)
    ON CONFLICT (year) DO UPDATE SET last_number=quote_sequences.last_number+1
    RETURNING last_number
  `,[yy]);
  return `QT/${String(yy).padStart(2,"0")}/${String(r.rows[0].last_number).padStart(3,"0")}`;
}



function parseGoogleBusinessCard(text){
  const rawLines = String(text||"").split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const unique = [...new Set(rawLines)];
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[""])[0];
  const website = (text.match(/(?:https?:\/\/|www\.)[^\s]+/i)||[""])[0];

  const phoneCandidates = [...text.matchAll(/(?:\+?6?0?1\d[\s-]?\d{3,4}[\s-]?\d{4}|\+?6?0?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4})/g)]
    .map(m=>m[0].trim()).filter((v,i,a)=>a.indexOf(v)===i);
  const mobile = phoneCandidates.find(p=>/^(?:\+?6?0?)?1\d/.test(p.replace(/[\s-]/g,""))) || "";
  const phone = phoneCandidates.find(p=>p!==mobile) || mobile || "";

  const companyRegex = /\b(sdn\.?\s*bhd\.?|berhad|enterprise|trading|industr(?:y|ies)|manufactur(?:ing|er)|resources?|marketing|suppl(?:y|ies)|services?|engineering|technology|technologies|solutions?|holdings?|group|corporation|corp\.?|company|co\.?|ltd\.?|pte\.?\s*ltd\.?)\b/i;
  const company = unique.find(l=>companyRegex.test(l)) || "";

  const titleRegex = /\b(manager|director|executive|engineer|sales|marketing|business development|consultant|supervisor|officer|founder|owner|proprietor|general manager|managing director|purchasing|procurement|account|finance|operation|operations)\b/i;
  const jobTitle = unique.find(l=>titleRegex.test(l) && !companyRegex.test(l)) || "";

  const contactNoise = /(?:@|www\.|https?:|\b(?:tel|telephone|mobile|mob|hp|phone|fax|email|e-mail|website|web)\b|\+?6?0?1\d|\+?6?0?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4})/i;
  const addressMarker = /\b(no\.?|lot|jalan|jln|lorong|lrng|persiaran|taman|bandar|kampung|kg\.?|industrial|industri|selangor|kuala lumpur|kl|johor|penang|pulau pinang|perak|kedah|melaka|malacca|sabah|sarawak|negeri sembilan|pahang|terengganu|kelantan|putrajaya|malaysia)\b|\b\d{5}\b/i;
  let addressStart = unique.findIndex(l=>addressMarker.test(l) && !contactNoise.test(l));
  let addressLines=[];
  if(addressStart>=0){
    for(let i=addressStart;i<unique.length && addressLines.length<5;i++){
      const l=unique[i];
      if(contactNoise.test(l) || l===company || l===jobTitle) break;
      addressLines.push(l);
      if(/malaysia/i.test(l)) break;
    }
  }
  const address = addressLines.join(", ");

  const excluded = new Set([company,jobTitle,...addressLines].filter(Boolean));
  const personCandidates = unique.filter(l=>{
    if(excluded.has(l)) return false;
    if(contactNoise.test(l) || companyRegex.test(l) || addressMarker.test(l)) return false;
    if(/\d/.test(l)) return false;
    const words=l.split(/\s+/);
    return words.length>=2 && words.length<=5 && l.length>=4 && l.length<=60;
  });
  const person = personCandidates[0] || "";

  return {company,person,jobTitle,mobile,phone,email,website,address,rawText:String(text||"")};
}

app.get("/api/namecard/status",(req,res)=>{
  res.json({
    provider:"google-vision",
    configured:Boolean(process.env.GOOGLE_VISION_API_KEY),
    keyConfigured:Boolean(process.env.GOOGLE_VISION_API_KEY)
  });
});

app.post("/api/namecard/scan", upload.single("image"), async (req,res)=>{
  const key = process.env.GOOGLE_VISION_API_KEY || "";
  if(!key) return res.status(503).json({error:"Google Vision OCR is not configured yet. GOOGLE_VISION_API_KEY is missing."});
  if(!req.file) return res.status(400).json({error:"Image is required"});
  try{
    const body={
      requests:[{
        image:{content:req.file.buffer.toString("base64")},
        features:[{type:"DOCUMENT_TEXT_DETECTION"}],
        imageContext:{languageHints:["en","ms","zh"]}
      }]
    };
    const visionRes=await fetch("https://vision.googleapis.com/v1/images:annotate?key="+encodeURIComponent(key),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const data=await visionRes.json().catch(()=>({}));
    if(!visionRes.ok){
      const msg=data?.error?.message || "Google Vision request failed";
      return res.status(502).json({error:msg});
    }
    const result=data?.responses?.[0] || {};
    if(result.error) return res.status(422).json({error:result.error.message || "Google Vision could not read this name card"});
    const text=result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || "";
    if(!text.trim()) return res.status(422).json({error:"No readable text was detected. Try a clearer, straighter photo with less glare."});
    res.json(parseGoogleBusinessCard(text));
  }catch(e){
    console.error("Google Vision name card scan error",e);
    res.status(500).json({error:"Name card scan failed",details:e.message});
  }
});

app.get("/api/health", async (req,res)=>{
  if(!pool) return res.status(503).json({ok:false,database:false});
  try{
    await pool.query("SELECT 1");
    res.json({ok:true,database:true});
  }catch(e){
    res.status(503).json({ok:false,database:false,error:e.message});
  }
});

app.get("/api/salesmen", requireDb, async (req,res)=>{
  const r = await pool.query("SELECT id,name FROM salesmen WHERE active=TRUE ORDER BY name");
  res.json(r.rows);
});

app.post("/api/manager/salesmen", requireDb, async (req,res)=>{
  const {managerPin:pin,name,salesmanPin} = req.body || {};
  if(!managerOk(pin)) return res.status(401).json({error:"Incorrect manager PIN"});
  if(!String(name||"").trim()) return res.status(400).json({error:"Salesman name required"});
  if(!/^\d{4,8}$/.test(String(salesmanPin||""))) return res.status(400).json({error:"Salesman PIN must be 4 to 8 digits"});
  const hash = await bcrypt.hash(String(salesmanPin),10);
  try{
    const r = await pool.query(
      "INSERT INTO salesmen(name,pin_hash) VALUES($1,$2) RETURNING id,name",
      [String(name).trim(),hash]
    );
    res.status(201).json(r.rows[0]);
  }catch(e){
    if(e.code==="23505") return res.status(409).json({error:"Salesman already exists"});
    throw e;
  }
});

app.patch("/api/manager/salesmen/:id/pin", requireDb, async (req,res)=>{
  const {managerPin:pin,newPin} = req.body || {};
  if(!managerOk(pin)) return res.status(401).json({error:"Incorrect manager PIN"});
  if(!/^\d{4,8}$/.test(String(newPin||""))) return res.status(400).json({error:"PIN must be 4 to 8 digits"});
  const hash = await bcrypt.hash(String(newPin),10);
  const r = await pool.query("UPDATE salesmen SET pin_hash=$1 WHERE id=$2 RETURNING id,name",[hash,req.params.id]);
  if(!r.rowCount) return res.status(404).json({error:"Salesman not found"});
  res.json(r.rows[0]);
});

app.delete("/api/manager/salesmen/:id", requireDb, async (req,res)=>{
  const {managerPin:pin} = req.body || {};
  if(!managerOk(pin)) return res.status(401).json({error:"Incorrect manager PIN"});
  const r = await pool.query("UPDATE salesmen SET active=FALSE WHERE id=$1 RETURNING id,name",[req.params.id]);
  if(!r.rowCount) return res.status(404).json({error:"Salesman not found"});
  res.json({ok:true});
});

app.post("/api/quotes", requireDb, async (req,res)=>{
  const b = req.body || {};
  if(!b.salesmanId) return res.status(400).json({error:"Salesman required"});
  if(!String(b.customer||"").trim()) return res.status(400).json({error:"Customer required"});
  if(!Array.isArray(b.items) || !b.items.length) return res.status(400).json({error:"At least one item required"});

  if(b.items.some(it=>it && it.remark != null && (typeof it.remark!=="string" || it.remark.length>1000))){
    return res.status(400).json({error:"Item remark must be text of at most 1000 characters"});
  }

  if(b.remark != null && (typeof b.remark!=="string" || b.remark.length>10000)){
    return res.status(400).json({error:"Quotation remark must be text of at most 10000 characters"});
  }
  // Retain compatibility with clients that still send individual item remarks.
  const legacyRemarks=[...new Set(b.items.map(it=>String(it?.remark||"").trim()).filter(Boolean))].join("\n");
  const overallRemark=b.remark ?? (legacyRemarks || null);

  const client = await pool.connect();
  try{
    await client.query("BEGIN");
    let quoteId = b.id || null;
    let quoteNo = b.quoteNo || null;
    if(quoteId){
      const own = await client.query("SELECT id,status FROM quotes WHERE id=$1",[quoteId]);
      if(!own.rowCount) throw Object.assign(new Error("Quote not found"),{status:404});
      if(own.rows[0].status==="approved") throw Object.assign(new Error("Approved quotation cannot be edited; create a new quotation instead."),{status:409});
      await client.query(`
        UPDATE quotes SET salesman_id=$1,quote_date=$2,customer=$3,attention=$4,phone=$5,email=$6,address=$7,payment=$8,remark=COALESCE($10,remark),status='pending',updated_at=NOW()
        WHERE id=$9
      `,[b.salesmanId,b.quoteDate||new Date().toISOString().slice(0,10),b.customer,b.attention||"",b.phone||"",b.email||"",b.address||"",b.payment||"30 days",quoteId,overallRemark]);
      await client.query("DELETE FROM quote_items WHERE quote_id=$1",[quoteId]);
    } else {
      quoteNo = await nextQuoteNo(client);
      const q = await client.query(`
        INSERT INTO quotes(quote_no,salesman_id,quote_date,customer,attention,phone,email,address,payment,remark,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
        RETURNING id,quote_no
      `,[quoteNo,b.salesmanId,b.quoteDate||new Date().toISOString().slice(0,10),b.customer,b.attention||"",b.phone||"",b.email||"",b.address||"",b.payment||"30 days",overallRemark||""]);
      quoteId = q.rows[0].id;
    }
    for(let i=0;i<b.items.length;i++){
      const it=b.items[i]||{};
      await client.query(`
        INSERT INTO quote_items(quote_id,position,description,code,packing,unit_price,remark)
        VALUES($1,$2,$3,$4,$5,$6,$7)
      `,[quoteId,i+1,it.desc||"",it.code||"",it.pack||"",Number(it.price)||0,it.remark??""]);
    }
    await client.query("COMMIT");
    res.json({id:quoteId,quoteNo,status:"pending"});
  }catch(e){
    await client.query("ROLLBACK");
    res.status(e.status||500).json({error:e.message});
  }finally{
    client.release();
  }
});

app.post("/api/manager/quotes/:id/approve", requireDb, async (req,res)=>{
  if(!managerOk(req.body?.managerPin)) return res.status(401).json({error:"Incorrect manager PIN"});
  const r=await pool.query(`
    UPDATE quotes SET status='approved',approved_at=NOW(),updated_at=NOW()
    WHERE id=$1 RETURNING id,quote_no,status,approved_at
  `,[req.params.id]);
  if(!r.rowCount) return res.status(404).json({error:"Quote not found"});
  res.json(r.rows[0]);
});

app.post("/api/manager/quotes/:id/reject", requireDb, async (req,res)=>{
  if(!managerOk(req.body?.managerPin)) return res.status(401).json({error:"Incorrect manager PIN"});
  const r=await pool.query(`
    UPDATE quotes SET status='rejected',approved_at=NULL,updated_at=NOW()
    WHERE id=$1 RETURNING id,quote_no,status
  `,[req.params.id]);
  if(!r.rowCount) return res.status(404).json({error:"Quote not found"});
  res.json(r.rows[0]);
});


app.delete("/api/manager/quotes/:id", requireDb, async (req,res)=>{
  if(!managerOk(req.body?.managerPin)) return res.status(401).json({error:"Incorrect manager PIN"});
  const r=await pool.query(
    "DELETE FROM quotes WHERE id=$1 RETURNING id,quote_no,customer,status",
    [req.params.id]
  );
  if(!r.rowCount) return res.status(404).json({error:"Quote not found"});
  res.json({ok:true,deleted:r.rows[0]});
});


app.post("/api/manager/quotes/search", requireDb, async (req,res)=>{
  const {managerPin:pin,query,status,salesmanId,dateFrom,dateTo} = req.body || {};
  if(!managerOk(pin)) return res.status(401).json({error:"Incorrect manager PIN"});
  const vals=[];
  const where=[];
  if(String(query||"").trim()){
    vals.push(`%${String(query).trim()}%`);
    where.push(`(q.quote_no ILIKE $${vals.length} OR q.customer ILIKE $${vals.length} OR s.name ILIKE $${vals.length})`);
  }
  if(status && ["pending","approved","rejected"].includes(status)){
    vals.push(status); where.push(`q.status=$${vals.length}`);
  }
  if(salesmanId){
    vals.push(Number(salesmanId)); where.push(`q.salesman_id=$${vals.length}`);
  }
  if(dateFrom){
    vals.push(dateFrom); where.push(`q.quote_date >= $${vals.length}`);
  }
  if(dateTo){
    vals.push(dateTo); where.push(`q.quote_date <= $${vals.length}`);
  }
  const clause = where.length ? "WHERE "+where.join(" AND ") : "";
  const rows = await pool.query(`
    SELECT q.id,q.quote_no,q.quote_date,q.customer,q.attention,q.phone,q.email,q.address,q.payment,q.remark,q.status,
           q.approved_at,q.created_at,q.updated_at,q.salesman_id,s.name AS salesman,
      COALESCE(json_agg(json_build_object('desc',i.description,'code',i.code,'pack',i.packing,'price',i.unit_price,'remark',COALESCE(i.remark,''),'position',i.position)
        ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),'[]'::json) AS items
    FROM quotes q
    JOIN salesmen s ON s.id=q.salesman_id
    LEFT JOIN quote_items i ON i.quote_id=q.id
    ${clause}
    GROUP BY q.id,s.name
    ORDER BY q.created_at DESC
    LIMIT 500
  `, vals);
  const stats = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='pending')::int AS pending,
      COUNT(*) FILTER (WHERE status='approved')::int AS approved,
      COUNT(*) FILTER (WHERE status='rejected')::int AS rejected
    FROM quotes
  `);
  res.json({quotes:rows.rows,stats:stats.rows[0]});
});

app.post("/api/salesmen/history", requireDb, async (req,res)=>{
  const {salesmanId,pin,query} = req.body || {};
  const salesman = await verifySalesman(salesmanId,pin);
  if(!salesman) return res.status(401).json({error:"Incorrect salesman PIN"});
  const q = String(query||"").trim();
  const vals=[salesmanId];
  let where="WHERE q.salesman_id=$1";
  if(q){
    vals.push(`%${q}%`);
    where += " AND (q.customer ILIKE $2 OR q.quote_no ILIKE $2)";
  }
  const rows=await pool.query(`
    SELECT q.id,q.quote_no,q.quote_date,q.customer,q.attention,q.phone,q.email,q.address,q.payment,q.remark,q.status,q.approved_at,q.created_at,
      COALESCE(json_agg(json_build_object('desc',i.description,'code',i.code,'pack',i.packing,'price',i.unit_price,'remark',COALESCE(i.remark,''),'position',i.position)
        ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),'[]'::json) AS items
    FROM quotes q
    LEFT JOIN quote_items i ON i.quote_id=q.id
    ${where}
    GROUP BY q.id
    ORDER BY q.created_at DESC
    LIMIT 200
  `,vals);
  res.json({salesman:{id:salesman.id,name:salesman.name},quotes:rows.rows});
});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({error:"Server error"});
});

initDb().then(()=>{
  app.listen(port,()=>console.log(`Coly quotation API listening on ${port}`));
}).catch(err=>{
  console.error("DB initialization failed",err);
  process.exitCode=1;
});
