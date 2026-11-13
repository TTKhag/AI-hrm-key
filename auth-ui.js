/* Giao diện "Đăng nhập AI cá nhân". Dùng các hàm dùng chung của app.js ($, esc, toast, callAI, NOCHAT) tại thời điểm chạy. */
(function(g){
'use strict';
const H=g.AuthHub,cache={};
const MODE_TXT={key:'Dùng API Key đã lưu (cơ chế hiện có).',account:'Dùng tài khoản AI cá nhân đã kết nối.'};

function modeBar(){const m=H.getMode();
 return`<div class=bar><div class=row><b>Chế độ AI đang dùng:</b><label class=mdi><input type=radio name=aim value=key ${m==='key'?'checked':''}> API Key</label><label class=mdi><input type=radio name=aim value=account ${m==='account'?'checked':''}> Đăng nhập AI cá nhân</label><span class=muted id=aimh>${hint()}</span></div></div>`}
function hint(){const m=H.getMode();if(m==='key')return MODE_TXT.key;const c=H.activeConn();return c?`Đang dùng: ${esc(H.asKey(c).name)} · ${esc(H.PROVIDERS[c.provider].name.split(' (')[0])}.`:'Chưa kết nối tài khoản nào – mở tab "Đăng nhập AI cá nhân".'}
function bindMode(){document.querySelectorAll('input[name=aim]').forEach(x=>x.onchange=()=>{try{H.setMode(x.value);$('#aimh').innerHTML=hint();toast('Đã chuyển sang chế độ '+(x.value==='key'?'API Key.':'Đăng nhập AI cá nhân.'))}catch(e){toast(e.message,1)}})}

const when=t=>t?new Date(t).toLocaleString('vi-VN'):'';
function card(P,s){
 if(P.status!=='ready')return`<div class=kr><b>${esc(P.name)}</b> <span class=muted>· Chưa hỗ trợ đăng nhập</span><div class=muted style="margin-top:4px">${esc(P.why)}</div>${P.docs?`<div><a href="${esc(P.docs)}" target=_blank rel="noopener noreferrer">Tài liệu chính thức</a></div>`:''}</div>`;
 const c=s.conns[P.id],act=s.mode==='account'&&s.active===P.id;
 const head=`<span class="bd${act?' on':''}">● Đang dùng</span><b class=kn>${esc(P.name)}</b>`;
 if(!c){const cfg=H.cfg(P.id);
  const f=P.id==='gemini'?`<div class=row><input id=cid-${P.id} placeholder="OAuth Client ID (xxxx.apps.googleusercontent.com)" value="${esc(cfg.clientId||'')}" style="flex:1"></div><div class=row><label class=mdi><input type=checkbox id=ext-${P.id} ${cfg.ext?'checked':''}> Xin thêm quyền cloud-platform (chỉ bật nếu bị lỗi thiếu quyền khi gọi AI)</label></div><div class=muted>Authorized JavaScript origins cần có: <code>${esc(g.location.origin)}</code></div>`:'';
  return`<div class=kr>${head}<div class=muted>Chưa kết nối</div><div class=muted style="margin:4px 0">${esc(P.summary)}</div>${f}<div class=row><button class=pri data-a=connect data-p=${P.id}>Kết nối</button><a href="${esc(P.docs)}" target=_blank rel="noopener noreferrer">Tài liệu chính thức</a></div></div>`}
 const exp=c.expiresAt&&c.expiresAt<Date.now(),bad=c.stale||(exp&&!P.refresh),st=bad?'<span class=err>Cần kết nối lại</span>':exp?'<span class=muted>Token đã hết hạn, sẽ thử gia hạn khi dùng</span>':'<span class=ok>✓ Đã kết nối</span>';
 return`<div class=kr>${head}<div>${st} · <span class=muted>${esc(c.account?.label||c.account?.id||'(không có thông tin tài khoản)')}</span></div><div class=muted>Kết nối lúc ${esc(when(c.connectedAt))}${c.expiresAt?` · token hết hạn ${esc(when(c.expiresAt))}`:''}</div>
  <div class=row><input id=m-${P.id} list=ml-${P.id} value="${esc(c.model||'')}" placeholder="Model ID" style="flex:1"><datalist id=ml-${P.id}>${(cache[P.id]||[]).map(m=>`<option value="${esc(m)}">`).join('')}</datalist><button data-a=models data-p=${P.id}>Tải model</button></div>
  <div class=act><button data-a=use data-p=${P.id} ${act?'disabled':''}>Dùng</button><button data-a=test data-p=${P.id}>Kiểm tra</button><button data-a=reconnect data-p=${P.id}>Kết nối lại</button><button class=del data-a=out data-p=${P.id}>Đăng xuất</button></div></div>`}

async function render(){const s=H.state();
 $('#tb').innerHTML=`<div class=g2><section class=pane><div class=hd>Đăng nhập AI cá nhân</div><div class=sc>
  <div class=warn><b>Lưu ý:</b> mỗi trình duyệt tự quản lý kết nối riêng. Token lưu trong bộ nhớ của trình duyệt này, <b>không</b> nằm trong file sao lưu; không dùng trên máy công cộng. Ứng dụng chỉ dùng đăng nhập OAuth/API chính thức của nhà cung cấp, không dùng cookie hay token phiên.</div>
  <p class=muted>Chế độ <b>API Key</b> vẫn hoạt động như cũ ở tab "API Key". Chọn chế độ đang dùng ở thanh phía trên. Có thể kết nối nhiều nhà cung cấp và bấm <b>Dùng</b> để chuyển qua lại.</p>
  <p class=muted>Với ChatGPT và Claude, hiện chưa có luồng đăng nhập chính thức dùng được trên trang tĩnh (xem lý do ở cột bên phải). Bạn vẫn dùng được các model đó qua OpenRouter hoặc bằng API Key.</p></div></section>
  <section class=pane><div class=hd>Nhà cung cấp</div><div class=sc id=acl>${H.list().map(P=>card(P,s)).join('')}</div></section></div>`;
 const tb=$('#tb');
 tb.onchange=e=>{const t=e.target;if(t.id&&t.id.startsWith('m-')){try{H.setModel(t.id.slice(2),t.value);toast('Đã lưu model.')}catch(er){toast(er.message,1)}}};
 tb.onclick=async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const id=b.dataset.p,a=b.dataset.a;
  try{
   if(a==='connect'||a==='reconnect'){const cid=$('#cid-'+id),ext=$('#ext-'+id),cfg=id==='gemini'&&cid?{clientId:cid.value.trim(),ext:!!ext?.checked}:id==='gemini'?{}:undefined;
    if(id==='gemini'&&cfg&&cfg.clientId===''&&!H.cfg(id).clientId)return toast('Hãy nhập OAuth Client ID của Google trước khi kết nối.',1);b.disabled=true;toast('Đang mở trang đăng nhập…');const c=await H.connect(id,{cfg});if(c){H.setActive(id);toast('Đã kết nối '+H.PROVIDERS[id].name.split(' (')[0]+'. Bấm "Dùng" để dùng tài khoản này.');render()}}
   else if(a==='use'){H.setActive(id);H.setMode('account');toast('Đang dùng tài khoản '+H.PROVIDERS[id].name.split(' (')[0]+'.');aiPage()}
   else if(a==='out'){if(confirm('Đăng xuất và xoá kết nối này khỏi trình duyệt?')){await H.disconnect(id);toast('Đã đăng xuất.'+(H.PROVIDERS[id].revokeHelp?' '+H.PROVIDERS[id].revokeHelp:''));aiPage()}}
   else if(a==='models'){toast('Đang tải danh sách model…');const ms=(await H.models(id)).filter(m=>!NOCHAT.test(m)).sort();cache[id]=ms;const dl=$('#ml-'+id);dl.innerHTML=ms.map(m=>`<option value="${esc(m)}">`).join('');toast(`Đã tải ${ms.length} model. Nhập hoặc chọn model trong ô rồi thử bấm Kiểm tra.`)}
   else if(a==='test'){const c=H.conn(id),mi=$('#m-'+id);if(mi&&mi.value.trim()!==c.model)H.setModel(id,mi.value);const c2=H.conn(id);if(!c2.model)return toast('Chọn hoặc nhập Model ID trước khi kiểm tra.',1);
    toast('Đang kiểm tra…');const r=await callAI(H.asKey({...c2,provider:id}),'Trả lời đúng một từ: OK','Kiểm tra kết nối',{tries:1,json:false});let extra='';try{const i=await H.info(id);if(i.usage!=null)extra=` Đã dùng ${(+i.usage).toFixed(4)} USD${i.limit!=null?' / hạn mức '+i.limit+' USD':''}.`}catch{}
    toast('Kết nối thành công. Phản hồi: '+r.text.slice(0,40)+extra)}
  }catch(er){b.disabled=false;toast(er.message,1)}}}

/* Gọi một lần khi khởi động: hoàn tất đăng nhập nếu vừa quay về từ trang đăng nhập của nhà cung cấp. Trả true nếu vừa kết nối. */
async function boot(){const clean=()=>{try{g.history.replaceState(null,'',g.location.pathname+(g.location.hash||'#ai'))}catch{}};
 try{const r=await H.handleRedirect();if(r){clean();toast('Đã kết nối '+H.PROVIDERS[r.provider].name.split(' (')[0]+'. Chọn model, bấm Kiểm tra rồi bấm Dùng.');return true}return false}
 catch(e){clean();toast('Kết nối thất bại: '+e.message,1);return 'error'}}

g.AuthUI={modeBar,bindMode,render,boot};
})(window);
