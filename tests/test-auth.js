// Chạy: node tests/test-auth.js   (Node 18+, không cần cài thêm gói)
// Kiểm thử AuthHub (auth.js) với localStorage/sessionStorage/fetch giả, và đoạn callAI() trong app.js với token tài khoản.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const mem=()=>{const m={};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},_m:m}};
let calls=[],reply=()=>({ok:true,status:200,json:async()=>({}),text:async()=>'{}',headers:new Map()});
const loc={protocol:'https:',origin:'https://u.github.io',pathname:'/hopdong-key/',search:'',hash:'',assign(u){loc.last=u}};
globalThis.localStorage=mem();globalThis.sessionStorage=mem();globalThis.location=loc;
globalThis.fetch=async(u,o)=>{calls.push({u:String(u),o});return reply(u,o)};
delete require.cache[require.resolve('../auth.js')];
const H=require('../auth.js');
(async()=>{
 // 1. Mặc định giữ nguyên chế độ API Key
 assert.strictEqual(H.getMode(),'key');assert.strictEqual(H.activeConn(),null);

 // 2. Nhà cung cấp chưa hỗ trợ: không có luồng kết nối giả
 for(const id of['openai','anthropic','others']){assert.strictEqual(H.PROVIDERS[id].status,'unavailable');assert(H.PROVIDERS[id].why.length>40);
  await assert.rejects(()=>H.connect(id),/chưa được hỗ trợ/)}

 // 3. OpenRouter: tạo URL PKCE S256, không có client secret
 const r1=await H.connect('openrouter');assert.strictEqual(r1,null);
 const u=new URL(loc.last);assert.strictEqual(u.origin+u.pathname,'https://openrouter.ai/auth');
 assert.strictEqual(u.searchParams.get('callback_url'),'https://u.github.io/hopdong-key/');assert.strictEqual(u.searchParams.get('code_challenge_method'),'S256');
 const pend=JSON.parse(sessionStorage.getItem('hdk.ai.pending.v1')),ch=require('crypto').createHash('sha256').update(pend.v).digest('base64url');
 assert.strictEqual(u.searchParams.get('code_challenge'),ch,'code_challenge phải = SHA256(verifier)');

 // 4. Quay lại với ?code=…: đổi code lấy key, lưu theo trình duyệt, KHÔNG tự đổi chế độ
 loc.search='?code=abc123';
 reply=(url,o)=>{if(String(url).endsWith('/auth/keys')){const b=JSON.parse(o.body);assert.strictEqual(b.code,'abc123');assert.strictEqual(b.code_verifier,pend.v);return{ok:true,status:200,json:async()=>({key:'sk-or-TEST',user_id:'user_1'})}}return{ok:true,status:200,json:async()=>({})}};
 const hr=await H.handleRedirect();assert.deepStrictEqual(hr,{provider:'openrouter'});
 assert.strictEqual(sessionStorage.getItem('hdk.ai.pending.v1'),null,'verifier phải bị xoá sau khi dùng');
 assert.strictEqual(H.conn('openrouter').token,'sk-or-TEST');assert.strictEqual(H.getMode(),'key');assert.strictEqual(H.activeConn().provider,'openrouter');
 assert.strictEqual(await H.handleRedirect(),null,'gọi lại không được đổi code lần hai');
 // ?code= không do ứng dụng khởi tạo thì bỏ qua
 loc.search='?code=zzz';calls=[];assert.strictEqual(await H.handleRedirect(),null);assert.strictEqual(calls.length,0);

 // 5. Token không nằm trong IndexedDB/sao lưu: chỉ ở localStorage khoá riêng
 assert(Object.keys(localStorage._m).every(k=>k.startsWith('hdk.ai.')));

 // 6. Chuyển đổi chế độ và asKey/resolve (OpenRouter -> khoá kiểu openai-compatible)
 H.setMode('account');H.setModel('openrouter','openai/gpt-4o-mini');
 const k=H.asKey(H.activeConn());assert.strictEqual(k.auth,'account');assert.strictEqual(k.provider,'openrouter');assert(!JSON.stringify(k).includes('sk-or-TEST'),'asKey không được chứa token');
 const rk=await H.resolve(k);assert.strictEqual(rk.key,'sk-or-TEST');assert.strictEqual(rk.model,'openai/gpt-4o-mini');
 await assert.rejects(()=>H.resolve({...k,model:''}),/Model ID/);

 // 7. Gemini: token hết hạn mà không gia hạn được -> báo kết nối lại, đánh dấu stale
 localStorage.setItem('hdk.ai.accounts.v1',JSON.stringify({...H.state(),conns:{...H.state().conns,gemini:{token:'ya29.old',expiresAt:Date.now()-1000,account:{label:'a@b.c'},model:'gemini-2.5-flash',clientId:'cid'}}}));
 const gk=H.asKey({...H.conn('gemini'),provider:'gemini'});globalThis.google=undefined;globalThis.document={head:{append(s){setTimeout(()=>s.onerror&&s.onerror(),0)}},createElement:()=>({})};
 await assert.rejects(()=>H.resolve(gk),/Kết nối lại/);assert.strictEqual(H.conn('gemini').stale,true);
 await assert.rejects(()=>H.resolve(gk),/hết hiệu lực/);

 // 8. Gemini còn hạn -> dùng Bearer, không có ?key=
 localStorage.setItem('hdk.ai.accounts.v1',JSON.stringify({...H.state(),conns:{...H.state().conns,gemini:{token:'ya29.ok',expiresAt:Date.now()+3e6,model:'gemini-2.5-flash'}}}));
 const gr=await H.resolve(H.asKey({...H.conn('gemini'),provider:'gemini'}));assert.strictEqual(gr.bearer,'ya29.ok');assert.strictEqual(gr.key,'');

 // 9. Danh sách model
 reply=u=>({ok:true,status:200,json:async()=>String(u).includes('openrouter')?{data:[{id:'a/b'},{id:'c/d'}]}:{models:[{name:'models/gemini-x',supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}]}});
 assert.deepStrictEqual(await H.models('openrouter'),['a/b','c/d']);assert.deepStrictEqual(await H.models('gemini'),['gemini-x']);

 // 10. Đăng xuất: xoá kết nối, chuyển active sang kết nối còn lại
 await H.disconnect('openrouter');assert.strictEqual(H.conn('openrouter'),null);assert.strictEqual(H.activeConn()?.provider,'gemini');
 await H.disconnect('gemini');assert.strictEqual(H.activeConn(),null);

 // 11. callAI() trong app.js (đã vá): Gemini dùng Bearer, OpenRouter dùng Authorization + /chat/completions, API Key cũ không đổi
 const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),a=src.indexOf('async function callAI'),b=src.indexOf('async function listModels');
 const ctx={PROVIDERS:(()=>{const c={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../providers.js'),'utf8').replace('const PROVIDERS','this.PROVIDERS'),c);return c.PROVIDERS})(),AuthHub:H,toast(){},fetch:globalThis.fetch,setTimeout,Promise,JSON,Object,TypeError,Error,encodeURIComponent,
  AH:k=>({'x-api-key':k.key}),ERR:{401:'Sai API Key'},quota:()=>null,dur:()=>0};
 vm.createContext(ctx);vm.runInContext(src.slice(a,b)+';this.callAI=callAI',ctx);
 const ok=(txt)=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(txt)});
 let seen;globalThis.fetch=ctx.fetch=async(u,o)=>{seen={u:String(u),o};return seen.u.includes('generativelanguage')?ok({candidates:[{content:{parts:[{text:'OK'}]}}]}):ok({choices:[{message:{content:'OK'}}]})};
 // API Key Gemini như cũ
 await ctx.callAI({provider:'gemini',model:'gemini-2.5-flash',key:'AIzaX'},'p','t',{tries:1,json:false});
 assert(seen.u.includes('?key=AIzaX')&&!seen.o.headers.Authorization,'API Key Gemini phải giữ nguyên cơ chế ?key=');
 // Tài khoản Gemini
 await ctx.callAI({provider:'gemini',model:'gemini-2.5-flash',key:'',bearer:'ya29.tok'},'p','t',{tries:1,json:false});
 assert(!seen.u.includes('key=')&&seen.o.headers.Authorization==='Bearer ya29.tok');
 // Tài khoản OpenRouter qua resolve()
 localStorage.setItem('hdk.ai.accounts.v1',JSON.stringify({mode:'account',active:'openrouter',conns:{openrouter:{token:'sk-or-X',model:'m/x'}},cfg:{}}));
 await ctx.callAI(H.asKey(H.activeConn()),'p','t',{tries:1,json:false});
 assert.strictEqual(seen.u,'https://openrouter.ai/api/v1/chat/completions');assert.strictEqual(seen.o.headers.Authorization,'Bearer sk-or-X');
 // 401 ở chế độ tài khoản: thông báo kết nối lại + đánh dấu stale, không có "Sai API Key"
 globalThis.fetch=ctx.fetch=async()=>({ok:false,status:401,headers:{get:()=>null},text:async()=>'unauth'});
 await assert.rejects(()=>ctx.callAI(H.asKey(H.activeConn()),'p','t',{tries:1,json:false}),e=>/Kết nối lại/.test(e.message)&&!/Sai API Key/.test(e.message));
 assert.strictEqual(H.conn('openrouter').stale,true);
 console.log('Tất cả kiểm thử auth đều đạt.');
})().catch(e=>{console.error(e);process.exit(1)});
