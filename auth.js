/* =====================================================================
   AuthHub – "Đăng nhập AI cá nhân" (OAuth chính thức, chạy hoàn toàn trên trình duyệt)

   NGUYÊN TẮC
   - Chỉ dùng OAuth/API do nhà cung cấp công bố cho ứng dụng bên thứ ba.
     KHÔNG dùng cookie, KHÔNG trích token phiên đăng nhập, KHÔNG dùng API không chính thức.
   - Nhà cung cấp chưa có luồng chính thức dùng được trên trang tĩnh (GitHub Pages)
     được khai báo status:'unavailable' kèm lý do; giao diện không có nút kết nối giả.
   - Kết nối lưu trong localStorage của CHÍNH trình duyệt này, nằm NGOÀI IndexedDB nên
     không đi vào file sao lưu và không bị khôi phục sang máy khác.

   THÊM NHÀ CUNG CẤP MỚI: thêm một đối tượng vào PROVIDERS ở dưới (xem mẫu openrouter/gemini).
     id, name, status:'ready'|'unavailable', summary, docs, appProvider (khoá trong providers.js),
     begin(ctx)   -> bắt đầu kết nối. Trả {token,expiresAt?,account} hoặc chuyển trang (redirect).
     finish(code,verifier) -> (chỉ luồng redirect) đổi code lấy token.
     models(conn) -> danh sách model ID.
     toKey(conn)  -> đối tượng giống "API Key" mà callAI() đã hiểu: {provider,key} hoặc {provider,bearer}.
     revoke(conn) -> thu hồi nếu nhà cung cấp cho phép.
   ===================================================================== */
(function(g){
'use strict';
const LS_KEY='hdk.ai.accounts.v1',SS_KEY='hdk.ai.pending.v1';
/* Chủ trang có thể điền sẵn Client ID Google tại đây; người dùng cũng có thể tự nhập trong giao diện. */
const AUTH_DEFAULTS={gemini:{clientId:''}};
const GIS_URL='https://accounts.google.com/gsi/client';
const SCOPE_BASE=['openid','email','profile','https://www.googleapis.com/auth/generative-language.retriever'];
const SCOPE_EXT='https://www.googleapis.com/auth/cloud-platform';
const OR='https://openrouter.ai/api/v1',GEM='https://generativelanguage.googleapis.com/v1beta';

/* ---------- tiện ích ---------- */
const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const rand=n=>b64u(g.crypto.getRandomValues(new Uint8Array(n)));
const pkce=async()=>{const v=rand(32);return{v,c:b64u(await g.crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))}};
const fail=(m,x)=>Object.assign(new Error(m),x||{});
async function jget(url,token){const r=await g.fetch(url,{headers:token?{Authorization:'Bearer '+token}:{}});if(!r.ok)throw fail(`HTTP ${r.status}`,{status:r.status});return r.json()}

/* ---------- lưu trữ (localStorage, theo từng trình duyệt) ---------- */
const blank=()=>({mode:'key',active:null,conns:{},cfg:{}});
function read(){try{const s=JSON.parse(g.localStorage.getItem(LS_KEY)||'null');if(s&&typeof s==='object')return{mode:s.mode==='account'?'account':'key',active:s.active||null,conns:s.conns||{},cfg:s.cfg||{}}}catch{}return blank()}
function write(s){try{g.localStorage.setItem(LS_KEY,JSON.stringify(s));return true}catch{return false}}
function mutate(fn){const s=read();fn(s);if(!write(s))throw fail('Trình duyệt không cho lưu dữ liệu (đang chặn lưu trữ hoặc ở chế độ riêng tư). Không thể ghi nhớ kết nối.');return s}

/* ---------- Google Identity Services (chỉ nạp khi người dùng bấm kết nối Gemini) ---------- */
let gisP=null;
const loadGIS=()=>g.google?.accounts?.oauth2?Promise.resolve():gisP||(gisP=new Promise((ok,no)=>{const s=g.document.createElement('script');s.src=GIS_URL;s.async=true;
 s.onload=()=>g.google?.accounts?.oauth2?ok():no(fail('Không nạp được Google Identity Services'));s.onerror=()=>{gisP=null;no(fail('Không tải được thư viện đăng nhập của Google (bị chặn mạng/tiện ích chặn quảng cáo?)'))};g.document.head.append(s)}));
function gToken(clientId,scope,prompt,hint){return new Promise((ok,no)=>{let done=false;const end=(f,v)=>{if(!done){done=true;f(v)}};
 const tc=g.google.accounts.oauth2.initTokenClient({client_id:clientId,scope,...(hint?{hint}:{}),callback:r=>r.error?end(no,fail('Google từ chối: '+(r.error_description||r.error))):end(ok,r),
  error_callback:e=>end(no,fail(e?.type==='popup_closed'?'Bạn đã đóng cửa sổ đăng nhập':e?.type==='popup_failed_to_open'?'Trình duyệt chặn cửa sổ đăng nhập – hãy cho phép popup rồi thử lại':'Đăng nhập Google thất bại'+(e?.message?': '+e.message:'')))});
 tc.requestAccessToken({prompt});setTimeout(()=>end(no,fail('Hết thời gian chờ đăng nhập Google')),prompt===''?20000:180000)})}

/* ---------- các nhà cung cấp ---------- */
const PROVIDERS={
 /* 1. OpenRouter – OAuth PKCE công khai, không cần đăng ký client, không cần backend. */
 openrouter:{id:'openrouter',name:'OpenRouter (một tài khoản, nhiều model)',status:'ready',flow:'redirect',appProvider:'openrouter',
  summary:'Đăng nhập OAuth PKCE chính thức của OpenRouter. Ứng dụng nhận một API key do chính bạn kiểm soát, chi phí tính vào số dư OpenRouter của bạn. Có thể gọi model của OpenAI, Anthropic, Google… qua OpenRouter; đây KHÔNG phải gói thuê bao ChatGPT/Claude/Gemini của bạn.',
  docs:'https://openrouter.ai/docs/guides/overview/auth/oauth',
  revokeHelp:'OpenRouter không có API thu hồi key từ trình duyệt. Để vô hiệu hoá hẳn, hãy xoá key tại openrouter.ai/settings/keys.',
  async begin(){if(!/^https?:$/.test(g.location.protocol))throw fail('Cần mở ứng dụng qua http(s) (ví dụ GitHub Pages), không dùng được khi mở trực tiếp file.');
   const{v,c}=await pkce();g.sessionStorage.setItem(SS_KEY,JSON.stringify({p:'openrouter',v,t:Date.now()}));
   g.location.assign('https://openrouter.ai/auth?'+new URLSearchParams({callback_url:g.location.origin+g.location.pathname,code_challenge:c,code_challenge_method:'S256'}));return null},
  async finish(code,v){let r;try{r=await g.fetch(OR+'/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:v,code_challenge_method:'S256'})})}catch(e){throw fail('Không kết nối được OpenRouter: '+e.message)}
   if(!r.ok)throw fail(r.status===403?'OpenRouter từ chối mã đăng nhập (mã hết hạn sau 10 phút hoặc đã dùng). Hãy kết nối lại.':`OpenRouter trả lỗi HTTP ${r.status}`);
   const j=await r.json();if(!j.key)throw fail('OpenRouter không trả về key');return{token:j.key,account:{id:j.user_id||'',label:''}}},
  async info(c){const d=(await jget(OR+'/key',c.token)).data||{};return{label:d.label||'',usage:d.usage,limit:d.limit,remaining:d.limit_remaining}},
  async models(c){const j=await jget(OR+'/models',c?.token);return(j.data||[]).map(m=>m.id).filter(Boolean)},
  toKey:c=>({provider:'openrouter',key:c.token})},

 /* 2. Google Gemini – OAuth 2.0 của Google (Google Identity Services, chạy trong trình duyệt). */
 gemini:{id:'gemini',name:'Google Gemini (đăng nhập tài khoản Google)',status:'ready',flow:'popup',appProvider:'gemini',needs:['clientId'],
  summary:'Đăng nhập Google qua OAuth 2.0 chính thức của Gemini API. Cần một "OAuth Client ID" (loại Web application) tạo trong Google Cloud Console, thêm địa chỉ trang này vào "Authorized JavaScript origins" và bật Generative Language API. Hạn mức/chi phí tính theo Google Cloud project của Client ID đó, không đảm bảo là gói Gemini/Google AI cá nhân. Ở chế độ "Testing", chỉ tài khoản được thêm vào Test users mới đăng nhập được.',
  docs:'https://ai.google.dev/gemini-api/docs/oauth',
  revokeHelp:'',
  async begin(ctx){const clientId=(ctx.cfg.clientId||AUTH_DEFAULTS.gemini.clientId||'').trim();if(!clientId)throw fail('Chưa nhập OAuth Client ID của Google.');
   await loadGIS();const scope=[...SCOPE_BASE,...(ctx.cfg.ext?[SCOPE_EXT]:[])].join(' ');
   const r=await gToken(clientId,scope,'select_account');if(!String(r.scope||'').includes('generative-language'))throw fail('Bạn chưa cấp quyền Generative Language cho ứng dụng. Hãy kết nối lại và tích chọn đủ quyền.');
   let acc={};try{const u=await jget('https://www.googleapis.com/oauth2/v3/userinfo',r.access_token);acc={id:u.sub||'',label:u.email||u.name||''}}catch{}
   return{token:r.access_token,expiresAt:Date.now()+(+r.expires_in||3600)*1000-30000,account:acc,clientId,ext:!!ctx.cfg.ext}},
  /* Token Google chỉ sống ~1 giờ và luồng trình duyệt không có refresh token: thử xin lại âm thầm, không được thì yêu cầu kết nối lại. */
  async refresh(c){if(!c.clientId)throw fail('Thiếu Client ID');await loadGIS();const scope=[...SCOPE_BASE,...(c.ext?[SCOPE_EXT]:[])].join(' ');
   const r=await gToken(c.clientId,scope,'',c.account?.label);return{token:r.access_token,expiresAt:Date.now()+(+r.expires_in||3600)*1000-30000}},
  async info(c){const u=await jget('https://www.googleapis.com/oauth2/v3/userinfo',c.token);return{label:u.email||u.name||''}},
  async models(c){const j=await jget(GEM+'/models?pageSize=1000',c.token);return(j.models||[]).filter(m=>!m.supportedGenerationMethods||m.supportedGenerationMethods.includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,'')).filter(Boolean)},
  async revoke(c){try{if(g.google?.accounts?.oauth2)g.google.accounts.oauth2.revoke(c.token,()=>{});else await g.fetch('https://oauth2.googleapis.com/revoke?token='+encodeURIComponent(c.token),{method:'POST'})}catch{}},
  toKey:c=>({provider:'gemini',key:'',bearer:c.token})},

 /* 3. Chưa có luồng chính thức dùng được trên trang tĩnh – KHÔNG giả lập. */
 openai:{id:'openai',name:'OpenAI / ChatGPT',status:'unavailable',
  why:'OpenAI đã có "Sign in with ChatGPT" (OpenID Connect + PKCE) nhưng với ứng dụng web do bên thứ ba lưu trữ thì đang ở dạng thử nghiệm giới hạn: phải xin OpenAI cấp client ID và đăng ký trước redirect URI. Luồng dành cho phần mềm mã nguồn mở dùng địa chỉ loopback 127.0.0.1 (ứng dụng chạy trên máy), và tài liệu khuyến nghị không đưa mã/verifier/token xuống JavaScript của trình duyệt. Vì vậy chưa dùng được trên GitHub Pages. Hãy dùng API Key, hoặc đăng nhập qua OpenRouter.',
  docs:'https://developers.openai.com/siwc/website'},
 anthropic:{id:'anthropic',name:'Anthropic / Claude',status:'unavailable',
  why:'Điều khoản của Anthropic cấm dùng token OAuth của tài khoản Claude Free/Pro/Max trong sản phẩm hoặc công cụ khác ngoài Claude.ai và Claude Code. Không có luồng đăng nhập chính thức cho ứng dụng bên thứ ba. Hãy dùng API Key của Anthropic Console, hoặc đăng nhập qua OpenRouter.',
  docs:'https://code.claude.com/docs/en/legal-and-compliance'},
 others:{id:'others',name:'DeepSeek, Groq, xAI, Mistral, Qwen, Cohere…',status:'unavailable',
  why:'Chưa xác nhận được luồng OAuth chính thức dành cho ứng dụng bên thứ ba chạy trên trình duyệt, nên chưa bật. Các nhà cung cấp này vẫn dùng được ở chế độ API Key như hiện tại. Khi có OAuth chính thức, chỉ cần thêm một Provider mới vào auth.js.'}
};

/* ---------- API công khai ---------- */
const Hub={
 AUTH_DEFAULTS,PROVIDERS,
 list:()=>Object.values(PROVIDERS),
 state:read,
 getMode:()=>read().mode,
 setMode:m=>mutate(s=>{s.mode=m==='account'?'account':'key'}),
 cfg:id=>({...(AUTH_DEFAULTS[id]||{}),...(read().cfg[id]||{})}),
 setCfg:(id,v)=>mutate(s=>{s.cfg[id]={...(s.cfg[id]||{}),...v}}),
 conn:id=>read().conns[id]||null,
 /* Kết nối đang dùng (nếu mode=account). Trả null nếu chưa có. */
 activeConn(){const s=read(),c=s.active&&s.conns[s.active];return c?{...c,provider:s.active}:null},
 setActive:id=>mutate(s=>{if(!s.conns[id])throw fail('Chưa kết nối nhà cung cấp này');s.active=id}),
 setModel:(id,model)=>mutate(s=>{if(s.conns[id])s.conns[id].model=String(model||'').trim()}),
 /* Bắt đầu kết nối. Luồng redirect sẽ chuyển trang nên không trả về. Luồng popup trả về kết nối đã lưu. */
 async connect(id,opt={}){const P=PROVIDERS[id];if(!P||P.status!=='ready')throw fail('Nhà cung cấp này chưa được hỗ trợ đăng nhập chính thức');
  if(opt.cfg)Hub.setCfg(id,opt.cfg);const r=await P.begin({cfg:Hub.cfg(id)});if(!r)return null;
  const old=read().conns[id];mutate(s=>{s.conns[id]={...r,model:old?.model||'',connectedAt:Date.now(),stale:false};if(!s.active)s.active=id});return Hub.conn(id)},
 /* Gọi khi tải trang: nếu vừa quay về từ OpenRouter (?code=…) thì đổi code lấy key. Trả {provider} hoặc null; ném lỗi nếu thất bại. */
 async handleRedirect(){let q;try{q=new URLSearchParams(g.location.search)}catch{return null}const code=q.get('code');if(!code)return null;
  let p;try{p=JSON.parse(g.sessionStorage.getItem(SS_KEY)||'null')}catch{}if(!p||!PROVIDERS[p.p])return null;
  g.sessionStorage.removeItem(SS_KEY);if(Date.now()-p.t>15*60*1000)throw fail('Phiên đăng nhập đã quá 15 phút, hãy kết nối lại.');
  const r=await PROVIDERS[p.p].finish(code,p.v),old=read().conns[p.p];
  mutate(s=>{s.conns[p.p]={...r,model:old?.model||'',connectedAt:Date.now(),stale:false};s.active=p.p});return{provider:p.p}},
 async disconnect(id){const c=read().conns[id];if(!c)return;try{await PROVIDERS[id].revoke?.(c)}catch{}mutate(s=>{delete s.conns[id];if(s.active===id)s.active=Object.keys(s.conns)[0]||null})},
 markStale:id=>{try{mutate(s=>{if(s.conns[id])s.conns[id].stale=true})}catch{}},
 info:id=>{const c=read().conns[id];if(!c)throw fail('Chưa kết nối');return PROVIDERS[id].info?PROVIDERS[id].info(c):Promise.resolve({})},
 models:id=>{const c=read().conns[id];if(!c)throw fail('Chưa kết nối');return PROVIDERS[id].models(c)},
 /* Đối tượng giống "API Key" để dùng với ask()/callAI() hiện có (không chứa token). */
 asKey(c){const P=PROVIDERS[c.provider];return{id:'acct:'+c.provider,accountId:c.provider,auth:'account',name:(c.account?.label||P.name.split(' (')[0]),provider:P.appProvider,model:c.model||''}},
 /* Chuẩn bị thông tin gọi API ngay trước mỗi request; tự xin lại token Google nếu sắp hết hạn. */
 async resolve(k){const id=k.accountId,P=PROVIDERS[id];let c=read().conns[id];if(!P||!c)throw fail('Chưa kết nối tài khoản AI. Vào Cấu hình AI → Đăng nhập AI cá nhân.',{fatal:true});
  if(!k.model)throw fail('Chưa chọn Model ID cho tài khoản AI. Vào Cấu hình AI → Đăng nhập AI cá nhân, nhập hoặc tải danh sách model.',{fatal:true});
  if(c.stale)throw fail('Kết nối đã hết hiệu lực. Vào Cấu hình AI → Đăng nhập AI cá nhân → Kết nối lại.',{fatal:true});
  if(c.expiresAt&&c.expiresAt-Date.now()<60000){if(!P.refresh)throw fail('Phiên đăng nhập đã hết hạn. Hãy kết nối lại.',{fatal:true});
   try{const r=await P.refresh(c);mutate(s=>{Object.assign(s.conns[id],r)});c={...c,...r}}catch(e){Hub.markStale(id);throw fail('Phiên đăng nhập '+P.name.split(' (')[0]+' đã hết hạn và không thể tự gia hạn ('+e.message+'). Vào Cấu hình AI → Đăng nhập AI cá nhân → Kết nối lại.',{fatal:true})}}
  return{...k,...P.toKey(c)}}
};
g.AuthHub=Hub;if(typeof module!=='undefined')module.exports=Hub;
})(typeof window!=='undefined'?window:globalThis);
