import {decode,canvasOf,yahooURL} from './decoder.js';

const $=id=>document.getElementById(id);
const video=$('video'),view=$('viewfinder'),results=$('results'),panel=document.querySelector('.results-panel');
const prefs={get:(k,v)=>{try{return localStorage.getItem(k)??v}catch{return v}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};

let stream,generation=0,timer,audio,installPrompt,resultTimer;
let records=new Map(),seen=new Map(),latched=new Set(),mode='idle';
let sound=prefs.get('jan-sound','on')==='on';

const message=(s,e=false)=>{$('message').textContent=s;$('message').classList.toggle('error',e)};
const state=(s,a=false)=>{$('status-chip').textContent=s;$('status-chip').classList.toggle('active',a)};
const time=()=>new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
const googleURL=c=>'https://www.google.com/search?q='+encodeURIComponent('JAN '+c);

function unlock(){try{audio||=new(window.AudioContext||window.webkitAudioContext);audio.resume().catch(()=>{})}catch{}}
function chime(){
  if(!sound||!audio)return;const t=audio.currentTime;
  [740,988].forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.setValueAtTime(.001,t+i*.08);g.gain.linearRampToValueAtTime(.07,t+i*.08+.01);g.gain.exponentialRampToValueAtTime(.001,t+i*.08+.16);o.connect(g);g.connect(audio.destination);o.start(t+i*.08);o.stop(t+i*.08+.18)});
}
function setSound(){$('sound').setAttribute('aria-pressed',sound);$('sound').querySelector('span').textContent=`音 ${sound?'ON':'OFF'}`}
$('sound').onclick=()=>{sound=!sound;prefs.set('jan-sound',sound?'on':'off');unlock();setSound()};setSound();

$('help-open').onclick=()=>$('help').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());

function constraints(id){
  const p=matchMedia('(orientation:portrait)').matches,w=p?1080:1920,h=p?1440:1080;
  return {audio:false,video:{...(id?{deviceId:{exact:id}}:{facingMode:{ideal:'environment'}}),width:{ideal:w},height:{ideal:h},aspectRatio:{ideal:w/h}}};
}
function stop(reset=true){
  generation++;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;
  view.classList.remove('scanning');$('stop').disabled=true;$('camera').disabled=true;$('start').disabled=false;
  seen.clear();latched.clear();mode='idle';
  if(reset){$('photo-preview').hidden=true;$('placeholder').hidden=false;view.classList.remove('photo-mode');$('view-caption').textContent='8桁・13桁のバーコードに対応';state('待機中')}
  return generation;
}
$('stop').onclick=()=>{stop();message('停止しました。')};

async function start(id){
  const token=stop();mode='starting';unlock();$('start').disabled=true;$('stop').disabled=false;state('接続中');
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){stop();return message('カメラを使うにはHTTPSで開いてください。',true)}
  try{
    const s=await navigator.mediaDevices.getUserMedia(constraints(id));
    if(token!==generation){s.getTracks().forEach(t=>t.stop());return}
    stream=s;video.srcObject=s;video.hidden=false;await video.play();if(token!==generation)return;
    mode='live';$('placeholder').hidden=true;view.classList.add('scanning');state('スキャン中',true);
    $('view-caption').textContent='画面内にバーコードを映してください';message('バーコードを自動で読み取ります。');
    s.getVideoTracks()[0].onended=()=>token===generation&&(stop(),message('カメラとの接続が切れました。',true));
    try{
      const ds=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'),cam=$('camera');
      cam.replaceChildren(...ds.map((d,i)=>new Option(d.label||`カメラ ${i+1}`,d.deviceId)));
      cam.value=s.getVideoTracks()[0].getSettings().deviceId||'';cam.disabled=ds.length<2;
    }catch{}
    live(token);
  }catch(e){
    if(token!==generation)return;stop();
    message({NotAllowedError:'カメラが許可されていません。',NotFoundError:'カメラが見つかりません。',NotReadableError:'カメラを使用できません。'}[e.name]||'カメラの起動に失敗しました。',true);
  }
}

async function live(token){
  if(token!==generation||!stream)return;
  try{
    if(video.readyState>=2&&video.videoWidth){
      const found=await decode(canvasOf(video,1280));if(token!==generation)return;
      const now=Date.now(),cur=new Map(found.map(r=>[r.code,r]));
      for(const [code,r] of cur){
        const p=seen.get(code),hits=p&&now-p.time<2500?p.hits+1:1;seen.set(code,{hits,time:now});
        if(hits>=2&&!latched.has(code)){latched.add(code);addResult(r)}
      }
      for(const [code,s] of seen){if(!cur.has(code)&&now-s.time>1000)latched.delete(code);if(now-s.time>3000)seen.delete(code)}
    }
  }catch(e){if(token===generation){stop();message(e.message,true)}return}
  if(token===generation)timer=setTimeout(()=>live(token),180);
}

$('start').onclick=()=>start();
$('camera').onchange=()=>start($('camera').value);

function focus(card){
  clearTimeout(resultTimer);document.querySelectorAll('.result-card.current').forEach(e=>e.classList.remove('current'));
  card.classList.add('current');panel?.classList.add('result-focus');state('読み取り成功',true);
  resultTimer=setTimeout(()=>{card.classList.remove('current');panel?.classList.remove('result-focus');if(mode==='live')state('スキャン中',true)},2500);
}
function flash(){
  const f=$('success-flash');f.classList.remove('flash');void f.offsetWidth;f.classList.add('flash');chime();
}

function addResult(r){
  let card=results.querySelector(`[data-code="${r.code}"]`);
  if(card){
    records.set(r.code,r);card.querySelector('.evidence').src=r.image;
    card.querySelector('.evidence-label').textContent=`検出部分 · カメラ · ${time()}`;
    results.prepend(card);flash();focus(card);return;
  }
  if(records.size===60){const old=records.keys().next().value;records.delete(old);results.querySelector(`[data-code="${old}"]`)?.remove()}
  if(!records.size)results.replaceChildren();records.set(r.code,r);

  card=document.createElement('article');card.className='result-card';card.dataset.code=r.code;
  card.innerHTML=`<div class="result-meta">JAN-${r.code.length} · チェックデジット確認済み</div><h3 class="result-code">${r.code}</h3><img class="evidence" alt="${r.code}を読み取ったバーコード部分"><p class="evidence-label">検出部分 · カメラ · ${time()}</p><div class="result-actions"></div>`;
  card.querySelector('.evidence').src=r.image;

  const a=card.querySelector('.result-actions'),y=document.createElement('a'),g=document.createElement('a'),c=document.createElement('button');
  Object.assign(y,{href:yahooURL(r.code),target:'_blank',rel:'noopener',className:'yahoo-link',textContent:'Yahoo!で商品を見る'});
  Object.assign(g,{href:googleURL(r.code),target:'_blank',rel:'noopener',className:'google-link',textContent:'Googleで検索する'});
  c.className='copy-button';c.textContent='コピー';
  c.onclick=async()=>{try{await navigator.clipboard.writeText(r.code);c.textContent='コピー済み';setTimeout(()=>c.textContent='コピー',1500)}catch{message('コピーできませんでした。',true)}};

  a.append(y,g,c);results.prepend(card);$('count').textContent=records.size;$('clear').disabled=false;flash();focus(card);
}

const emptyMarkup=results.innerHTML;
$('clear').onclick=()=>{records.clear();seen.clear();latched.clear();results.innerHTML=emptyMarkup;$('count').textContent='0';$('clear').disabled=true;message('読み取り結果を消去しました。')};

document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='live'||mode==='starting')){stop();message('画面を離れたため停止しました。')}});
addEventListener('pagehide',()=>stop());
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null}else $('install-help').showModal()};
if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
if(!window.Quagga)message('読み取りエンジンを準備できませんでした。再読み込みしてください。',true);