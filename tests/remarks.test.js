const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const remark = 'MOQ 10 pails for delivery\nSelf collect below MOQ < 10 & "special"';

test('migration and real SQL API round trip, edits, manager filters and history', async () => {
  const db = new PGlite();
  let server;
  try {
    // Simulate an existing installation with an item saved before remarks existed.
    await db.exec(`CREATE TABLE quote_items (
      id BIGSERIAL PRIMARY KEY, quote_id BIGINT NOT NULL, position INTEGER NOT NULL,
      description TEXT DEFAULT '', code TEXT DEFAULT '', packing TEXT DEFAULT '',
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0);
      INSERT INTO quote_items(quote_id,position,description) VALUES(999,1,'Legacy item');`);
    const query = async (sql, vals) => {
      if (!vals && sql.includes('CREATE TABLE')) { await db.exec(sql); return {rows:[],rowCount:0}; }
      const r = await db.query(sql, vals);
      return {rows:r.rows,rowCount:r.rows.length || r.affectedRows || 0};
    };
    class Pool {
      query(...args) { return query(...args); }
      async connect() { return {query,release(){}}; }
    }
    let ready;
    const listening = new Promise(resolve => { ready=resolve; });
    const express = require('express');
    const context = vm.createContext({
      require(name) {
        if (name==='pg') return {Pool};
        if (name==='express') return Object.assign(() => {
          const app = express();
          const listen = app.listen.bind(app);
          app.listen = () => { server=listen(0,'127.0.0.1',ready); return server; };
          return app;
        },express);
        return require(name);
      },
      process:{env:{DATABASE_URL:'postgres://localhost/test',MANAGER_PIN:'test-manager'}},
      __dirname:root,console,Buffer,fetch
    });
    vm.runInContext(fs.readFileSync(path.join(root,'server.js'),'utf8'),context);
    await listening;
    assert.equal((await db.query('SELECT remark FROM quote_items WHERE quote_id=999')).rows[0].remark,'');
    await vm.runInContext('initDb()',context); // Migration is repeatable.
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (url,body,method='POST') => {
      const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      return {status:res.status,data:await res.json()};
    };
    const salesman=await request('/manager/salesmen',{managerPin:'test-manager',name:'Test Sales',salesmanPin:'8765'});
    assert.equal(salesman.status,201);
    const payload={salesmanId:salesman.data.id,customer:'Remark Test',quoteDate:'2026-10-02',remark,items:[
      {desc:'Paint',code:'P1',pack:'5 LT',price:55.5},
      {desc:'Old client item',price:10}
    ]};
    const saved=await request('/quotes',payload);
    assert.equal(saved.status,200);
    const filters={managerPin:'test-manager',query:'Remark Test',status:'pending',salesmanId:salesman.data.id,dateFrom:'2026-10-01',dateTo:'2026-10-03'};
    const search=await request('/manager/quotes/search',filters);
    assert.equal(search.status,200);
    assert.equal(search.data.quotes.length,1);
    assert.equal(search.data.quotes[0].remark,remark);
    assert.equal(search.data.quotes[0].items[1].remark,'');
    payload.id=saved.data.id;
    payload.remark='MOQ 20 pails';
    assert.equal((await request('/quotes',payload)).status,200);
    const history=await request('/salesmen/history',{salesmanId:salesman.data.id,pin:'8765'});
    assert.equal(history.data.quotes[0].remark,'MOQ 20 pails');
    // Old clients that omit the overall field must not erase a saved note.
    delete payload.remark;
    assert.equal((await request('/quotes',payload)).status,200);
    assert.equal((await request('/manager/quotes/search',filters)).data.quotes[0].remark,'MOQ 20 pails');
    payload.remark='';
    assert.equal((await request('/quotes',payload)).status,200);
    assert.equal((await request('/manager/quotes/search',filters)).data.quotes[0].remark,'');
    payload.remark='x'.repeat(10001);
    assert.equal((await request('/quotes',payload)).status,400);
    payload.remark={unsafe:true};
    assert.equal((await request('/quotes',payload)).status,400);
    const oldClient=await request('/quotes',{...payload,id:null,remark:undefined,items:[{desc:'Legacy',price:5,remark:'Legacy MOQ'}]});
    assert.equal(oldClient.status,200);
    const oldClientHistory=await request('/salesmen/history',{salesmanId:salesman.data.id,pin:'8765'});
    assert.equal(oldClientHistory.data.quotes.find(q=>q.id===oldClient.data.id).remark,'Legacy MOQ');
    assert.equal((await request(`/manager/quotes/${saved.data.id}/approve`,{managerPin:'test-manager'})).status,200);
    payload.remark='Attempt to alter approved quotation';
    assert.equal((await request('/quotes',payload)).status,409);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await db.close();
  }
});

test('overall remark entry, preview, history and manager details', async () => {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{runScripts:'outside-only'});
  const w=dom.window;
  try {
    w.alert=()=>{};
    w.confirm=()=>true;
    w.fetch=async()=>({ok:true,json:async()=>[{id:1,name:'Test Sales'}]});
    w.eval(fs.readFileSync(path.join(root,'app-central.js'),'utf8')+';window.testState=state;');
    await new Promise(resolve=>setTimeout(resolve,0));
    const rec={id:2,quote_no:'QT/26/001',quote_date:'2026-10-02',customer:'Test',status:'approved',remark,items:[{desc:'Paint',price:10}]};
    w.loadQuoteRecord(rec,1);
    assert.equal(w.document.querySelector('#remark').value,remark);
    assert.equal(w.document.querySelector('#pRemark').textContent,remark);
    assert.equal(w.document.querySelector('#previewRemark').hidden,false);
    assert.equal(w.document.querySelectorAll('#previewItems tr:first-child td').length,5);
    assert.equal(w.document.querySelectorAll('#previewItems tr:last-child td').length,5);
    assert.equal(w.document.querySelectorAll('.i-remark').length,0);
    assert.equal(w.document.querySelector('#pdfBtn').disabled,false);
    const field=w.document.querySelector('#remark');
    field.value='Updated MOQ';field.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.querySelector('#pdfBtn').disabled,true);
    assert.equal(w.testState.currentQuoteId,null);
    w.addPackingVariant(w.document.querySelector('.variant-inline'));
    assert.equal(field.value,'Updated MOQ');
    assert.equal(w.items()[0].remark,undefined);
    let submitted;
    w.fetch=async(url,options)=>{submitted=JSON.parse(options.body);return {ok:true,json:async()=>({id:3,quoteNo:'QT/26/002'})}};
    await w.submitQuote();
    assert.equal(submitted.remark,'Updated MOQ');
    assert.equal(submitted.items[0].remark,undefined);
    w.loadQuoteRecord({...rec,remark:undefined,items:[{desc:'Old quotation',price:10}]},1);
    assert.equal(field.value,'');
    assert.equal(w.document.querySelector('#previewRemark').hidden,true);
    w.loadQuoteRecord({...rec,remark:undefined,items:[{desc:'Old quotation',remark:'Legacy MOQ',price:10}]},1);
    assert.equal(field.value,'Legacy MOQ');
    w.loadQuoteRecord({...rec,remark:'',items:[{desc:'Old quotation',remark:'Legacy MOQ',price:10}]},1);
    assert.equal(field.value,''); // Intentional clearing takes precedence over legacy notes.
    w.resetAllInputs();
    assert.equal(field.value,'');
    const manager=new JSDOM('<div id="managerQuoteDetail"></div>',{runScripts:'outside-only'});
    manager.window.HTMLElement.prototype.scrollIntoView=()=>{};
    manager.window.eval(fs.readFileSync(path.join(root,'manager.js'),'utf8'));
    manager.window.showQuoteDetail({...rec,salesman:'Test Sales'});
    assert.equal(manager.window.document.querySelector('.remark-text').textContent,remark);
    assert.equal(manager.window.document.querySelectorAll('.manager-items th').length,5);
    assert.equal(manager.window.document.querySelector('.quotation-remark').previousElementSibling.className,'manager-table-wrap');
    manager.window.showQuoteDetail({...rec,remark:'',salesman:'Test Sales'});
    assert.equal(manager.window.document.querySelector('.quotation-remark'),null);
    manager.window.close();
  } finally { w.close(); }
});

test('migration combines existing item notes once and preserves subsequent edits', async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE quotes(id BIGINT PRIMARY KEY);
      CREATE TABLE quote_items(quote_id BIGINT,position INTEGER,remark TEXT);
      INSERT INTO quotes VALUES(1),(2),(3);
      INSERT INTO quote_items VALUES(1,1,'MOQ 10 pails'),(1,2,'MOQ 10 pails'),(2,1,'First note'),(2,2,'Second note');`);
    const migration=fs.readFileSync(path.join(root,'migrations/002_quotation_remark.sql'),'utf8');
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT remark FROM quotes ORDER BY id')).rows.map(q=>q.remark),['MOQ 10 pails','First note\nSecond note','']);
    await db.exec("UPDATE quotes SET remark='' WHERE id=1; UPDATE quotes SET remark='Edited overall note' WHERE id=2;");
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT remark FROM quotes ORDER BY id')).rows.map(q=>q.remark),['','Edited overall note','']);
    assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM quote_items')).rows[0].total,4);
  } finally { await db.close(); }
});
