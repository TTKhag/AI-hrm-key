(function(g){
const own=n=>{while(n&&n.nodeName!=='w:p')n=n.parentNode;return n};
const inTc=n=>{while(n&&n.nodeName!=='w:tc')n=n.parentNode;return!!n};
const nz=s=>s.replace(/[\s\u00a0]+/g,' ').replace(/[.…_\-–]{2,}/g,'…').trim();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
const rx=s=>s.replace(/[\t\n\u00a0]/g,' ').split(/([.…_\-–]{2,}|\s+)/).filter(x=>x!=='').map(p=>/^[.…_\-–]{2,}$/.test(p)?'[.…_\\-–]+':/^\s+$/.test(p)?'\\s*':esc(p)).join('');
/* Tiền xử lý: mỗi đoạn (thân, ô bảng, header, footer) thành một đơn vị có id, vị trí, ứng viên. Không loại bỏ đoạn nào có chữ. */
function segs(parts,ext){const out=[];parts.forEach(p=>{const d=ext==='docx',pn=/header/.test(p.name)?'Đầu trang':/footer/.test(p.name)?'Chân trang':'Thân';
 [...p.doc.getElementsByTagName(d?'w:p':'si')].forEach(u=>{
  const items=d?[...u.getElementsByTagName('*')].filter(n=>['w:t','w:tab','w:br','w:cr'].includes(n.nodeName)&&own(n)===u&&n.parentNode.nodeName!=='w:tabs'):[...u.getElementsByTagName('t')].filter(n=>n.parentNode.nodeName!=='rPh');
  const ed=n=>n.nodeName==='w:t'||n.nodeName==='t',ch=items.map(n=>ed(n)?n.textContent:n.nodeName==='w:tab'?'\t':'\n'),raw=ch.join(''),tc=d&&inTc(u),empty=!raw.trim();
  if(empty&&!tc)return;const text=raw.replace(/[\t\n\r\u00a0]/g,' '),cand=[];
  if(empty)cand.push('ô trống');else{if(/[.…_]{3,}/.test(text))cand.push('dấu chấm/gạch');if(/ngày\s*[.…_\s]*tháng|tháng\s*[.…_\s]*năm/i.test(text))cand.push('ngày tháng');if(raw.includes('\t'))cand.push('có Tab');if(/\([^)]{3,}\)/.test(text))cand.push('gợi ý trong ngoặc');if(/:\s*\S/.test(text)||/:\s*$/.test(text))cand.push('sau dấu hai chấm')}
  out.push({id:out.length,u,doc:p.doc,items,ed,lens:ch.map(x=>x.length),text,where:pn+(tc?' · bảng':''),cand,empty})})});return out}
const lines=(S,ids)=>(ids?S.filter(s=>ids.has(s.id)):S).map(s=>`P${s.id} | ${s.where} | ${s.cand.length?'ứng viên: '+s.cand.join(', '):'-'} | ${s.empty?'(trống)':s.text.trim()}`);
function find(s,f,used,loose){const generic=!/[\p{L}\d]/u.test(f.original),L=[[f.before,f.after,0],[f.before,'',0]];if(!loose){L.push(['',f.after,0]);if(!generic)L.push(['','',1])}
 for(const[b,a,uq]of L){if(generic&&!b&&!a)continue;if(loose&&!b)continue;if(uq&&(s.text.match(new RegExp(rx(f.original),'g'))||[]).length!==1)continue;
  const re=new RegExp('('+rx(b||'')+')('+rx(f.original)+')'+(a?'(?='+rx(a)+')':''),'g');let m;
  while((m=re.exec(s.text))){const st=m.index+m[1].length,en=st+m[2].length;if(en>st&&!used.some(r=>r.s===s&&st<r.en&&en>r.st))return{st,en};if(!m[0].length)re.lastIndex++}}
 return null}
/* Giai đoạn 1: kiểm tra và xác định vị trí chính xác (đoạn + offset). Ưu tiên mã đoạn AI trả về; không chắc chắn thì không thay, chỉ ghi chú. */
function plan(S,fields){const used=[];fields.forEach(f=>{f.hits=0;f.blocked='';f.note=''});
 for(const f of fields){if(f.on===false||!f.key||(f.original||'').includes('{{'))continue;
  if(!f.original){const s=S[f.ref];if(s&&s.empty&&!used.some(r=>r.s===s)){used.push({s,st:0,en:0,f,ins:1});f.hits=1}else f.note='Không xác định được ô trống';continue}
  let hit=null;const s0=S[f.ref];if(f.slot&&s0&&s0.text.slice(f.st,f.en)===f.original&&!used.some(r=>r.s===s0&&f.st<r.en&&f.en>r.st))hit={st:f.st,en:f.en,s:s0};if(!hit&&s0){const r=find(s0,f,used);if(r)hit={...r,s:s0}}
  if(!hit){const c=nz(f.context||''),cand=c?S.filter(s=>{const t=nz(s.text);return t&&(t.includes(c)||(t.length>=8&&c.includes(t)))}):[];
   for(const s of[...cand,...S.filter(s=>!cand.includes(s))]){const r=find(s,f,used,true);if(r){hit={...r,s};f.note='Tìm theo nhãn/ngữ cảnh, cần kiểm tra';break}}}
  if(!hit){f.note='Không xác định chính xác vị trí – cần kiểm tra';continue}
  if(/^\s*(\d+[.)]\s*)?Căn cứ/i.test(hit.s.text)&&/\d/.test(f.original)){f.blocked='văn bản pháp luật cố định';f.note='';continue}
  used.push({s:hit.s,st:hit.st,en:hit.en,f});f.hits++}
 return used}
function splice(sg,s,e,rep){let pos=0,done=false;sg.items.forEach((n,i)=>{const L=sg.lens[i],a=pos,b=pos+L;pos=b;if(!L||!sg.ed(n)||b<=s||a>=e)return;const x=n.textContent;
 n.textContent=x.slice(0,Math.max(s,a)-a)+(done?'':rep)+x.slice(Math.min(e,b)-a);done=true;n.setAttribute('xml:space','preserve')})}
/* Giai đoạn 2: thay từ phải sang trái, chỉ sửa node chữ nên giữ nguyên định dạng run; ô trống thì chèn run mới. */
function execute(used){[...used].sort((x,y)=>y.st-x.st).forEach(u=>{const k='{{'+u.f.key+'}}';
 if(u.ins){const ns=u.s.u.namespaceURI,r=u.s.doc.createElementNS(ns,'w:r'),t=u.s.doc.createElementNS(ns,'w:t');t.textContent=k;r.appendChild(t);u.s.u.appendChild(r)}else splice(u.s,u.st,u.en,k)})}
const verify=S=>S.filter(s=>/[.…_\-–]{4,}/.test(s.text)).map(s=>s.text.trim().slice(0,140));

/* Chế độ 1: vị trí dấu ba chấm. Cụm "ngày ... tháng ... năm ..." (và biến thể) gom thành MỘT vị trí. */
const DATE=/ngày\s*(?:[.…]+\s*)?tháng\s*(?:[.…]+\s*)?năm(?:\s*[.…]+)?/gi,DOT=/\.{3,}|…[.…]*/g;
function slots(S){const out=[];S.forEach(s=>{if(s.empty)return;const rg=[];let m;
 for(const re of[DATE,DOT]){re.lastIndex=0;while((m=re.exec(s.text))){const st=m.index,en=st+m[0].length;if(!rg.some(r=>st<r.en&&en>r.st))rg.push({st,en,kind:re===DATE?'date':'dots'})}}
 rg.sort((a,b)=>a.st-b.st).forEach((r,i)=>out.push({sid:s.id+'.'+(i+1),ref:s.id,...r,text:s.text.slice(r.st,r.en),before:s.text.slice(Math.max(0,r.st-30),r.st),after:s.text.slice(r.en,r.en+20),ctx:s.text.trim()}))});return out}
function slotLines(S,sl){const ids=new Set();sl.forEach(x=>[x.ref-1,x.ref,x.ref+1].forEach(i=>S[i]&&ids.add(i)));
 return S.filter(s=>ids.has(s.id)).map(s=>{let t=s.text;sl.filter(x=>x.ref===s.id).sort((a,b)=>b.st-a.st).forEach(x=>{t=t.slice(0,x.st)+'⟦'+x.sid+'⟧'+t.slice(x.en)});return`P${s.id} | ${s.where} | ${t.trim()}`})}
/* Khôi phục kiểu "Gộp": chỉ thêm mục chưa có, không ghi đè dữ liệu hiện tại. */
function merge(cur,bk){const S=(a,id)=>a.find(x=>x.id===id)?.value,has=(a,id)=>a.some(x=>x.id===id),ids=a=>new Set(a.map(x=>x.id)),cf=ids(cur.files),cr=ids(cur.results);
 const out={files:bk.files.filter(x=>!cf.has(x.id)),results:bk.results.filter(x=>!cr.has(x.id)),settings:[],added:{keys:0,history:0}};
 const keys=[...(S(cur.settings,'keys')||[])],map={},sig=k=>k.provider+'|'+k.key;
 for(const k of S(bk.settings,'keys')||[]){const e=keys.find(x=>sig(x)===sig(k));if(e){map[k.id]=e.id;continue}const id=keys.some(x=>x.id===k.id)?g.crypto.randomUUID():k.id;map[k.id]=id;keys.push({...k,id});out.added.keys++}
 if(out.added.keys)out.settings.push({id:'keys',value:keys});
 const ba=S(bk.settings,'activeKey');if(!S(cur.settings,'activeKey')&&ba&&map[ba])out.settings.push({id:'activeKey',value:map[ba]});
 for(const id of['prompt','promptV','promptDots','mode'])if(!has(cur.settings,id)&&has(bk.settings,id))out.settings.push({id,value:S(bk.settings,id)});
 const H=S(cur.settings,'history')||[],hs=new Set(H.map(h=>h.t+'|'+h.file+'|'+h.action)),add=(S(bk.settings,'history')||[]).filter(h=>!hs.has(h.t+'|'+h.file+'|'+h.action));
 if(add.length){out.added.history=add.length;out.settings.push({id:'history',value:[...H,...add].sort((a,b)=>b.t-a.t).slice(0,200)})}
 return out}

/* Đọc JSON từ phản hồi AI: bỏ rào Markdown, bỏ chữ thừa quanh JSON, và cứu các phần tử đã hoàn chỉnh khi JSON bị cắt giữa chừng. */
function jparse(t){t=String(t||'').replace(/^```(?:json)?|```$/gm,'').trim();if(!t)throw new SyntaxError('Phản hồi rỗng');
 try{return JSON.parse(t)}catch(e){const i=t.indexOf('[');if(i<0)throw e;const out=[];let d=0,s=-1,q=false,x=false;
  for(let p=i+1;p<t.length;p++){const ch=t[p];if(q){if(x)x=false;else if(ch==='\\')x=true;else if(ch==='"')q=false;continue}
   if(ch==='"')q=true;else if(ch==='{'){if(!d)s=p;d++}else if(ch==='}'&&d&&!--d){try{out.push(JSON.parse(t.slice(s,p+1)))}catch{}}}
  if(!out.length)throw e;return out}}

/* Tô nền vàng (w:highlight) chỉ cho phần chữ {{Key}}: tách run thành các run con, giữ nguyên rPr và nội dung. pred(key) quyết định Key nào được tô. */
const AFTER=['w:u','w:effect','w:bdr','w:shd','w:fitText','w:vertAlign','w:rtl','w:cs','w:em','w:lang','w:eastAsianLayout','w:specVanish','w:oMath'];
function mark(run,doc){const ns=run.namespaceURI;let pr=[...run.childNodes].find(c=>c.nodeName==='w:rPr');if(!pr){pr=doc.createElementNS(ns,'w:rPr');run.insertBefore(pr,run.firstChild)}
 let h=[...pr.childNodes].find(c=>c.nodeName==='w:highlight');if(!h){h=doc.createElementNS(ns,'w:highlight');const nx=[...pr.childNodes].find(c=>AFTER.includes(c.nodeName));nx?pr.insertBefore(h,nx):pr.appendChild(h)}h.setAttributeNS(ns,'w:val','yellow')}
function highlight(parts,pred){let n=0;parts.forEach(p=>[...p.doc.getElementsByTagName('w:r')].forEach(r=>{
 const ts=[...r.childNodes].filter(c=>c.nodeName!=='w:rPr'),w=ts.find(c=>c.nodeName==='w:t');if(!w||!/\{\{\w+\}\}/.test(w.textContent))return;
 const parts2=w.textContent.split(/(\{\{\w+\}\})/).filter(x=>x!=='');
 if(ts.length===1&&parts2.length>1){parts2.forEach(sg=>{const cl=r.cloneNode(true),cw=[...cl.childNodes].find(y=>y.nodeName==='w:t');cw.textContent=sg;cw.setAttribute('xml:space','preserve');
   const m=sg.match(/^\{\{(\w+)\}\}$/);if(m&&pred(m[1])){mark(cl,p.doc);n++}r.parentNode.insertBefore(cl,r)});r.parentNode.removeChild(r)}
 else{const ks=[...w.textContent.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]);if(ks.some(pred)){mark(r,p.doc);n++}}}));return n}
const C={highlight,jparse,segs,lines,find,plan,execute,verify,nz,slots,slotLines,merge};g.Core=C;if(typeof module!=='undefined')module.exports=C})(typeof window!=='undefined'?window:globalThis);
