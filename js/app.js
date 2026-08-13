(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('editorCanvas'), ctx = canvas.getContext('2d', { alpha: true });
  const viewport = $('viewport');
  const MODEL = window.PixelMaskModel;
  const COLORS = ['#ef5b67','#f1a24c','#f4d35e','#63d29d','#3fa7d6','#667eea','#a66dd4','#e277c4','#a98563','#74c0b8','#b9c46a','#e2875a'];
  const DEFAULT_PARTS = ['輪郭','髪','顔','胴体・服','前腕','後腕','下半身','装備'];
  const state = {
    width: 0, height: 0, rgba: null, alpha: null, sourceCanvas: document.createElement('canvas'), sourceName: 'バッツ戦闘待機',
    assignments: null, parts: DEFAULT_PARTS.map((name,i)=>({id:i,name,color:COLORS[i]})), activePart: 0,
    tool: 'pen', zoom: 16, sourceOpacity: 1, maskVisible: true, selectedOnly: false, grid: true,
    undo: [], redo: [], drawing: false, gesture: null, pointers: new Map(), saveTimer: 0
  };
  const STORAGE_KEY = 'pixel-mask-part-editor-v01';

  function loadImage(src, name, restoredAssignments) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 128 || img.naturalHeight > 128) return reject(new Error('128×128以下のPNGを使用してください'));
        state.width = img.naturalWidth; state.height = img.naturalHeight; state.sourceName = name;
        state.sourceCanvas.width = state.width; state.sourceCanvas.height = state.height;
        const sctx = state.sourceCanvas.getContext('2d', { willReadFrequently:true });
        sctx.clearRect(0,0,state.width,state.height); sctx.drawImage(img,0,0);
        const data = sctx.getImageData(0,0,state.width,state.height); state.rgba = data.data;
        state.alpha = new Uint8Array(state.width*state.height);
        for(let i=0;i<state.alpha.length;i++) state.alpha[i]=state.rgba[i*4+3];
        state.assignments = restoredAssignments && restoredAssignments.length===state.alpha.length ? Int16Array.from(restoredAssignments) : MODEL.createAssignments(state.alpha);
        state.undo=[]; state.redo=[]; fitCanvas(); render(); renderParts(); updateStats(); resolve();
      };
      img.onerror = () => reject(new Error('PNGを読み込めませんでした'));
      img.src = src;
    });
  }

  function fitCanvas() {
    canvas.width = state.width * state.zoom; canvas.height = state.height * state.zoom;
    $('zoomLabel').value = `${state.zoom}×`; $('imageName').textContent = state.sourceName; $('imageSize').textContent = `${state.width} × ${state.height}`;
  }

  function render() {
    if (!state.rgba) return;
    const z=state.zoom; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#9b979f'; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(state.sourceOpacity>0){ctx.globalAlpha=state.sourceOpacity;ctx.drawImage(state.sourceCanvas,0,0,canvas.width,canvas.height);ctx.globalAlpha=1;}
    if(state.maskVisible){
      for(let i=0;i<state.assignments.length;i++){
        const p=state.assignments[i]; if(p<0 || (state.selectedOnly&&p!==state.activePart)) continue;
        ctx.globalAlpha=.58;ctx.fillStyle=state.parts[p]?.color||'#fff';ctx.fillRect((i%state.width)*z,((i/state.width)|0)*z,z,z);
      } ctx.globalAlpha=1;
    }
    if(state.grid && z>=8){ctx.strokeStyle='rgba(33,29,37,.26)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=state.width;x++){ctx.moveTo(x*z+.5,0);ctx.lineTo(x*z+.5,canvas.height)}for(let y=0;y<=state.height;y++){ctx.moveTo(0,y*z+.5);ctx.lineTo(canvas.width,y*z+.5)}ctx.stroke();}
  }

  function updateStats(){const s=MODEL.stats(state.assignments||[]);$('unassignedCount').textContent=s.unassigned;$('assignedCount').textContent=s.assigned;$('overlapCount').textContent=s.overlap;$('diffCount').textContent=s.diff;renderParts();}
  function partCounts(){const c=Array(state.parts.length).fill(0);for(const v of state.assignments||[])if(v>=0&&c[v]!=null)c[v]++;return c;}
  function renderParts(){const counts=partCounts();$('partsList').innerHTML=state.parts.map((p,i)=>`<button class="part-chip ${i===state.activePart?'active':''}" data-part="${i}"><span class="swatch" style="background:${p.color}"></span><span class="part-text"><b>${escapeHtml(p.name)}</b><small>${counts[i]||0} px</small></span></button>`).join('');}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function snapshot(){state.undo.push(Int16Array.from(state.assignments));if(state.undo.length>80)state.undo.shift();state.redo=[];}
  function scheduleSave(){clearTimeout(state.saveTimer);$('saveState').textContent='保存中…';state.saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({source:state.sourceCanvas.toDataURL('image/png'),sourceName:state.sourceName,width:state.width,height:state.height,assignments:Array.from(state.assignments),parts:state.parts,activePart:state.activePart}));$('saveState').textContent='端末内に自動保存済み';}catch(e){$('saveState').textContent='自動保存できませんでした';}},250);}
  function eventPixel(e){const r=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)*canvas.width/r.width/state.zoom),y=Math.floor((e.clientY-r.top)*canvas.height/r.height/state.zoom);if(x<0||x>=state.width||y<0||y>=state.height)return-1;return y*state.width+x;}
  function colorLabel(index){const p=index*4;return `RGBA(${state.rgba[p]}, ${state.rgba[p+1]}, ${state.rgba[p+2]}, ${state.rgba[p+3]})`;}
  function setFeedback(message){$('toolFeedback').textContent=message;}
  function applyAt(index, first=false){
    if(index<0||state.assignments[index]===-2)return;
    if(first)snapshot();
    if(state.tool==='pick'){
      const p=state.assignments[index];
      if(p>=0){state.activePart=p;renderParts();render();setFeedback(`パーツ取得：「${state.parts[p].name}」を選択しました。`);}
      else setFeedback('このドットはまだ未分類です。');
      return;
    }
    let changed=0;
    if(state.tool==='fill') changed=MODEL.floodSameColor(state.assignments,state.rgba,state.width,state.height,index,state.activePart);
    else if(state.tool==='eyedrop'){
      changed=MODEL.eyedropAdjacentSameColor(state.assignments,state.rgba,state.width,state.height,index,state.activePart);
      setFeedback(`同色スポイト：${colorLabel(index)} の隣接 ${changed} pxを「${state.parts[state.activePart].name}」へ割り当てました。`);
    } else changed=MODEL.assign(state.assignments,index,state.tool==='erase'?-1:state.activePart)?1:0;
    render();updateStats();scheduleSave();
  }

  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1){state.drawing=true;applyAt(eventPixel(e),true);}else if(state.pointers.size===2){state.drawing=false;const a=[...state.pointers.values()];state.gesture={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:state.zoom,centerX:(a[0].x+a[1].x)/2,centerY:(a[0].y+a[1].y)/2,scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop};}});
  canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1&&state.drawing&&!['fill','eyedrop','pick'].includes(state.tool))applyAt(eventPixel(e));else if(state.pointers.size===2&&state.gesture){const a=[...state.pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2,newZoom=Math.max(8,Math.min(28,Math.round(state.gesture.zoom*d/state.gesture.distance)));if(newZoom!==state.zoom){state.zoom=newZoom;fitCanvas();render();}viewport.scrollLeft=state.gesture.scrollLeft-(cx-state.gesture.centerX);viewport.scrollTop=state.gesture.scrollTop-(cy-state.gesture.centerY);}});
  const endPointer=e=>{state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drawing=false;state.gesture=null;}};canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);

  const TOOL_HELP={pen:'ペン：1ドットずつ選択パーツへ割り当てます。',fill:'同色塗り：同じ割当状態でつながる完全同色領域を塗ります。',eyedrop:'同色スポイト：上下左右につながる完全同色を、現在の割当に関係なく選択パーツへまとめます。',erase:'未分類へ：触れたドットを未分類へ戻します。',pick:'パーツ取得：触れたドットが所属するパーツを選択します。'};
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.tool=b.dataset.tool;setFeedback(TOOL_HELP[state.tool]);}));
  $('partsList').addEventListener('click',e=>{const b=e.target.closest('[data-part]');if(!b)return;state.activePart=+b.dataset.part;renderParts();render();scheduleSave();});
  $('sourceOpacity').addEventListener('input',e=>{state.sourceOpacity=+e.target.value/100;render();});
  $('maskVisible').addEventListener('change',e=>{state.maskVisible=e.target.checked;render();});$('selectedOnly').addEventListener('change',e=>{state.selectedOnly=e.target.checked;render();});$('gridVisible').addEventListener('change',e=>{state.grid=e.target.checked;render();});
  function setZoom(v){state.zoom=Math.max(8,Math.min(28,v));fitCanvas();render();}
  $('zoomOut').onclick=()=>setZoom(state.zoom-2);$('zoomIn').onclick=()=>setZoom(state.zoom+2);$('centerBtn').onclick=()=>{viewport.scrollLeft=Math.max(0,(canvas.width-viewport.clientWidth)/2);viewport.scrollTop=Math.max(0,(canvas.height-viewport.clientHeight)/2);};
  $('undoBtn').onclick=()=>{if(!state.undo.length)return;state.redo.push(Int16Array.from(state.assignments));state.assignments=state.undo.pop();render();updateStats();scheduleSave();};
  $('redoBtn').onclick=()=>{if(!state.redo.length)return;state.undo.push(Int16Array.from(state.assignments));state.assignments=state.redo.pop();render();updateStats();scheduleSave();};
  $('addPartBtn').onclick=()=>{const name=prompt('追加するパーツ名');if(!name)return;state.parts.push({id:state.parts.length,name:name.trim(),color:COLORS[state.parts.length%COLORS.length]});state.activePart=state.parts.length-1;renderParts();scheduleSave();};
  $('renamePartBtn').onclick=()=>{const p=state.parts[state.activePart],name=prompt('パーツ名',p.name);if(!name)return;p.name=name.trim();renderParts();scheduleSave();};
  $('resetBtn').onclick=()=>{if(!confirm('すべてのマスク割当を未分類へ戻しますか？'))return;snapshot();state.assignments=MODEL.createAssignments(state.alpha);render();updateStats();scheduleSave();};
  $('fileInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;const src=await fileToDataURL(f);await loadImage(src,f.name);scheduleSave();});
  $('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('previewBtn').onclick=showPreview;$('closePreview').onclick=()=>$('previewDialog').close();

  function drawSourceTo(c, assignedOnly){c.width=state.width;c.height=state.height;const cctx=c.getContext('2d'),out=cctx.createImageData(state.width,state.height);for(let i=0;i<state.assignments.length;i++){const keep=!assignedOnly||state.assignments[i]>=0;if(keep)for(let k=0;k<4;k++)out.data[i*4+k]=state.rgba[i*4+k];}cctx.putImageData(out,0,0);}
  function showPreview(){drawSourceTo($('sourcePreview'),false);drawSourceTo($('recomposePreview'),true);const s=MODEL.validate(state.assignments);$('previewMessage').textContent=s.exportReady?'原画と完全一致しています。':'未分類ピクセルがあるため、再合成差は '+s.diff+' です。';$('previewDialog').showModal();}
  const fileToDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  const canvasBlob=c=>new Promise(resolve=>c.toBlob(resolve,'image/png'));
  function outputCanvas(filter,colorMap=false){const c=document.createElement('canvas');c.width=state.width;c.height=state.height;const x=c.getContext('2d'),d=x.createImageData(state.width,state.height);for(let i=0;i<state.assignments.length;i++){if(!filter(i))continue;if(colorMap){const col=hexToRgb(state.parts[state.assignments[i]].color);d.data.set([...col,255],i*4);}else d.data.set(state.rgba.slice(i*4,i*4+4),i*4);}x.putImageData(d,0,0);return c;}
  function hexToRgb(h){return[h.slice(1,3),h.slice(3,5),h.slice(5,7)].map(x=>parseInt(x,16));}

  $('exportBtn').onclick=async()=>{try{$('exportBtn').disabled=true;$('exportBtn').textContent='ZIPを作成中…';const validation=MODEL.validate(state.assignments),files=[];files.push(['source.png',await canvasBlob(outputCanvas(()=>true))]);files.push(['assignment.png',await canvasBlob(outputCanvas(i=>state.assignments[i]>=0,true))]);files.push(['recomposed.png',await canvasBlob(outputCanvas(i=>state.assignments[i]>=0))]);for(let p=0;p<state.parts.length;p++)files.push([`layers/${safeName(state.parts[p].name)}.png`,await canvasBlob(outputCanvas(i=>state.assignments[i]===p))]);const masks={schema_version:'1.0',width:state.width,height:state.height,parts:state.parts,assignments:Array.from(state.assignments)};files.push(['masks.json',new Blob([JSON.stringify(masks,null,2)],{type:'application/json'})]);files.push(['validation.json',new Blob([JSON.stringify({schema_version:'1.0',quality_approved:false,manual_review:'pending',...validation},null,2)],{type:'application/json'})]);const zip=await makeZip(files),url=URL.createObjectURL(zip),a=document.createElement('a');a.href=url;a.download='character_parts.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}catch(e){alert('書き出しに失敗しました: '+e.message);}finally{$('exportBtn').disabled=false;$('exportBtn').textContent='分解ZIPを書き出す';}};
  const safeName=s=>String(s).trim().replace(/[\\/:*?"<>|\s]+/g,'_')||'part';

  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  async function makeZip(entries){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const[name,blob]of entries){const n=enc.encode(name),data=new Uint8Array(await blob.arrayBuffer()),crc=crc32(data),lh=new Uint8Array(30+n.length),dv=new DataView(lh.buffer);dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);dv.setUint16(26,n.length,true);lh.set(n,30);local.push(lh,data);const ch=new Uint8Array(46+n.length),cd=new DataView(ch.buffer);cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint32(16,crc,true);cd.setUint32(20,data.length,true);cd.setUint32(24,data.length,true);cd.setUint16(28,n.length,true);cd.setUint32(42,offset,true);ch.set(n,46);central.push(ch);offset+=lh.length+data.length;}const centralSize=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array(22),ed=new DataView(end.buffer);ed.setUint32(0,0x06054b50,true);ed.setUint16(8,entries.length,true);ed.setUint16(10,entries.length,true);ed.setUint32(12,centralSize,true);ed.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});}

  async function init(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(saved?.source){state.parts=saved.parts||state.parts;state.activePart=Math.min(saved.activePart||0,state.parts.length-1);await loadImage(saved.source,saved.sourceName||'復元画像',saved.assignments);}else await loadImage('assets/bartz_battle_native_16x24.png','バッツ戦闘待機');setTimeout(()=>$('centerBtn').click(),50);}catch(e){console.error(e);await loadImage('assets/bartz_battle_native_16x24.png','バッツ戦闘待機');}}
  init();
})();
