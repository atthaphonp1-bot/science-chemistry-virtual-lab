/* ห้องทดลองและเครื่องมือเฉพาะของบทที่ 4 (ย้ายมาจากหน้าเดิม) ฟังก์ชันตรวจ/แบบทดสอบ/ฟอร์ม/ส่งออก ใช้ของ kit แล้ว ลบออกจากไฟล์นี้ */
/* ---- ฟังก์ชันคำนวณ (ฟังก์ชันบริสุทธิ์) ---- */
/* ครึ่งชีวิต: เหลือ = m0 × (1/2)^(t/ครึ่งชีวิต) (คู่มือครู หน้า 114, 118–122: ข้อสอบ Na-24, Os-182, C-14) */
function remaining(m0,t,half){if(!(half>0)||!(t>=0)||!(m0>=0))throw new Error('bad input');return m0*Math.pow(0.5,t/half);}
function ageFromPercent(pct,half){if(!(pct>0&&pct<=100)||!(half>0))throw new Error('bad input');return half*Math.log2(100/pct);}
/* นับอะตอมในสูตรเคมี เช่น C3H8, Ca(OH)2, 2H2O(l) ; สัญลักษณ์สถานะท้ายสูตรถูกตัดทิ้ง ไม่รองรับวงเล็บซ้อน */
function countAtoms(f){
  let s=String(f).trim().replace(/\((g|s|l|aq)\)$/,'');
  const mc=s.match(/^(\d+)/);const co=mc?+mc[1]:1;if(mc)s=s.slice(mc[1].length);
  const stack=[{}];let i=0;
  const num=()=>{let j=i;while(i<s.length&&/\d/.test(s[i]))i++;return i>j?+s.slice(j,i):1;};
  while(i<s.length){
    const c=s[i];
    if(c==='('){stack.push({});i++;}
    else if(c===')'){i++;const m=num(),top=stack.pop(),b=stack[stack.length-1];for(const k in top)b[k]=(b[k]||0)+top[k]*m;}
    else if(/[A-Z]/.test(c)){let e=c;i++;if(i<s.length&&/[a-z]/.test(s[i])){e+=s[i];i++;}const m=num(),b=stack[stack.length-1];b[e]=(b[e]||0)+m;}
    else throw new Error('bad formula');
  }
  if(stack.length!==1)throw new Error('bad formula');
  const out={};for(const k in stack[0])out[k]=stack[0][k]*co;return out;
}
function sumAtoms(list){const t={};list.forEach(f=>{const a=countAtoms(f);for(const k in a)t[k]=(t[k]||0)+a[k];});return t;}
function isBalanced(L,R){const a=sumAtoms(L),b=sumAtoms(R),ks=new Set(Object.keys(a).concat(Object.keys(b)));for(const k of ks)if((a[k]||0)!==(b[k]||0))return false;return true;}
/* แบบจำลองเวลาเกิดปฏิกิริยา CaCO3 + HCl (ค่าของผู้จัดทำหน้า ปรับให้ตรงผลตัวอย่างของคู่มือ หน้า 107):
   พื้นฐาน = ผง · HCl 1 %w/v · อุณหภูมิห้อง → 50 s ; HCl 7 % → 15 s ; อุ่น 60 °C → 25 s ; เม็ด → "> 300 s"
   สมมติเอง: อุณหภูมิห้อง 30 °C ; เวลา ∝ conc^−n (n หาจาก 50→15 ที่ความเข้มข้น 7 เท่า) ; เวลาลดครึ่งต่อ +30 °C ; เม็ดช้ากว่าผง 8 เท่า */
const T_ROOM=30,T_WARM=60,N_CONC=Math.log(50/15)/Math.log(7),TABLET_X=8,T_OBS=300;
function reactTime(conc,tempC,form){
  if(!(conc>0)||!Number.isFinite(tempC)||(form!=='powder'&&form!=='tablet'))throw new Error('bad input');
  let t=50*Math.pow(conc,-N_CONC)*Math.pow(2,-(tempC-T_ROOM)/(T_WARM-T_ROOM));
  if(form==='tablet')t*=TABLET_X;return t;}
/* พื้นที่ผิวรวมของลูกบาศก์ด้านละ 1 cm ที่ผ่าเป็น n×n×n ชิ้นเล็ก = 6n cm² (ผู้จัดทำหน้าคำนวณเอง ใช้ประกอบเรื่องพื้นที่ผิว) */
function cubeArea(n){if(!Number.isInteger(n)||n<1)throw new Error('bad');return 6*n;}
const mmss=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};

/* ---- กิจกรรม 4.1 ---- */
const HMAX=165,YL=200,NECKX=20;
/* ระดับฟองของแบบจำลอง (ผู้จัดทำหน้าสมมติ เป็นภาพเชิงคุณภาพ): ขวด B แบบเร็วแล้วช้าลง ขวด A เกือบไม่มี ตามที่คู่มือกล่าวว่าอาจเห็นเล็กน้อยหรือไม่เห็นเลย */
function foamH(flask,t,soap){if(!soap)return 0;return flask==='B'?HMAX*(1-Math.exp(-t/40)):HMAX*0.03*(t/180);}
function foamWord(h){const r=h/HMAX;return r<=0.001?'ไม่มี':r<0.1?'น้อยมาก':r<0.5?'ปานกลาง':'มาก';}
function flaskSVG(cx,id){
  const outline=`M${cx-NECKX} 60 L${cx-NECKX} 130 L${cx-70} 250 Q${cx-74} 285 ${cx-45} 285 L${cx+45} 285 Q${cx+74} 285 ${cx+70} 250 L${cx+NECKX} 130 L${cx+NECKX} 60`;
  const clip=`M${cx-NECKX} 0 L${cx-NECKX} 130 L${cx-70} 250 Q${cx-74} 285 ${cx-45} 285 L${cx+45} 285 Q${cx+74} 285 ${cx+70} 250 L${cx+NECKX} 130 L${cx+NECKX} 0 Z`;
  return`<clipPath id="cp${id}"><path d="${clip}"/></clipPath>
  <g clip-path="url(#cp${id})"><rect x="${cx-80}" y="${YL}" width="160" height="90" fill="#d9f0ee"/>
  <rect id="fm${id}" x="${cx-80}" y="${YL}" width="160" height="0" fill="url(#foamP)" stroke="none"/>
  ${[0,1,2,3,4,5,6,7,8,9,10,11].map(j=>`<circle class="gb${id}" cx="${cx-30+(j*19)%60}" cy="270" r="${2+(j%3)}" fill="#fff" stroke="#0f766e" stroke-width="1" opacity="0"/>`).join('')}</g>
  <path d="${outline}" fill="none" stroke="#24413f" stroke-width="3"/>`;
}
lab('4.1',()=>`<div class="lab"><h3>ห้องทดลองเสมือน: ขวด A (ไม่เติม KI) เทียบกับขวด B (เติม KI 5 หยด)</h3>
  <p class="small">แบบจำลองเพื่อการศึกษา ปริมาณฟองเป็นภาพเชิงคุณภาพที่ผู้จัดทำหน้าสมมติให้สอดคล้องกับผลตัวอย่างของคู่มือ (ขวดที่เติม KI มีฟองจำนวนมาก ขวดที่ไม่เติมอาจเห็นเล็กน้อยหรือไม่เห็น) ไม่ใช่ข้อมูลวัดจริง เวลา 3 นาทีถูกย่อให้เล่นเร็วขึ้น</p>
  <div class="btns"><label class="opt"><input type="checkbox" id="soap" checked><span>เติมน้ำยาล้างจานทั้งสองขวด (ตามวิธีทำ)</span></label></div>
  <div class="fig"><svg id="svg41" viewBox="0 0 360 310" role="img" aria-label="ขวดรูปกรวยสองใบ ขวด A ไม่เติม KI ขวด B เติม KI">
   <defs><pattern id="foamP" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#f4fbfa"/><circle cx="4" cy="4" r="3.4" fill="none" stroke="#5eb6ad" stroke-width="1"/><circle cx="11" cy="10" r="3" fill="none" stroke="#5eb6ad" stroke-width="1"/></pattern></defs>
   ${flaskSVG(95,'A')}${flaskSVG(265,'B')}
   <text x="95" y="303" text-anchor="middle" font-size="13" fill="#24413f">ขวด A · ไม่เติม KI</text><text x="265" y="303" text-anchor="middle" font-size="13" fill="#24413f">ขวด B · เติม KI</text>
   <g id="kiDrops" opacity="0">${[0,1,2,3,4].map(i=>`<circle cx="265" cy="${8+i*9}" r="3" fill="#0f766e"/>`).join('')}<text x="285" y="30" font-size="11" fill="#0f766e">KI</text></g>
  </svg></div>
  <div class="btns"><button class="btn" type="button" id="go41">เติม KI ลงขวด B แล้วเริ่มจับเวลา 3 นาที</button><button class="btn alt" type="button" id="skip41">ข้ามไปที่ 3 นาที</button><button class="btn alt" type="button" id="rst41">ตั้งต้นใหม่</button></div>
  <div class="rowflex"><label for="sl41">เลื่อนดูเวลา (หลังเริ่มแล้ว)<input id="sl41" type="range" min="0" max="180" step="1" value="0" disabled></label><div class="read" id="tm41" aria-live="off">0:00</div></div>
  <div class="stat"><div>ขวด A (ไม่เติม KI)<b id="fa41">–</b></div><div>ขวด B (เติม KI)<b id="fb41">–</b></div></div>
  <div class="tip" id="msg41" aria-live="polite">กดปุ่มเริ่มเพื่อดูการเปลี่ยนแปลง</div></div>
  <div class="box"><h3>บันทึกผลสังเกต (เลือกหลังทดลอง)</h3><p class="lbl">ขวด A (ไม่เติม KI) หลัง 3 นาที</p>${radioGroup('oa41',[['none','ฟองเล็กน้อยหรือไม่มี'],['many','ฟองจำนวนมาก']])}<p class="lbl">ขวด B (เติม KI) หลัง 3 นาที</p>${radioGroup('ob41',[['none','ฟองเล็กน้อยหรือไม่มี'],['many','ฟองจำนวนมาก']])}<div class="res" id="obsres" aria-live="polite"></div></div>`,
()=>{
  const root=$('#panel');let t=0,raf=null,last=0,rt=0,started=false,speed=15;
  const sl=$('#sl41'),soap=()=>$('#soap').checked;
  function render(){
    const sp=soap(),hA=foamH('A',t,sp),hB=started?foamH('B',t,sp):0;
    const fa=$('#fmA'),fb=$('#fmB');if(!fa||!fb)return;
    fa.setAttribute('y',YL-hA);fa.setAttribute('height',hA);fb.setAttribute('y',YL-hB);fb.setAttribute('height',hB);
    const gb=started?Math.min(12,Math.round(12*(1-Math.exp(-t/25))+1)):0;
    $$('.gbB').forEach((c,j)=>{if(j<gb&&t<180.5){const ph=((rt*1.2+j*0.137)%1);c.setAttribute('cy',270-ph*(70+(j%4)*8));c.setAttribute('opacity',1-ph*.7);}else c.setAttribute('opacity',0);});
    const ga=started?(t>5?Math.round(t/60):0):0;
    $$('.gbA').forEach((c,j)=>{if(j<ga&&t<180.5){const ph=((rt*0.5+j*0.31)%1);c.setAttribute('cy',270-ph*70);c.setAttribute('opacity',(1-ph)*.7);}else c.setAttribute('opacity',0);});
    $('#tm41').textContent=mmss(t);sl.value=Math.round(t);
    $('#fa41').textContent=started?(sp?foamWord(hA):'ฟองไม่สะสม (ไม่มีน้ำยาล้างจาน)'):'–';
    $('#fb41').textContent=started?(sp?foamWord(hB):'มีแก๊สเกิดแต่ไม่สะสมเป็นฟอง'):'–';
    $('#svg41').setAttribute('aria-label','ขวด A ไม่เติม KI ระดับฟอง '+(started?(sp?foamWord(hA):'ไม่มีฟองสะสม'):'ยังไม่เริ่ม')+' ขวด B เติม KI ระดับฟอง '+(started?(sp?foamWord(hB):'ไม่มีฟองสะสม'):'ยังไม่เริ่ม')+' ที่เวลา '+mmss(t));
  }
  function stop(){if(raf){cancelAnimationFrame(raf);raf=null;}}
  clean(stop);
  function finish(){
    t=180;render();stop();
    $('#msg41').textContent=soap()?'ครบ 3 นาที: ขวด B (เติม KI) มีฟองมาก ขวด A เกือบไม่มีฟอง ตรงกับผลตัวอย่างของคู่มือ จึงสรุปว่า KI เป็นตัวเร่งปฏิกิริยาที่ทำให้ H₂O₂ สลายตัวเร็วขึ้น':'ครบ 3 นาที: ไม่มีน้ำยาล้างจาน แก๊สเกิดแต่หลุดออกไปไม่เกิดฟองสะสม จึงเปรียบเทียบปริมาณแก๊สยาก (นี่คือเหตุผลที่หนังสือให้เติมน้ำยาล้างจาน ตามคำอธิบายของผู้จัดทำหน้า)';
    if(soap()){run('4.1');}
  }
  function step(ts){if(!root.isConnected){stop();return;}const dt=Math.max(0,Math.min(.1,(ts-last)/1000));last=ts;rt+=dt;t+=dt*speed;if(t>=180){finish();return;}render();raf=requestAnimationFrame(step);}
  function begin(){stop();started=true;t=0;sl.disabled=false;$('#kiDrops').setAttribute('opacity',1);$('#msg41').textContent='ทดลองกำลังเดินอยู่ (เวลาในแบบจำลองถูกย่อให้เร็วขึ้น)';render();
    if(REDUCE){finish();return;}last=performance.now();raf=requestAnimationFrame(step);}
  $('#go41').onclick=begin;
  $('#skip41').onclick=()=>{stop();started=true;sl.disabled=false;$('#kiDrops').setAttribute('opacity',1);finish();};
  $('#rst41').onclick=()=>{stop();started=false;t=0;sl.disabled=true;$('#kiDrops').setAttribute('opacity',0);render();$('#msg41').textContent='กดปุ่มเริ่มเพื่อดูการเปลี่ยนแปลง';};
  sl.oninput=()=>{stop();t=+sl.value;render();};
  $('#soap').onchange=render;
  render();
  const obs=()=>{const a=dget('4.1','oa41'),b=dget('4.1','ob41'),r=$('#obsres');if(!a||!b){r.textContent='';return;}
    const ok=a==='none'&&b==='many';r.className='res '+(ok?'ok':'bad');r.textContent=ok?'ตรงกับผลตัวอย่างของคู่มือ: ขวด A ฟองเล็กน้อยหรือไม่มี · ขวด B ฟองจำนวนมาก':'ยังไม่ตรงกับผลตัวอย่างของคู่มือ ลองกดทดลองในห้องเสมือนแล้วสังเกตใหม่';};
  wireRadio(root,'4.1','oa41',obs);wireRadio(root,'4.1','ob41',obs);obs();
});

/* ---- กิจกรรม 4.2 ---- */
const NBUB=16;
function formTxt(c){return(c.form==='powder'?'ผง':'เม็ด')+' · HCl '+c.conc+' %w/v · '+(c.temp>T_ROOM?'อุ่น '+c.temp+' °C':'อุณหภูมิห้อง');}
function mkCfg(conc,temp,form){return{conc,temp,form,T:reactTime(conc,temp,form)};}
const GUIDE=[mkCfg(1,T_ROOM,'powder'),mkCfg(7,T_ROOM,'powder'),mkCfg(1,T_WARM,'powder'),mkCfg(1,T_ROOM,'tablet')];
const GUIDE_T=['50','15','25','> 300'];
const DOTS=[[-26,0],[-18,-3],[-10,0],[-2,-2],[6,0],[14,-3],[22,0],[-22,-6],[-6,-6],[10,-6],[18,-6],[-14,-9],[2,-9],[-28,-3]];
function makeSim(hostId,cfgs,onDone){
  const host=$('#'+hostId);if(!host)return null;
  const W=cfgs.length*140,H=290,Y0=232;
  let g='';
  cfgs.forEach((c,i)=>{const cx=70+i*140,warm=c.temp>T_ROOM;
    g+=`<g><rect x="${cx-42}" y="92" width="84" height="${Y0-92}" fill="${warm?'#fbe3d3':'#dff3f0'}" opacity=".9"/>
    ${c.form==='powder'?DOTS.map((d,j)=>`<circle class="sd${i}" data-j="${j}" cx="${cx+d[0]}" cy="${Y0-4+d[1]}" r="2.2" fill="#6b6f76"/>`).join(''):`<rect class="tb${i}" x="${cx-12}" y="${Y0-14}" width="24" height="14" rx="3" fill="#6b6f76"/>`}
    ${Array.from({length:NBUB},(_,j)=>`<circle class="bb${i}" cx="${cx-32+(j*29)%64}" cy="${Y0-8}" r="${2.3+(j%3)*.8}" fill="#fff" stroke="#0f766e" stroke-width="1" opacity="0"/>`).join('')}
    <path d="M${cx-42} 82 L${cx-42} ${Y0} L${cx+42} ${Y0} L${cx+42} 82" fill="none" stroke="#24413f" stroke-width="3" stroke-linejoin="round"/>
    <text x="${cx}" y="${Y0+22}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#172033">${cfgs.length===1?'บีกเกอร์ทดลองเอง':'ใบที่ '+(i+1)}</text>
    <text x="${cx}" y="${Y0+38}" text-anchor="middle" font-size="10.5" fill="#33415c">${(c.form==='powder'?'ผง':'เม็ด')} · ${c.conc} %${warm?' · '+c.temp+'°C':''}</text>
    <text class="tt${i}" x="${cx}" y="68" text-anchor="middle" font-size="16" font-weight="700" fill="#0f766e">0 s</text></g>`;});
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="บีกเกอร์ CaCO3 ในกรดไฮโดรคลอริก">${g}</svg>`;
  const svg=$('svg',host);
  let t=0,rt=0,raf=null,last=0,speed=20;
  const tEnd=cfgs.map(c=>Math.min(c.T,T_OBS)),tmax=Math.max.apply(null,tEnd);
  function render(){
    if(!host.isConnected)return;
    const lbl=[];
    cfgs.forEach((c,i)=>{
      const tt=Math.min(t,tEnd[i]),fin=t>=tEnd[i]-1e-9&&t>0,rem=Math.max(0,1-tt/c.T);
      const nv=fin?0:Math.max(1,Math.round(NBUB*Math.min(1,15/c.T)));
      $$('.bb'+i,host).forEach((el,j)=>{if(t>0&&j<nv){const ph=(rt*1.1+j*0.211)%1;el.setAttribute('cy',Y0-8-ph*(Y0-110));el.setAttribute('opacity',(1-ph*.75).toFixed(2));}else el.setAttribute('opacity',0);});
      if(c.form==='powder'){const keep=Math.ceil(DOTS.length*rem);$$('.sd'+i,host).forEach(el=>el.setAttribute('opacity',+el.dataset.j<keep?1:0));}
      else{const k=Math.sqrt(rem),w=24*k,h=14*k,r=$('.tb'+i,host);if(r){r.setAttribute('width',w);r.setAttribute('height',h);r.setAttribute('x',70+i*140-w/2);r.setAttribute('y',Y0-h);}}
      const txt=fin?(c.T>T_OBS?'> 300 s':Math.round(c.T)+' s ✓'):Math.round(tt)+' s';
      $('.tt'+i,host).textContent=txt;lbl.push((cfgs.length===1?'บีกเกอร์ทดลองเอง ':'ใบที่ '+(i+1)+' ')+txt);
    });
    svg.setAttribute('aria-label','บีกเกอร์ CaCO3 ในกรดไฮโดรคลอริก เวลาในแบบจำลอง '+lbl.join(' · '));
  }
  function stop(){if(raf){cancelAnimationFrame(raf);raf=null;}}
  function done(){stop();t=tmax;render();onDone&&onDone(cfgs);}
  function step(ts){if(!host.isConnected){stop();return;}const dt=Math.max(0,Math.min(.1,(ts-last)/1000));last=ts;rt+=dt;t+=dt*speed;if(t>=tmax){done();return;}render();raf=requestAnimationFrame(step);}
  render();
  return{run(sp){stop();speed=sp||20;t=0;rt=0;render();if(REDUCE){done();return;}last=performance.now();raf=requestAnimationFrame(step);},skip(){done();},reset(){stop();t=0;render();},stop};
}
lab('4.2',()=>{const c1=(a,b)=>`<option value="${a}">${b}</option>`;
  return`<div class="lab"><h3>ห้องทดลองเสมือน A: บีกเกอร์ 4 ใบตามคู่มือ</h3>
  <p class="small"><b>ค่าของแบบจำลอง:</b> เวลาของใบที่ 1–3 (50 · 15 · 25 วินาที) และใบที่ 4 ที่ &gt; 300 วินาที ตั้งตามตารางผลตัวอย่างของคู่มือ (หน้า 107) ส่วนอุณหภูมิห้องที่สมมติเป็น 30 °C และความเร็วของแอนิเมชัน (ย่อเวลาให้เร็วขึ้น) เป็นค่าของผู้จัดทำหน้า ตัวเลขจากการทดลองจริงของนักเรียนอาจต่างจากนี้</p>
  <p class="lbl" id="predl">ทำนายก่อนทดลอง: บีกเกอร์ใบใดเสร็จเร็วที่สุด</p>${radioGroup('pr42',[['1','ใบที่ 1'],['2','ใบที่ 2'],['3','ใบที่ 3'],['4','ใบที่ 4']])}
  <div class="fig" id="simA"></div>
  <div class="btns"><label class="small" for="sp42">ความเร็วแอนิเมชัน&nbsp;</label><select id="sp42" style="width:auto"><option value="10">×10</option><option value="20" selected>×20</option><option value="50">×50</option></select><button class="btn" type="button" id="go42">เริ่มทดลองทั้ง 4 ใบ</button><button class="btn alt" type="button" id="skip42">ข้ามไปที่ผล</button><button class="btn alt" type="button" id="rst42">ตั้งต้นใหม่</button></div>
  <div class="tw"><table class="tbl-sm wide"><thead><tr><th>ใบที่</th><th class="l">สาร</th><th>เวลาในแบบจำลอง (วินาที)</th><th>ผลตัวอย่างของคู่มือ (วินาที)</th></tr></thead><tbody id="tb42">${GUIDE.map((c,i)=>`<tr><td>${i+1}</td><td class="l">${formTxt(c)}</td><td id="r42_${i}">–</td><td>${GUIDE_T[i]}</td></tr>`).join('')}</tbody></table></div>
  <div class="tip" id="msg42" aria-live="polite">กดเริ่มทดลองเพื่อดูว่าใบใดเสร็จก่อน</div></div>
  <div class="lab"><h3>ห้องทดลองเสมือน B: ลองผสมหลายปัจจัยเอง (ค่าสมมติของแบบจำลอง)</h3>
  <p class="small">คู่มือมีผลเฉพาะ 4 แบบด้านบน การผสมแบบอื่นคำนวณจากแบบจำลองที่ผู้จัดทำหน้าตั้งขึ้น: เวลา ∝ (ความเข้มข้น)<sup>−0.62</sup> · เวลาลดลงครึ่งหนึ่งเมื่ออุณหภูมิเพิ่ม 30 °C (30 → 60 °C) · เม็ดช้ากว่าผง 8 เท่า ไม่ใช่กฎจากหนังสือ</p>
  <div class="ledrow"><label for="cc42">ความเข้มข้นของ HCl<select id="cc42">${c1(1,'1 %w/v')}${c1(7,'7 %w/v')}</select></label><label for="ct42">อุณหภูมิของกรด<select id="ct42">${c1(30,'อุณหภูมิห้อง (สมมติ 30 °C)')}${c1(60,'อุ่นประมาณ 60 °C')}</select></label><label for="cf42">รูปของ CaCO<sub>3</sub> (0.1 g)<select id="cf42">${c1('powder','ผง')}${c1('tablet','เม็ด')}</select></label></div>
  <div class="fig" id="simB"></div>
  <div class="btns"><button class="btn" type="button" id="go42b">ทดลองบีกเกอร์นี้</button></div><div class="tip" id="msg42b" aria-live="polite">เลือกค่าแล้วกดทดลอง</div></div>
  <div class="lab"><h3>พื้นที่ผิวรวมเมื่อชิ้นเล็กลง (ตัวอย่างของผู้จัดทำหน้า)</h3>
  <p class="small">คู่มือแนะนำให้ครูวาดรูปแสดงว่าทำให้ชิ้นเล็กลงเพิ่มพื้นที่ผิวอย่างไร ตัวอย่างนี้คำนวณเอง: ลูกบาศก์ด้านละ 1 cm ผ่าให้เป็นลูกบาศก์เล็ก n × n × n ชิ้น ปริมาตรรวมเท่าเดิม (1 cm³)</p>
  <label for="cube" class="lbl">แบ่งแต่ละด้านเป็น n ส่วน: n = <b id="cubeN">1</b></label><input id="cube" type="range" min="1" max="5" step="1" value="1">
  <div class="fig"><svg id="cubeSvg" viewBox="0 0 300 150" role="img" aria-label="ลูกบาศก์ด้านละ 1 เซนติเมตร"></svg></div>
  <div class="stat"><div>จำนวนชิ้น<b id="cubeP">1</b></div><div>พื้นที่ผิวรวม<b id="cubeA">6 cm²</b></div></div></div>`;},
()=>{
  const root=$('#panel');let simA=null,simB=null,finished={};
  simA=makeSim('simA',GUIDE,cfgs=>{
    cfgs.forEach((c,i)=>{$('#r42_'+i).textContent=c.T>T_OBS?'> 300':String(Math.round(c.T));});
    finished.a=true;run('4.2');
    const pv=dget('4.2','pr42');$('#msg42').textContent=(pv?(pv==='2'?'ทำนายถูก · ':'ทำนายไม่ตรง (ใบที่เร็วที่สุดคือใบที่ 2) · '):'')+'ใบที่ 2 (กรดเข้มข้นกว่า) เสร็จก่อน ใบที่ 3 (อุ่น) ตามมา ใบที่ 1 ช้ากว่า และใบที่ 4 (เม็ด) ยังไม่เสร็จเมื่อครบ 300 วินาที เทียบกับใบที่ 1 จึงสรุปว่าเพิ่มความเข้มข้น เพิ่มอุณหภูมิ หรือเพิ่มพื้นที่ผิว อัตราเพิ่มขึ้น (ตรงกับคู่มือ)';});
  clean(()=>{simA&&simA.stop();simB&&simB.stop();});
  $('#go42').onclick=()=>{finished={};GUIDE.forEach((c,i)=>{$('#r42_'+i).textContent='–';});$('#msg42').textContent='กำลังทดลอง…';simA.run(+$('#sp42').value);};
  $('#skip42').onclick=()=>simA.skip();
  $('#rst42').onclick=()=>{simA.reset();finished={};GUIDE.forEach((c,i)=>{$('#r42_'+i).textContent='–';});$('#msg42').textContent='กดเริ่มทดลองเพื่อดูว่าใบใดเสร็จก่อน';};
  wireRadio(root,'4.2','pr42');
  const runB=()=>{const c=mkCfg(+$('#cc42').value,+$('#ct42').value,$('#cf42').value);
    const gi=GUIDE.findIndex(g=>g.conc===c.conc&&g.temp===c.temp&&g.form===c.form);
    if(simB)simB.stop();
    simB=makeSim('simB',[c],cf=>{$('#msg42b').textContent='เวลาในแบบจำลอง '+(c.T>T_OBS?'> 300':'≈ '+Math.round(c.T))+' วินาที · '+(gi>=0?'ตรงกับใบที่ '+(gi+1)+' ในคู่มือ':'การผสมนี้คู่มือไม่มีผล เป็นค่าคำนวณของแบบจำลอง (สมมติ)');});
    $('#msg42b').textContent='กำลังทดลอง…';simB.run(+$('#sp42').value);};
  $('#go42b').onclick=runB;
  simB=makeSim('simB',[mkCfg(1,T_ROOM,'powder')],null);
  function cube(){const n=+$('#cube').value;$('#cubeN').textContent=n;$('#cubeP').textContent=n*n*n+' ชิ้น';$('#cubeA').textContent=cubeArea(n)+' cm²';
    const s=110/n;let g='';for(let i=0;i<n;i++)for(let j=0;j<n;j++)g+=`<rect x="${70+i*s}" y="${20+j*s}" width="${s}" height="${s}" fill="#e0f2f1" stroke="#0f766e" stroke-width="${n>3?1:1.6}"/>`;
    $('#cubeSvg').innerHTML=g+`<text x="200" y="80" font-size="13" fill="#172033">ด้านละ 1 cm</text><text x="200" y="100" font-size="13" fill="#172033">แบ่งเป็น ${n}×${n}×${n} ชิ้น</text>`;
    $('#cubeSvg').setAttribute('aria-label','ลูกบาศก์ด้านละ 1 เซนติเมตร แบ่งเป็น '+n*n*n+' ชิ้น พื้นที่ผิวรวม '+cubeArea(n)+' ตารางเซนติเมตร');}
  $('#cube').oninput=cube;cube();
});

/* ---- กิจกรรม 4.4 ---- */
const HL=[['mo','Mo-99',3,'วัน',10,'หนังสือเรียน (รูป 4.13): เริ่มต้น 10 g'],['na','Na-24',15,'ชั่วโมง',100,'คู่มือ แบบฝึกหัด 4.4 ข้อ 2'],['os','Os-182',21.5,'ชั่วโมง',8,'คู่มือ แบบฝึกหัดท้ายบท ข้อ 10'],['c14','C-14',5730,'ปี',100,'คู่มือ หน้า 117 (ตรวจสอบความเข้าใจ)']];
const DOSE=[['รังสีคอสมิก',0.39],['พื้นโลก',0.48],['อาหาร',0.29],['แก๊สเรดอนในอากาศ',1.30],['การวินิจฉัยโรคด้วยรังสี เช่น เอ็กซเรย์',0.62]];
function curveSVG(k){
  const X=i=>40+i*(240/6),Y=f=>20+(1-f)*110;let pts='';for(let i=0;i<=24;i++){const kk=i/4;pts+=X(kk)+','+Y(Math.pow(.5,kk))+' ';}
  let dots='',gr='';for(let i=0;i<=6;i++){dots+=`<circle cx="${X(i)}" cy="${Y(Math.pow(.5,i))}" r="3.5" fill="#0f766e"/><text x="${X(i)}" y="146" text-anchor="middle" font-size="11" fill="#33415c">${i}</text>`;}
  [0,.5,1].forEach(v=>{gr+=`<line x1="40" x2="280" y1="${Y(v)}" y2="${Y(v)}" stroke="#d5e8e5"/><text x="34" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="#33415c">${v*100}%</text>`;});
  return`${gr}<polyline points="${pts}" fill="none" stroke="#0f766e" stroke-width="2"/>${dots}<circle cx="${X(k)}" cy="${Y(Math.pow(.5,k))}" r="7" fill="none" stroke="#b63f43" stroke-width="2.5"/><text x="160" y="164" text-anchor="middle" font-size="11" fill="#33415c">จำนวนครึ่งชีวิตที่ผ่านไป</text>`;
}
lab('4.4',()=>`<div class="lab"><h3>ห้องทดลองเสมือน: ครึ่งชีวิต</h3>
  <p class="small"><b>แบบจำลองเพื่อการศึกษา:</b> ใช้สูตรเหลือ = เริ่มต้น × (½)<sup>t ÷ ครึ่งชีวิต</sup> ค่าครึ่งชีวิตและมวลเริ่มต้นเป็นค่าที่หนังสือหรือคู่มือใช้ในโจทย์ (ระบุที่มาใต้ตัวเลือก) มวลเริ่มต้นแก้ได้</p>
  <div class="ledrow"><label for="hs">สารกัมมันตรังสี<select id="hs">${HL.map((h,i)=>`<option value="${i}">${h[1]} (ครึ่งชีวิต ${h[2]} ${h[3]})</option>`).join('')}</select></label><label for="hm">มวลเริ่มต้น (g)<input id="hm" type="number" min="0" step="any" value="10"></label><label for="hk">เวลาที่ผ่านไป (จำนวนครึ่งชีวิต): <b id="hkv">0</b><input id="hk" type="range" min="0" max="6" step="0.5" value="0"></label></div>
  <p class="small" id="hsrc"></p>
  <div class="fig"><svg id="hcurve" viewBox="0 0 300 175" role="img" aria-label="กราฟการสลายของสารกัมมันตรังสี"></svg></div>
  <div class="stat"><div>เวลาที่ผ่านไป<b id="ht">–</b></div><div>มวลที่เหลือ<b id="hr">–</b></div><div>ร้อยละที่เหลือ<b id="hp">–</b></div></div>
  <div class="tw"><table class="tbl-sm mini"><thead><tr><th>ครึ่งชีวิตที่ผ่าน</th><th>เวลา</th><th>มวลที่เหลือ (g)</th></tr></thead><tbody id="htab"></tbody></table></div>
  <h3 style="margin-top:14px">คิดย้อนกลับ: อายุจากร้อยละ C-14 ที่เหลือ (ครึ่งชีวิต 5730 ปี)</h3>
  <div class="ledrow"><label for="cp">ร้อยละของ C-14 ที่เหลือ (0–100)<input id="cp" type="number" min="0.01" max="100" step="any" value="25"></label></div><div class="tip" id="cage" aria-live="polite"></div></div>
  <div class="lab"><h3>โทษของรังสี: ผลต่อสุขภาพและปริมาณรังสีในชีวิตประจำวัน</h3>
  <div class="tw"><table class="tbl-sm wide"><thead><tr><th>ปริมาณรังสี (Gy)</th><th class="l">ผลกระทบช่วงต้น (คู่มือ หน้า 116)</th></tr></thead><tbody><tr><td>&gt; 50</td><td class="l">ระบบประสาทส่วนกลางถูกทำลาย เสียชีวิตภายใน 2–3 วัน</td></tr><tr><td>8</td><td class="l">คลื่นไส้ อาเจียน ท้องร่วง กระสับกระส่าย ปวดศีรษะ เป็นไข้ ความดันต่ำ และเสียชีวิตจากระบบทางเดินอาหารถูกทำลายภายใน 2–3 สัปดาห์ถัดมา</td></tr><tr><td>2</td><td class="l">คลื่นไส้ อาเจียน</td></tr></tbody></table></div>
  <p class="small">ผลระยะยาว (คู่มือ): เนื้องอก มะเร็งเม็ดเลือดขาว และความผิดปกติทางพันธุกรรมในบุตรของผู้ได้รับรังสี</p>
  <h3 style="margin-top:12px">ตัวอย่างรังสีที่คนได้รับใน 1 ปี (หนังสือเรียน ตาราง 4.2 หน้า 125)</h3>
  ${DOSE.map(d=>`<div class="bar2"><span class="lb">${d[0]}</span><span class="tr"><i style="width:${(d[1]/1.3*100).toFixed(1)}%"></i></span><span class="vv">${d[1].toFixed(2)}</span></div>`).join('')}
  <p class="small">หน่วย mSv ต่อปี · ผู้จัดทำหน้าบวกได้ ${DOSE.reduce((a,d)=>a+d[1],0).toFixed(2)} mSv ต่อปี หนังสือเรียนระบุว่า ICRP กำหนดค่ารังสีสะสมที่ไม่เป็นอันตรายไว้ไม่เกิน 50 mSv ต่อปี (<b>ข้อมูลนอกหนังสือ ผู้จัดทำหน้าเพิ่ม ควรสอบถามครู:</b> ICRP แยกเกณฑ์สำหรับประชาชนทั่วไปที่ 1 mSv ต่อปี และผู้ปฏิบัติงานด้านรังสีเฉลี่ย 20 mSv ต่อปี และเกณฑ์เหล่านี้ไม่นับรังสีธรรมชาติและการแพทย์ จึงไม่ควรเอาผลรวมในตารางไปเทียบตรง ๆ)</p></div>`,
()=>{
  const root=$('#panel');
  const hs=$('#hs'),hm=$('#hm'),hk=$('#hk');
  function hl(){
    const h=HL[+hs.value],m0=parseFloat(hm.value),k=+hk.value;$('#hkv').textContent=k;$('#hsrc').textContent='ที่มาของค่า: '+h[5];
    let ok=Number.isFinite(m0)&&m0>=0;
    $('#htab').innerHTML=ok?[0,1,2,3,4,5,6].map(i=>`<tr><td>${i}</td><td>${fmt(i*h[2],2)} ${h[3]}</td><td>${fmt(remaining(m0,i*h[2],h[2]),3)}</td></tr>`).join(''):'<tr><td colspan="3">กรอกมวลเริ่มต้นให้ถูกต้อง</td></tr>';
    $('#hcurve').innerHTML=curveSVG(k);
    if(!ok){$('#ht').textContent=$('#hr').textContent=$('#hp').textContent='–';return;}
    const t=k*h[2],r=remaining(m0,t,h[2]);
    $('#ht').textContent=fmt(t,2)+' '+h[3];$('#hr').textContent=fmt(r,3)+' g';$('#hp').textContent=m0>0?fmt(100*r/m0,2)+' %':'–';
    $('#hcurve').setAttribute('aria-label','กราฟการสลายของ '+h[1]+' เมื่อผ่านไป '+k+' ครึ่งชีวิต เหลือร้อยละ '+(m0>0?fmt(100*r/m0,2):'–'));
  }
  hs.onchange=()=>{hm.value=HL[+hs.value][4];hl();};hm.oninput=hl;hk.oninput=hl;hl();
  const cp=$('#cp');function age(){const p=parseFloat(cp.value);const e=$('#cage');
    if(!(p>0&&p<=100)){e.textContent='กรอกร้อยละระหว่างมากกว่า 0 ถึง 100';return;}
    const n=Math.log2(100/p),a=ageFromPercent(p,5730);e.textContent='ผ่านไป '+fmt(n,3)+' ครึ่งชีวิต ≈ '+Math.round(a).toLocaleString('en-US')+' ปี'+(p===25?' (ตรงกับตัวอย่างของคู่มือ หน้า 117: 11,460 ปี)':'');}
  cp.oninput=age;age();
});

/* ---- แท็บสรุปเนื้อหา ---- */
function svgWrap(w,h,label,inner){return`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect width="${w}" height="${h}" fill="#fff"/>${inner}</svg>`;}
function mapSVG(){
  const bx=(x,y,w,t,f)=>`<rect x="${x}" y="${y}" width="${w}" height="34" rx="10" fill="${f||'#ecf7f5'}" stroke="#0f766e" stroke-width="1.5"/><text x="${x+w/2}" y="${y+22}" text-anchor="middle" font-size="12.5" fill="#172033">${t}</text>`;
  const ln=(x1,y1,x2,y2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0f766e" stroke-width="1.8"/>`;
  return svgWrap(560,300,'ผังมโนทัศน์บทที่ 4 พลังงานมาจากปฏิกิริยาเคมีและปฏิกิริยานิวเคลียร์ ปฏิกิริยาเคมีมีการเผาไหม้ที่ใช้เชื้อเพลิง และปฏิกิริยารีดอกซ์ในเซลล์เคมีไฟฟ้า อัตราการเกิดปฏิกิริยาขึ้นกับความเข้มข้น อุณหภูมิ พื้นที่ผิว และตัวเร่ง ปฏิกิริยานิวเคลียร์ใช้สารกัมมันตรังสี มีครึ่งชีวิต ประโยชน์และโทษ',
   bx(210,8,140,'พลังงาน','#e0f2f1')+ln(280,42,280,58)+ln(130,58,430,58)+ln(130,58,130,72)+ln(430,58,430,72)+
   bx(40,72,180,'ปฏิกิริยาเคมี')+bx(340,72,180,'ปฏิกิริยานิวเคลียร์')+
   ln(80,106,80,126)+ln(190,106,190,126)+bx(10,126,140,'การเผาไหม้ (เชื้อเพลิง)')+bx(165,126,140,'รีดอกซ์ / แบตเตอรี่')+
   ln(430,106,430,126)+bx(340,126,180,'สารกัมมันตรังสี')+
   ln(80,160,80,184)+bx(10,184,180,'อัตราการเกิดปฏิกิริยา')+ln(100,218,100,236)+
   `<text x="100" y="254" text-anchor="middle" font-size="12" fill="#172033">ความเข้มข้น · อุณหภูมิ</text><text x="100" y="272" text-anchor="middle" font-size="12" fill="#172033">พื้นที่ผิว · ตัวเร่ง</text>`+
   ln(430,160,430,184)+bx(340,184,180,'ครึ่งชีวิต')+ln(430,218,430,236)+`<text x="430" y="254" text-anchor="middle" font-size="12" fill="#172033">ประโยชน์ · โทษ</text><text x="430" y="272" text-anchor="middle" font-size="12" fill="#172033">การป้องกัน</text>`);
}
function cellSVG(){
  return svgWrap(520,200,'แผนภาพถ่านไฟฉาย อิเล็กตรอนไหลจากขั้วลบสังกะสีผ่านลวดและหลอดไฟไปยังขั้วบวกคาร์บอน กระแสไฟฟ้ามีทิศตรงข้ามกับอิเล็กตรอน',
   `<rect x="40" y="70" width="90" height="100" rx="8" fill="#e8f0ee" stroke="#24413f" stroke-width="2"/><text x="85" y="125" text-anchor="middle" font-size="13" fill="#172033">สังกะสี</text><text x="85" y="145" text-anchor="middle" font-size="12" fill="#b63f43">ขั้วลบ (−)</text>
   <rect x="380" y="70" width="90" height="100" rx="8" fill="#e8f0ee" stroke="#24413f" stroke-width="2"/><text x="425" y="115" text-anchor="middle" font-size="12.5" fill="#172033">คาร์บอน +</text><text x="425" y="133" text-anchor="middle" font-size="12.5" fill="#172033">สารประกอบ</text><text x="425" y="151" text-anchor="middle" font-size="12.5" fill="#172033">ออกไซด์ Mn</text><text x="425" y="190" text-anchor="middle" font-size="12" fill="#1f4f4a">ขั้วบวก (+)</text>
   <rect x="130" y="110" width="250" height="40" fill="#f4fbfa" stroke="#8fc2bb"/><text x="255" y="135" text-anchor="middle" font-size="12" fill="#33415c">อิเล็กโทรไลต์</text>
   <path d="M85 70 L85 30 L425 30 L425 70" fill="none" stroke="#24413f" stroke-width="2"/><circle cx="255" cy="30" r="19" fill="#fff6c9" stroke="#24413f" stroke-width="2"/><text x="255" y="34" text-anchor="middle" font-size="11" fill="#172033">หลอด</text>
   <path d="M130 20 L215 20" stroke="#0f766e" stroke-width="2.5" marker-end="url(#ar)"/><text x="172" y="14" text-anchor="middle" font-size="11.5" fill="#0f766e">e⁻ →</text>
   <path d="M380 44 L300 44" stroke="#b63f43" stroke-width="2.5" stroke-dasharray="5 4" marker-end="url(#ar2)"/><text x="340" y="62" text-anchor="middle" font-size="11.5" fill="#b63f43">← กระแสไฟฟ้า</text>
   <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#0f766e"/></marker><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#b63f43"/></marker></defs>`);
}
const EQS=[
 ['C<sub>3</sub>H<sub>8</sub>(g) + 5O<sub>2</sub>(g) → 3CO<sub>2</sub>(g) + 4H<sub>2</sub>O(g)',['C3H8(g)','5O2(g)'],['3CO2(g)','4H2O(g)']],
 ['2C<sub>8</sub>H<sub>18</sub>(l) + 25O<sub>2</sub>(g) → 16CO<sub>2</sub>(g) + 18H<sub>2</sub>O(g)',['2C8H18(l)','25O2(g)'],['16CO2(g)','18H2O(g)']],
 ['CaCO<sub>3</sub>(s) → CaO(s) + CO<sub>2</sub>(g)',['CaCO3(s)'],['CaO(s)','CO2(g)']],
 ['CuCl<sub>2</sub> → Cu + Cl<sub>2</sub>',['CuCl2'],['Cu','Cl2']],
 ['CaCO<sub>3</sub>(s) + 2HCl(aq) → CaCl<sub>2</sub>(aq) + H<sub>2</sub>O(l) + CO<sub>2</sub>(g)',['CaCO3(s)','2HCl(aq)'],['CaCl2(aq)','H2O(l)','CO2(g)']],
 ['2H<sub>2</sub>O<sub>2</sub>(aq) → 2H<sub>2</sub>O(l) + O<sub>2</sub>(g)',['2H2O2(aq)'],['2H2O(l)','O2(g)']],
 ['H<sub>2</sub> + O<sub>2</sub> → H<sub>2</sub>O (ยังไม่ดุล)',['H2','O2'],['H2O']],
 ['N<sub>2</sub>O<sub>5</sub>(g) → NO<sub>2</sub>(g) + O<sub>2</sub>(g) (ยังไม่ดุล)',['N2O5(g)'],['NO2(g)','O2(g)']]];
lab('sum',()=>`
  <div class="box"><h3>ภาพรวม</h3><div class="fig">${mapSVG()}</div></div>
  <div class="box"><h3>ใจความหลัก</h3><ul>
  <li>พลังงานที่ใช้ในชีวิตประจำวันมาจากปฏิกิริยาเคมี (ความร้อน แสง ไฟฟ้า) หรือปฏิกิริยานิวเคลียร์</li>
  <li>สมการเคมีเขียนสารตั้งต้นซ้าย ผลิตภัณฑ์ขวา จำนวนอะตอมแต่ละธาตุเท่ากันทั้งสองข้าง และอาจบอกสถานะ พลังงาน และตัวเร่ง</li>
  <li>ตัวเร่งปฏิกิริยาทำให้ปฏิกิริยาเร็วขึ้น โดยไม่เป็นส่วนของผลิตภัณฑ์ และได้คืนเมื่อปฏิกิริยาสิ้นสุด</li>
  <li>เพิ่มความเข้มข้น อุณหภูมิ หรือพื้นที่ผิวของสารตั้งต้น ปฏิกิริยาเร็วขึ้น</li>
  <li>ปฏิกิริยารีดอกซ์คือปฏิกิริยาที่มีการถ่ายโอนอิเล็กตรอน มีทั้งแบบให้และไม่ให้กระแสไฟฟ้า แบตเตอรี่เป็นเซลล์เคมีไฟฟ้า</li>
  <li>สารกัมมันตรังสีมีนิวเคลียสไม่เสถียร สลายและแผ่รังสี ครึ่งชีวิตคือเวลาที่เหลือครึ่งหนึ่งของเดิม ใช้ประโยชน์ได้หลายด้านแต่ต้องป้องกันและจัดการอย่างเหมาะสม</li></ul></div>
  <div class="box"><h3>สัญลักษณ์ในสมการเคมี (หนังสือเรียน ตาราง 4.1 และหน้า 99–101 ของคู่มือ)</h3><div class="tw"><table class="tbl-sm wide"><thead><tr><th>สัญลักษณ์</th><th class="l">ความหมาย</th></tr></thead><tbody><tr><td>(s)</td><td class="l">ของแข็ง (solid)</td></tr><tr><td>(l)</td><td class="l">ของเหลว (liquid)</td></tr><tr><td>(g)</td><td class="l">แก๊ส (gas)</td></tr><tr><td>(aq)</td><td class="l">สารละลายในน้ำ (aqueous)</td></tr><tr><td>+ พลังงานทางขวา</td><td class="l">คายพลังงาน เช่น + 890 kJ/mol</td></tr><tr><td>+ พลังงานทางซ้าย</td><td class="l">ดูดพลังงาน เช่น N<sub>2</sub> + O<sub>2</sub> + 180.5 kJ/mol → 2NO</td></tr><tr><td>Δ บนลูกศร</td><td class="l">ให้ความร้อนเพื่อเริ่มปฏิกิริยา (บอกเงื่อนไข ไม่ได้บอกว่าดูดหรือคาย)</td></tr><tr><td>สูตรหรือชื่อบนลูกศร (เช่น Pt, Ni, ยีสต์)</td><td class="l">ตัวเร่งปฏิกิริยาที่ใช้</td></tr></tbody></table></div></div>
  <div class="lab"><h3>ตัวตรวจจำนวนอะตอมในสมการ</h3><p class="small">ผู้จัดทำหน้าเขียนตัวนับอะตอมไว้ตรวจสมการจากหนังสือและแบบฝึกหัด (สัมประสิทธิ์คูณอะตอมทุกตัวในสูตร)</p>
  <label for="eqs" class="lbl">เลือกสมการ</label><select id="eqs">${EQS.map((e,i)=>`<option value="${i}">สมการที่ ${i+1}</option>`).join('')}</select><p class="eq" id="eqshow" style="margin:8px 0"></p>
  <div class="tw"><table class="tbl-sm mini"><thead><tr><th>ธาตุ</th><th>ซ้าย</th><th>ขวา</th><th>เท่ากัน?</th></tr></thead><tbody id="eqtb"></tbody></table></div><div class="res" id="eqres" aria-live="polite"></div></div>
  <div class="box"><h3>ปัจจัยที่เพิ่มอัตราการเกิดปฏิกิริยา (กิจกรรม 4.1–4.3)</h3><div class="tw"><table class="tbl-sm wide"><thead><tr><th class="l">ปัจจัย</th><th class="l">ทำอย่างไรให้เร็วขึ้น</th><th class="l">ตัวอย่างจากกิจกรรม</th></tr></thead><tbody><tr><td class="l">ความเข้มข้น</td><td class="l">ใช้สารตั้งต้นเข้มข้นขึ้น</td><td class="l">HCl 7 %w/v เสร็จ 15 วินาที เทียบ 1 %w/v 50 วินาที</td></tr><tr><td class="l">อุณหภูมิ</td><td class="l">เพิ่มอุณหภูมิ</td><td class="l">HCl 1 % อุ่นประมาณ 60 °C เสร็จ 25 วินาที</td></tr><tr><td class="l">พื้นที่ผิว</td><td class="l">ทำสารให้ชิ้นเล็กลง (ผง ละออง)</td><td class="l">ผง CaCO<sub>3</sub> 50 วินาที ส่วนเม็ด &gt; 300 วินาที</td></tr><tr><td class="l">ตัวเร่งปฏิกิริยา</td><td class="l">เติมตัวเร่งที่เหมาะสม</td><td class="l">KI กับ H<sub>2</sub>O<sub>2</sub> ฟองมาก · Pt และ Rh ในเครื่องฟอกไอเสีย · ยีสต์ เอนไซม์</td></tr></tbody></table></div><p class="small">ตัวเลขเวลาอ้างจากตารางผลตัวอย่างของคู่มือ หน้า 107</p></div>
  <div class="box"><h3>แบตเตอรี่และปฏิกิริยารีดอกซ์ (คู่มือ หน้า 111–112)</h3><div class="fig">${cellSVG()}</div><p class="small">ถ่านไฟฉายสังกะสี–คาร์บอน (หนังสือเรียน): สังกะสีขั้วลบให้อิเล็กตรอน ไหลไปยังขั้วบวกที่เป็นคาร์บอนเคลือบสารประกอบออกไซด์ของแมงกานีส กระแสไฟฟ้ามีทิศตรงข้ามกับอิเล็กตรอน ถ่านไฟฉายประจุใหม่ไม่ได้ ส่วนแบตเตอรี่มือถือประจุใหม่ได้ โดยปฏิกิริยาตอนประจุเป็นรีดอกซ์ทิศตรงกันข้าม ตัวอย่างรีดอกซ์อื่น: การเผาไหม้ การเกิดสนิม การสังเคราะห์ด้วยแสง การหายใจ (ไม่เป็นเซลล์เคมีไฟฟ้าเพราะไม่เกี่ยวข้องกับกระแสไฟฟ้า) แบตเตอรี่ใช้แล้วให้ทิ้งในที่รองรับ</p></div>
  <div class="box"><h3>ตัวเลขที่ยกในคู่มือและหนังสือเรียน</h3><div class="tw"><table class="tbl-sm wide"><thead><tr><th class="l">เรื่อง</th><th class="l">ค่า</th><th>หน้า</th></tr></thead><tbody>
  <tr><td class="l">การเผาไหม้โพรเพน</td><td class="l">คาย 2220 kJ/mol (หนังสือเรียน)</td><td>หนังสือเรียน</td></tr>
  <tr><td class="l">กิจกรรม 4.1</td><td class="l">H<sub>2</sub>O<sub>2</sub> 3 %w/v ขวดละ 20 mL · น้ำยาล้างจานขวดละ 2 mL · KI อิ่มตัว 4–5 หยด · สังเกต 3 นาที</td><td>103–104</td></tr>
  <tr><td class="l">กิจกรรม 4.2</td><td class="l">ผง 0.1 g × 3 · เม็ด 0.1 g · กรด 5 mL ต่อใบ · HCl 7 %w/v ≈ 2 mol/L · HCl 1 %w/v ≈ 0.3 mol/L · อุ่นกรดประมาณ 60 °C</td><td>106–107</td></tr>
  <tr><td class="l">เวลาตัวอย่าง (วินาที)</td><td class="l">50 · 15 · 25 · &gt; 300</td><td>107</td></tr>
  <tr><td class="l">ครึ่งชีวิต</td><td class="l">Mo-99 3 วัน (10 → 5 → 2.5 g) · Na-24 15 ชั่วโมง · Os-182 21.5 ชั่วโมง · C-14 5730 ปี</td><td>118, 121, 117</td></tr>
  <tr><td class="l">ผลของรังสีช่วงต้น</td><td class="l">2 Gy · 8 Gy · &gt; 50 Gy</td><td>116</td></tr>
  <tr><td class="l">ปริมาณรังสีในชีวิตประจำวัน</td><td class="l">0.39 · 0.48 · 0.29 · 1.30 · 0.62 mSv ต่อปี (หนังสือเรียน หน้า 125)</td><td>หนังสือเรียน</td></tr>
  <tr><td class="l">เวลาที่คู่มือเสนอ</td><td class="l">บท 19 ชั่วโมง (4.1 เชื้อเพลิง 9 · 4.2 แบตเตอรี่ 2 · 4.3 สารกัมมันตรังสี 8)</td><td>97</td></tr></tbody></table></div></div>
  <div class="box"><h3>คำศัพท์สำคัญ (เรียบเรียงใหม่)</h3><ul><li><b>เชื้อเพลิง</b> สารตั้งต้นของปฏิกิริยาเผาไหม้</li><li><b>อัตราการเกิดปฏิกิริยา</b> ปริมาณสารที่เปลี่ยนต่อเวลา</li><li><b>เซลล์เคมีไฟฟ้า</b> อุปกรณ์ผลิตไฟฟ้าจากปฏิกิริยารีดอกซ์</li><li><b>กัมมันตภาพรังสี</b> ปรากฏการณ์ที่สารแผ่รังสี · <b>กัมมันตรังสี</b> คำขยายนามเช่น สารกัมมันตรังสี</li><li><b>ครึ่งชีวิต</b> เวลาที่เหลือครึ่งหนึ่ง</li></ul></div>`,
()=>{
  const sel=$('#eqs');
  function eq(){const e=EQS[+sel.value];$('#eqshow').innerHTML=e[0];
    const a=sumAtoms(e[1]),b=sumAtoms(e[2]),ks=Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort((x,y)=>{const o=['C','H','O'];const ix=o.indexOf(x),iy=o.indexOf(y);return(ix<0?9:ix)-(iy<0?9:iy)||(x<y?-1:1);});
    $('#eqtb').innerHTML=ks.map(k=>`<tr><td>${k}</td><td>${a[k]||0}</td><td>${b[k]||0}</td><td>${(a[k]||0)===(b[k]||0)?'<span class="ok-t">เท่ากัน</span>':'<span class="bad-t">ไม่เท่ากัน</span>'}</td></tr>`).join('');
    const ok=isBalanced(e[1],e[2]);const r=$('#eqres');r.className='res '+(ok?'ok':'bad');r.textContent=ok?'ดุลแล้ว จำนวนอะตอมทุกธาตุเท่ากัน':'ยังไม่ดุล ต้องปรับสัมประสิทธิ์ก่อน';}
  sel.onchange=eq;eq();
});
