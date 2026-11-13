// Chạy: npm i jszip @xmldom/xmldom && node tests/test-core.js  (kiểm thử logic thay Key trên file Word tổng hợp)
const{DOMParser,XMLSerializer}=require('@xmldom/xmldom'),Core=require('../core.js'),assert=require('assert');
const r=(t,b)=>`<w:r>${b?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${t}</w:t></w:r>`,p=(...x)=>`<w:p>${x.join('')}</w:p>`;
const xml=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+p(r('Căn cứ Bộ luật Lao động ngày 20 tháng 11 năm 2019'))+p(r('Sinh ngày: ..',1),r('.......'),r(' Tại: '),r('.........'))+p(r('Ông: .........'),'<w:r><w:tab/></w:r>',r('Quốc tịch: Việt Nam'))+p(r('Từ ngày...... tháng...... năm...... đến ngày...... tháng...... năm......'))+'<w:tbl><w:tr><w:tc>'+p(r('Mức lương: ........'))+'</w:tc></w:tr></w:tbl>'+p(r('Mức lương: ........'))+'</w:body></w:document>';
const d=new DOMParser().parseFromString(xml,'text/xml'),parts=[{name:'x',doc:d}],D='.........',T='...... tháng...... năm......';
const F=(key,before,original,after='',context='')=>({key,before,original,after,context});
const fields=[F('NgayCan','Căn cứ Bộ luật Lao động ngày ','20 tháng 11 năm 2019'),F('NgaySinh','Sinh ngày: ',D,' Tại:','Sinh ngày: ......... Tại: .........'),F('NoiSinh','Tại: ',D),F('HoTen','Ông: ',D,'Quốc tịch'),F('NgayBD','Từ ngày',T,' đến'),F('NgayKT','đến ngày',T),F('Luong','Mức lương: ','........'),F('Luong','Mức lương: ','........')];
Core.execute(Core.plan(Core.segs(parts,'docx'),fields));
const t=Core.segs(parts,'docx').map(s=>s.text);
assert(t[0].includes('20 tháng 11 năm 2019'),'căn cứ pháp lý phải giữ nguyên');assert(fields[0].blocked);
assert.strictEqual(t[1],'Sinh ngày: {{NgaySinh}} Tại: {{NoiSinh}}');
assert(t[2].startsWith('Ông: {{HoTen}}')&&t[2].endsWith('Quốc tịch: Việt Nam'),'Tab + nội dung cố định');
assert(t[3].includes('{{NgayBD}} đến ngày{{NgayKT}}'),'hai ngày khác Key');
assert(t[4].includes('{{Luong}}')&&t[5].includes('{{Luong}}'),'một Key nhiều vị trí (bảng + thân)');
assert(new XMLSerializer().serializeToString(d).includes('<w:b/>'),'giữ định dạng run');assert.deepStrictEqual(Core.verify(Core.segs(parts,'docx')),[]);
console.log('PASS: tất cả kiểm tra đạt');
// --- Thay theo mã đoạn (ref), ô bảng trống, ngữ cảnh trùng lặp ---
{const x=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+p(r('Họ tên: ........'))+p(r('Họ tên: ........'))+'<w:tbl><w:tr><w:tc>'+p(r('Địa chỉ:'))+'</w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>';
 const d2=new DOMParser().parseFromString(x,'text/xml'),pt=[{name:'x',doc:d2}],S=Core.segs(pt,'docx'),em=S.find(s=>s.empty);
 assert(S[0].cand.includes('dấu chấm/gạch')&&em.cand.includes('ô trống'),'đánh dấu ứng viên');
 const ff=[{ref:S[1].id,key:'HoTen',before:'Họ tên: ',original:'........',after:'',context:''},{ref:em.id,key:'DiaChi',original:'',before:'',after:'',context:''}];
 Core.execute(Core.plan(S,ff));const t2=Core.segs(pt,'docx').map(s=>s.text);
 assert(t2[0].includes('........')&&t2[1].includes('{{HoTen}}'),'chỉ thay đúng đoạn theo ref');assert(t2[3]==='{{DiaChi}}','chèn Key vào ô trống');console.log('PASS: ref + ô trống')}
// --- Chế độ 1: dấu ba chấm, gom ngày tháng năm, theo vị trí chính xác ---
{const x=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+p(r('Họ tên: ..'),r('.'),r('.....'))+p(r('Sinh ngày ... tháng ... năm ...'))+p(r('Ký ngày tháng năm'))+p(r('Căn cứ ngày 20 tháng 11 năm 2019'))+p(r('Địa chỉ: …'))+p(r('Mã: ...... Số: ......'))+'</w:body></w:document>';
 const d3=new DOMParser().parseFromString(x,'text/xml'),pt=[{name:'x',doc:d3}],S=Core.segs(pt,'docx'),sl=Core.slots(S);
 assert.strictEqual(sl.length,6,'6 vị trí: dấu chấm nhiều run, 2 cụm ngày, dấu …, 2 vị trí cùng đoạn; căn cứ pháp lý không có vị trí');
 assert.deepStrictEqual(sl.filter(s=>s.kind==='date').map(s=>s.text),['ngày ... tháng ... năm ...','ngày tháng năm'],'mỗi ngày tháng năm là MỘT vị trí');
 assert(Core.slotLines(S,sl).some(l=>l.includes('Mã: ⟦')&&l.includes('Số: ⟦')),'đánh dấu mã vị trí trong dòng gửi AI');
 const K=['HoTen','NgaySinh','NgayKy','DiaChi','Ma','So'],ff=sl.map((x,i)=>({ref:x.ref,slot:1,st:x.st,en:x.en,key:K[i],original:x.text,before:x.before,after:x.after,context:x.ctx,on:true}));
 Core.execute(Core.plan(S,ff));const o=Core.segs(pt,'docx').map(s=>s.text);
 assert.deepStrictEqual(o,['Họ tên: {{HoTen}}','Sinh {{NgaySinh}}','Ký {{NgayKy}}','Căn cứ ngày 20 tháng 11 năm 2019','Địa chỉ: {{DiaChi}}','Mã: {{Ma}} Số: {{So}}']);console.log('PASS: chế độ 1')}
// --- Khôi phục kiểu gộp ---
{const S=(id,value)=>({id,value}),cur={files:[{id:'a'}],results:[{id:'a'}],settings:[S('keys',[{id:'k1',provider:'openai',key:'X'}]),S('activeKey','k1'),S('prompt','mine'),S('history',[{t:1,file:'f',action:'x'}])]},
 bk={files:[{id:'a'},{id:'b'}],results:[{id:'a'},{id:'b'}],settings:[S('keys',[{id:'k1',provider:'openai',key:'X'},{id:'k1',provider:'groq',key:'Y'}]),S('activeKey','k1'),S('prompt','theirs'),S('promptDots','d'),S('history',[{t:1,file:'f',action:'x'},{t:2,file:'g',action:'y'}])]};
 const m=Core.merge(cur,bk),g=id=>m.settings.find(x=>x.id===id)?.value;
 assert.deepStrictEqual(m.files.map(x=>x.id),['b']);assert.deepStrictEqual(m.results.map(x=>x.id),['b']);
 assert.strictEqual(g('keys').length,2,'key trùng bị bỏ qua, key mới được thêm với id mới');assert.notStrictEqual(g('keys')[1].id,'k1');
 assert.strictEqual(g('prompt'),undefined,'giữ prompt hiện tại');assert.strictEqual(g('promptDots'),'d');assert.strictEqual(g('history').length,2);assert.strictEqual(g('activeKey'),undefined);console.log('PASS: gộp khi khôi phục')}
// --- Đọc JSON AI: rào Markdown, chữ thừa, bị cắt giữa chừng, rỗng ---
{assert.strictEqual(Core.jparse('```json\n{"fields":[]}\n```').fields.length,0);
 assert.strictEqual(Core.jparse('{"fields":[{"key":"A","original":"x"},{"key":"B","orig').length,1,'cứu phần tử hoàn chỉnh khi bị cắt');
 assert.strictEqual(Core.jparse('Đây là kết quả: [{"a":"}"},{"a":2}] hết').length,2);
 assert.throws(()=>Core.jparse(''),SyntaxError);assert.throws(()=>Core.jparse('{"fields":['),SyntaxError);console.log('PASS: đọc JSON AI')}
// --- Tô nền vàng chỉ phần {{Key}}, không đổi chữ ---
{const x=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`+p(r('Họ tên: {{HoTen}} / Số: {{So}} hết',1))+p(r('{{NgaySinh}}'))+'</w:body></w:document>';
 const d4=new DOMParser().parseFromString(x,'text/xml'),pt=[{name:'x',doc:d4}],before=Core.segs(pt,'docx').map(s=>s.text);
 const n=Core.highlight(pt,k=>k!=='So'),out=new XMLSerializer().serializeToString(d4);
 assert.deepStrictEqual(Core.segs(pt,'docx').map(s=>s.text),before,'nội dung không đổi');assert.strictEqual((out.match(/<w:highlight/g)||[]).length,2,'chỉ 2 Key được tô (HoTen, NgaySinh)');
 assert(!/highlight[^>]*>[^]*?Họ tên:/.test(out.split('{{HoTen}}')[0]),'nhãn không bị tô');assert(out.includes('<w:b/>'),'giữ định dạng đậm');console.log('PASS: tô nền Key')}
