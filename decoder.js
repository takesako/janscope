// Quagga2 is bundled locally. Only EAN-8 and EAN-13 readers are enabled.
export function validJAN(value) {
  if (!/^(?:\d{8}|\d{13})$/.test(value)) return false;
  let sum = 0;
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) sum += Number(value[i]) * weight;
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}
export const yahooURL = code => validJAN(code) ? `https://shopping.yahoo.co.jp/product/j/${code}/compare.html` : '';
export function canvasOf(source, max = 1280, crop) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  const [x,y,w,h] = crop || [0,0,width,height];
  const scale = Math.min(1, max / Math.max(w,h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(source,x,y,w,h,0,0,canvas.width,canvas.height);
  return canvas;
}
// Serialize decodeSingle: Quagga owns a single shared decoder instance.
let queue = Promise.resolve();
let wasmReady=false;
export async function decode(canvas, patchSize = 'medium') {
  if(window.ZXingWASM){
    if(!wasmReady){ZXingWASM.prepareZXingModule({overrides:{locateFile:path=>new URL('./vendor/'+path,import.meta.url).href}});wasmReady=true;}
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    const decoded=await ZXingWASM.readBarcodes(pixels,{formats:['EAN-8','EAN-13'],tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:64});
    const found=decoded.filter(r=>validJAN(r.text)).map(r=>{
      const p=r.position;const box=[p.topLeft,p.topRight,p.bottomRight,p.bottomLeft].map(p=>[p.x,p.y]);
      return {code:r.text,image:evidence(canvas,{box}),box};
    });
    if(found.length)return found;
  }
  const found = await decodeOnce(canvas, patchSize);
  return found.length ? found : decodeOnce(canvas, 'large');
}
function decodeOnce(canvas, patchSize) {
  const task = queue.then(() => new Promise((resolve,reject) => {
    if (!window.Quagga) { reject(new Error('読み取りエンジンを読み込めませんでした。ページを再読み込みしてください。')); return; }
    try {
      const pending = Quagga.decodeSingle({ src: canvas.toDataURL('image/png'), numOfWorkers:0, locate:true,
        inputStream:{size:0}, locator:{patchSize,halfSample:false},
        decoder:{readers:['ean_8_reader','ean_reader'],multiple:true} }, result => {
        try {
          const data = (Array.isArray(result) ? result : [result]).filter(r => r?.codeResult && validJAN(r.codeResult.code));
          // This is the exact (possibly alignment-cropped) frame used for this decode.
          const actual = Quagga.canvas?.dom?.image;
          const frame = actual?.width ? actual : canvas;
          resolve(data.map(r => ({code:r.codeResult.code, image:evidence(frame,r), box:r.box})));
        } catch(error) { reject(error); }
      });
      pending?.catch(reject);
    } catch(error) { reject(error); }
  }));
  queue = task.catch(() => {});
  return task;
}
function evidence(frame,result) {
  let points = result.box;
  if (!points?.length && result.line?.length) points = result.line.map(p => [p.x,p.y]);
  if (!points?.length) return frame.toDataURL('image/jpeg',.88);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const bw=maxX-minX,bh=maxY-minY;
  const px=Math.max(14,bw>=bh?bw*.12:bh*.30),py=Math.max(14,bh>bw?bh*.12:bw*.30);
  const x=Math.max(0,Math.floor(minX-px)),y=Math.max(0,Math.floor(minY-py));
  const w=Math.min(frame.width-x,Math.ceil(maxX+px)-x),h=Math.min(frame.height-y,Math.ceil(maxY+py)-y);
  const crop=canvasOf(frame,900,[x,y,w,h]);
  if(bh>bw){const turned=document.createElement('canvas');turned.width=crop.height;turned.height=crop.width;const ctx=turned.getContext('2d');ctx.translate(turned.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(crop,0,0);return turned.toDataURL('image/jpeg',.92);}
  return crop.toDataURL('image/jpeg',.92);
}
