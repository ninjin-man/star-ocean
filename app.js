(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('editorCanvas'), ctx = canvas.getContext('2d', { alpha: true });
  const viewport = $('viewport');
  const MODEL = window.PixelMaskModel;
  const CV = window.PixelMaskCV;
  const COLORS = ['#ef5b67','#f1a24c','#f4d35e','#63d29d','#3fa7d6','#667eea','#a66dd4','#e277c4','#a98563','#74c0b8','#b9c46a','#e2875a'];
  const DEFAULT_PARTS = ['輪郭','髪','顔','胴体・服','前腕','後腕','下半身','装備'];
  const state = {
    width: 0, height: 0, rgba: null, alpha: null, sourceCanvas: document.createElement('canvas'), sourceName: 'バッツ戦闘待機',
    hasSource: false,
    assignments: null, parts: DEFAULT_PARTS.map((name,i)=>({id:i,name,color:COLORS[i]})), activePart: 0,
    tool: 'assist', zoom: 16, sourceOpacity: 1, maskVisible: true, selectedOnly: false, grid: true, showUnassigned: true, focusPixel: -1,
    undo: [], redo: [], drawing: false, gesture: null, pointers: new Map(), saveTimer: 0,
    preview: null, rangeDraft: null, assistArmed: false, cvReady: false
  };
  const STORAGE_KEY = 'pixel-mask-part-editor-v03';

  function setLoadState(message, error=false){$('loadState').textContent=message;$('loadState').classList.toggle('error',error);}
  function setSourceReady(ready){state.hasSource=ready;$('emptyCanvas').classList.toggle('hidden',ready);$('sourceBadge').textContent=ready?'読込済み':'未読込';$('sourceBadge').classList.toggle('empty',!ready);$('exportBtn').disabled=!ready;$('assistRun').disabled=!ready;}

  function initEmptyCanvas(){
    state.width=32;state.height=32;state.sourceName='画像未読込';state.sourceCanvas.width=32;state.sourceCanvas.height=32;
    state.rgba=new Uint8ClampedArray(32*32*4);state.alpha=new Uint8Array(32*32);state.assignments=MODEL.createAssignments(state.alpha);
    state.undo=[];state.redo=[];setSourceReady(false);fitCanvas();render();renderParts();updateStats();
  }

  function loadImage(src, name, restoredAssignments) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 128 || img.naturalHeight > 128) return reject(new Error('128×128以下のPNGを使用してください'));
        if (!img.naturalWidth || !img.naturalHeight) return reject(new Error('画像サイズを取得できませんでした'));
        state.width = img.naturalWidth; state.height = img.naturalHeight; state.sourceName = name;
        state.sourceCanvas.width = state.width; state.sourceCanvas.height = state.height;
        const sctx = state.sourceCanvas.getContext('2d', { willReadFrequently:true });
        sctx.clearRect(0,0,state.width,state.height); sctx.drawImage(img,0,0);
        const data = sctx.getImageData(0,0,state.width,state.height); state.rgba = data.data;
        state.alpha = new Uint8Array(state.width*state.height);
        for(let i=0;i<state.alpha.length;i++) state.alpha[i]=state.rgba[i*4+3];
        state.assignments = restoredAssignments && restoredAssignments.length===state.alpha.length ? Int16Array.from(restoredAssignments) : MODEL.createAssignments(state.alpha);
        state.undo=[]; state.redo=[];state.preview=null;state.rangeDraft=null;state.assistArmed=state.tool==='assist';setSourceReady(true);fitCanvas(); render(); renderParts(); updateStats();setLoadState(`${name} を読み込みました（${state.width} × ${state.height}）`);resolve();
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
    if(!state.hasSource){
      ctx.strokeStyle='rgba(51,47,56,.35)';ctx.lineWidth=1;ctx.beginPath();
      for(let x=0;x<=state.width;x++){ctx.moveTo(x*z+.5,0);ctx.lineTo(x*z+.5,canvas.height)}
      for(let y=0;y<=state.height;y++){ctx.moveTo(0,y*z+.5);ctx.lineTo(canvas.width,y*z+.5)}ctx.stroke();return;
    }
    if(state.sourceOpacity>0){ctx.globalAlpha=state.sourceOpacity;ctx.drawImage(state.sourceCanvas,0,0,canvas.width,canvas.height);ctx.globalAlpha=1;}
    if(state.maskVisible){
      for(let i=0;i<state.assignments.length;i++){
        const p=state.assignments[i]; if(p<0 || (state.selectedOnly&&p!==state.activePart)) continue;
        ctx.globalAlpha=.58;ctx.fillStyle=state.parts[p]?.color||'#fff';ctx.fillRect((i%state.width)*z,((i/state.width)|0)*z,z,z);
      } ctx.globalAlpha=1;
    }
    if(state.showUnassigned){
      ctx.globalAlpha=.2;ctx.fillStyle='#ffe34f';
      for(let i=0;i<state.assignments.length;i++)if(state.assignments[i]===-1)ctx.fillRect((i%state.width)*z,((i/state.width)|0)*z,z,z);
      ctx.globalAlpha=1;
    }
    if(state.preview){
      const paintPreview=(mask,color,alpha=.78)=>{if(!mask)return;ctx.globalAlpha=alpha;ctx.fillStyle=color;for(let i=0;i<mask.length;i++)if(mask[i])ctx.fillRect((i%state.width)*z,((i/state.width)|0)*z,z,z);ctx.globalAlpha=1;};
      paintPreview(state.preview.mask,state.preview.kind==='contour'?'#38e8ff':'#ffe34f');
      paintPreview(state.preview.add,'#ffe34f');
      paintPreview(state.preview.remove,'#ff4fa3');
    }
    if(state.focusPixel>=0&&state.assignments[state.focusPixel]===-1){const x=(state.focusPixel%state.width)*z,y=((state.focusPixel/state.width)|0)*z;ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,Math.floor(z/6));ctx.strokeRect(x+1,y+1,z-2,z-2);}
    if(state.grid && z>=8){ctx.strokeStyle='rgba(33,29,37,.26)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=state.width;x++){ctx.moveTo(x*z+.5,0);ctx.lineTo(x*z+.5,canvas.height)}for(let y=0;y<=state.height;y++){ctx.moveTo(0,y*z+.5);ctx.lineTo(canvas.width,y*z+.5)}ctx.stroke();}
    if(state.rangeDraft){
      ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,Math.floor(z/7));ctx.setLineDash([Math.max(4,z/2),Math.max(3,z/3)]);ctx.beginPath();
      if(state.rangeDraft.type==='rect'){
        const a=state.rangeDraft.start,b=state.rangeDraft.end,x0=Math.min(a%state.width,b%state.width)*z,y0=Math.min((a/state.width)|0,(b/state.width)|0)*z,x1=(Math.max(a%state.width,b%state.width)+1)*z,y1=(Math.max((a/state.width)|0,(b/state.width)|0)+1)*z;ctx.rect(x0+1,y0+1,x1-x0-2,y1-y0-2);
      }else{
        const points=state.rangeDraft.points;if(points.length){ctx.moveTo((points[0].x+.5)*z,(points[0].y+.5)*z);for(let i=1;i<points.length;i++)ctx.lineTo((points[i].x+.5)*z,(points[i].y+.5)*z);}
      }
      ctx.stroke();ctx.setLineDash([]);
    }
  }

  function updateStats(){const s=MODEL.stats(state.assignments||[]),total=s.assigned+s.unassigned,pct=total?Math.round(s.assigned/total*100):0;$('unassignedCount').textContent=s.unassigned;$('assignedCount').textContent=s.assigned;$('overlapCount').textContent=s.overlap;$('diffCount').textContent=s.diff;$('progressText').textContent=`${pct}%`;$('progressBar').style.width=`${pct}%`;renderParts();}
  function partCounts(){const c=Array(state.parts.length).fill(0);for(const v of state.assignments||[])if(v>=0&&c[v]!=null)c[v]++;return c;}
  function renderParts(){const counts=partCounts(),active=state.parts[state.activePart];$('partsList').innerHTML=state.parts.map((p,i)=>`<button class="part-chip ${i===state.activePart?'active':''}" data-part="${i}"><span class="swatch" style="background:${p.color}"></span><span class="part-text"><b>${escapeHtml(p.name)}</b><small>${counts[i]||0} px</small></span></button>`).join('');if(active){$('currentPartName').textContent=active.name;$('currentPartSwatch').style.background=active.color;}}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function snapshot(){state.undo.push(Int16Array.from(state.assignments));if(state.undo.length>80)state.undo.shift();state.redo=[];}
  function scheduleSave(){clearTimeout(state.saveTimer);$('saveState').textContent='保存中…';state.saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({source:state.sourceCanvas.toDataURL('image/png'),sourceName:state.sourceName,width:state.width,height:state.height,assignments:Array.from(state.assignments),parts:state.parts,activePart:state.activePart}));$('saveState').textContent='端末内に自動保存済み';}catch(e){$('saveState').textContent='自動保存できませんでした';}},250);}
  function eventPixel(e){const r=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)*canvas.width/r.width/state.zoom),y=Math.floor((e.clientY-r.top)*canvas.height/r.height/state.zoom);if(x<0||x>=state.width||y<0||y>=state.height)return-1;return y*state.width+x;}
  function pixelPoint(index){return{x:index%state.width,y:(index/state.width)|0};}
  function colorLabel(index){const p=index*4;return `RGBA(${state.rgba[p]}, ${state.rgba[p+1]}, ${state.rgba[p+2]}, ${state.rgba[p+3]})`;}
  function setFeedback(message){$('toolFeedback').textContent=message;}
  async function applyAt(index, first=false){
    if(index<0||state.assignments[index]===-2)return;
    if(state.tool==='assist'){
      if(!state.assistArmed){setAssistGuide('「キャンバスで色を選ぶ」を押してから起点をタップしてください。');return;}
      await previewSeedSelection(index);return;
    }
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

  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1){state.drawing=true;const index=eventPixel(e);if(['rect','lasso'].includes(state.tool)&&index>=0){state.rangeDraft=state.tool==='rect'?{type:'rect',start:index,end:index}:{type:'lasso',points:[pixelPoint(index)]};render();setAssistGuide(state.tool==='rect'?'選びたい範囲の端まで指を動かしてください。':'選びたい形の外側を指で囲んでください。');}else applyAt(index,true);}else if(state.pointers.size===2){state.drawing=false;state.rangeDraft=null;render();const a=[...state.pointers.values()];state.gesture={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:state.zoom,centerX:(a[0].x+a[1].x)/2,centerY:(a[0].y+a[1].y)/2,scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop};}});
  canvas.addEventListener('pointermove',e=>{if(!state.pointers.has(e.pointerId))return;state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pointers.size===1&&state.drawing){const index=eventPixel(e);if(state.tool==='rect'&&state.rangeDraft&&index>=0){state.rangeDraft.end=index;render();}else if(state.tool==='lasso'&&state.rangeDraft&&index>=0){const point=pixelPoint(index),last=state.rangeDraft.points[state.rangeDraft.points.length-1];if(!last||last.x!==point.x||last.y!==point.y){state.rangeDraft.points.push(point);render();}}else if(!['fill','eyedrop','assist','pick'].includes(state.tool))applyAt(index);}else if(state.pointers.size===2&&state.gesture){const a=[...state.pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2,newZoom=Math.max(8,Math.min(28,Math.round(state.gesture.zoom*d/state.gesture.distance)));if(newZoom!==state.zoom){state.zoom=newZoom;fitCanvas();render();}viewport.scrollLeft=state.gesture.scrollLeft-(cx-state.gesture.centerX);viewport.scrollTop=state.gesture.scrollTop-(cy-state.gesture.centerY);}});
  canvas.addEventListener('pointerup',e=>{if(state.pointers.size===1&&state.drawing&&state.rangeDraft){const index=eventPixel(e);if(state.rangeDraft.type==='rect'&&index>=0)state.rangeDraft.end=index;else if(state.rangeDraft.type==='lasso'&&index>=0)state.rangeDraft.points.push(pixelPoint(index));finalizeRangeSelection();}state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drawing=false;state.gesture=null;}});
  canvas.addEventListener('pointercancel',e=>{state.rangeDraft=null;state.pointers.delete(e.pointerId);if(!state.pointers.size){state.drawing=false;state.gesture=null;}render();});

  const TOOL_HELP={pen:'1ドット追加：細部を指でなぞって現在のパーツへ追加します。',fill:'同色塗り：同じ割当状態でつながる完全同色領域を塗ります。',assist:'色をまとめて：画像をタップすると、つながった近い色を黄色候補にします。',rect:'四角で囲む：指を斜めに動かして四角い範囲を指定します。',lasso:'指で囲む：パーツの外側を指でなぞって囲みます。',erase:'1ドット除外：指でなぞった部分を未分類へ戻します。',pick:'所属を確認：触れたドットのパーツを現在の選択先にします。'};
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{if(state.preview)cancelAssistPreview();state.rangeDraft=null;document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.tool=b.dataset.tool;if(state.tool==='assist'&&!['exact','approx'].includes($('assistMode').value)){$('assistMode').value='approx';setAssistModeUI();}state.assistArmed=state.tool==='assist';const bulk=['assist','rect','lasso'].includes(state.tool);$('quickSelectOptions').classList.toggle('hidden',!bulk);$('colorOptions').classList.toggle('hidden',state.tool!=='assist');setFeedback(TOOL_HELP[state.tool]);setAssistGuide(TOOL_HELP[state.tool]);render();}));

  const maskCount=mask=>mask?mask.reduce((sum,v)=>sum+(v?1:0),0):0;
  function prepareAssignMask(mask){
    if($('onlyUnassigned').checked)for(let i=0;i<mask.length;i++)if(state.assignments[i]!==-1)mask[i]=0;
    if(state.preview?.kind==='assign')for(let i=0;i<mask.length;i++)if(state.preview.mask[i])mask[i]=1;
    return mask;
  }
  function finalizeRangeSelection(){
    const draft=state.rangeDraft;state.rangeDraft=null;if(!draft)return;
    let mask;
    if(draft.type==='rect')mask=MODEL.rectVisibleMask(state.alpha,state.width,state.height,draft.start,draft.end);
    else mask=MODEL.polygonVisibleMask(state.alpha,state.width,state.height,draft.points);
    prepareAssignMask(mask);
    const count=maskCount(mask);
    if(!count){render();setAssistGuide('範囲内に追加できる未分類ピクセルがありません。');return;}
    state.preview={kind:'assign',mask};render();showPreviewActions(true,`黄色 ${count} pxを確定`);
    setAssistGuide(`黄色の ${count} pxが候補です。別の範囲も続けて囲むと追加できます。`);
  }
  function setAssistGuide(message){$('assistGuide').textContent=message;}
  function activateAssistTool(){document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('active',x.dataset.tool==='assist'));state.tool='assist';setFeedback(TOOL_HELP.assist);}
  function showPreviewActions(canConfirm=true,confirmLabel='候補を確定'){$('previewActions').classList.remove('hidden');$('confirmAssist').classList.toggle('hidden',!canConfirm);$('confirmAssist').textContent=confirmLabel;}
  function cancelAssistPreview(){state.preview=null;state.rangeDraft=null;state.assistArmed=state.tool==='assist'&&['exact','approx'].includes($('assistMode').value);$('previewActions').classList.add('hidden');render();setAssistModeUI();if(state.tool!=='assist')setAssistGuide(TOOL_HELP[state.tool]);}
  function setAssistModeUI(){
    const mode=$('assistMode').value,seed=['exact','approx'].includes(mode);
    $('toleranceRow').classList.toggle('hidden',mode!=='approx');$('orphanRow').classList.toggle('hidden',mode!=='orphan');
    $('assistRun').textContent=seed?'キャンバスで色を選ぶ':'候補を表示';
    const guides={exact:'完全同色を上下左右の隣接だけ選択します。',approx:'許容値内の近似色を上下左右の隣接だけ選択します。',orphan:'選択パーツ内の小さな連結領域を黄色で表示します。',contour:'選択パーツの外周を水色で表示します。',open:'細い突起や小領域を除く候補です。削除候補はピンクで表示します。',close:'小さな穴や切れ目を埋める候補です。追加候補は黄色で表示します。'};
    setAssistGuide(guides[mode]);
  }
  async function previewSeedSelection(index){
    if(!state.hasSource)return;
    try{
      $('assistRun').disabled=true;setAssistGuide('候補領域を解析中…');
      const tolerance=$('assistMode').value==='exact'?0:+$('colorTolerance').value;
      const mask=MODEL.adjacentColorMask(state.rgba,state.width,state.height,index,tolerance);
      prepareAssignMask(mask);
      state.preview={kind:'assign',mask};state.assistArmed=true;render();showPreviewActions(true,`黄色 ${maskCount(mask)} pxを確定`);
      setAssistGuide(`黄色の ${maskCount(mask)} pxが候補です。別の場所もタップすると候補へ追加できます。`);
    }catch(error){setAssistGuide(`処理失敗：${error.message}`);state.preview=null;}
    finally{$('assistRun').disabled=!state.hasSource;}
  }
  async function runAssist(){
    if(!state.hasSource)return;
    if(state.preview)cancelAssistPreview();
    const mode=$('assistMode').value;activateAssistTool();
    if(['exact','approx'].includes(mode)){state.assistArmed=true;setAssistGuide('キャンバス上で起点にする色をタップしてください。');return;}
    if(!state.cvReady&&!(await initCV()))return;
    try{
      $('assistRun').disabled=true;setAssistGuide('OpenCVで候補を解析中…');
      if(mode==='orphan'){
        const mask=await CV.orphanRegions(state.assignments,state.width,state.height,state.activePart,+$('orphanSize').value);
        state.preview={kind:'remove',mask};showPreviewActions(true,`候補 ${maskCount(mask)} pxを未分類へ`);
        setAssistGuide(`黄色の ${maskCount(mask)} pxが孤立候補です。確定すると未分類へ戻します。`);
      }else if(mode==='contour'){
        const mask=await CV.contour(state.assignments,state.width,state.height,state.activePart);
        state.preview={kind:'contour',mask};showPreviewActions(false);setAssistGuide(`水色の ${maskCount(mask)} pxが現在の外周です。マスクは変更しません。`);
      }else{
        const result=await CV.morphology(state.assignments,state.width,state.height,state.activePart,mode);
        state.preview={kind:'morph',add:result.add,remove:result.remove};showPreviewActions(true,`追加 ${maskCount(result.add)} / 削除 ${maskCount(result.remove)} pxを確定`);
        setAssistGuide('黄色は追加候補、ピンクは削除候補です。他パーツのピクセルは上書きしません。');
      }
      render();
    }catch(error){state.preview=null;$('previewActions').classList.add('hidden');setAssistGuide(`処理失敗：${error.message}`);}
    finally{$('assistRun').disabled=!state.hasSource;}
  }
  function confirmAssistPreview(){
    const preview=state.preview;if(!preview||preview.kind==='contour')return;
    snapshot();
    if(preview.kind==='assign')for(let i=0;i<preview.mask.length;i++)if(preview.mask[i]&&state.assignments[i]!==-2)state.assignments[i]=state.activePart;
    if(preview.kind==='remove')for(let i=0;i<preview.mask.length;i++)if(preview.mask[i]&&state.assignments[i]===state.activePart)state.assignments[i]=-1;
    if(preview.kind==='morph')for(let i=0;i<state.assignments.length;i++){if(preview.remove[i]&&state.assignments[i]===state.activePart)state.assignments[i]=-1;if(preview.add[i]&&state.assignments[i]===-1)state.assignments[i]=state.activePart;}
    state.preview=null;state.assistArmed=state.tool==='assist';$('previewActions').classList.add('hidden');render();updateStats();scheduleSave();setAssistGuide('確定しました。同じパーツの別の場所を続けてタップできます。');
  }
  $('assistMode').addEventListener('change',()=>{cancelAssistPreview();setAssistModeUI();});
  $('colorTolerance').addEventListener('input',e=>{$('toleranceValue').value=e.target.value;});
  $('orphanSize').addEventListener('input',e=>{$('orphanValue').value=`${e.target.value} px以下`;});
  $('assistRun').onclick=runAssist;$('confirmAssist').onclick=confirmAssistPreview;$('cancelAssist').onclick=cancelAssistPreview;
  document.querySelectorAll('.tolerance-preset').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tolerance-preset').forEach(x=>x.classList.remove('active'));button.classList.add('active');$('colorTolerance').value=button.dataset.tolerance;$('toleranceValue').value=button.dataset.tolerance;$('assistMode').value='approx';state.assistArmed=state.tool==='assist';setAssistGuide(`${button.textContent}設定：画像をタップして黄色候補を確認してください。`);}));
  $('showUnassigned').addEventListener('change',e=>{state.showUnassigned=e.target.checked;render();});
  $('nextUnassigned').onclick=()=>{const start=Math.max(0,state.focusPixel+1);let index=-1;for(let pass=0;pass<2&&index<0;pass++){const from=pass?0:start,to=pass?start:state.assignments.length;for(let i=from;i<to;i++)if(state.assignments[i]===-1){index=i;break;}}if(index<0){setFeedback('未分類ピクセルはありません。');return;}state.focusPixel=index;const x=(index%state.width)*state.zoom,y=((index/state.width)|0)*state.zoom;viewport.scrollLeft=Math.max(0,x-viewport.clientWidth/2+state.zoom/2);viewport.scrollTop=Math.max(0,y-viewport.clientHeight/2+state.zoom/2);render();setFeedback('白枠が次の未分類ピクセルです。');};

  $('partsList').addEventListener('click',e=>{const b=e.target.closest('[data-part]');if(!b)return;if(state.preview)cancelAssistPreview();state.activePart=+b.dataset.part;renderParts();render();scheduleSave();});
  $('sourceOpacity').addEventListener('input',e=>{state.sourceOpacity=+e.target.value/100;render();});
  $('maskVisible').addEventListener('change',e=>{state.maskVisible=e.target.checked;render();});$('selectedOnly').addEventListener('change',e=>{state.selectedOnly=e.target.checked;render();});$('gridVisible').addEventListener('change',e=>{state.grid=e.target.checked;render();});
  function setZoom(v){state.zoom=Math.max(8,Math.min(28,v));fitCanvas();render();}
  $('zoomOut').onclick=()=>setZoom(state.zoom-2);$('zoomIn').onclick=()=>setZoom(state.zoom+2);$('centerBtn').onclick=()=>{viewport.scrollLeft=Math.max(0,(canvas.width-viewport.clientWidth)/2);viewport.scrollTop=Math.max(0,(canvas.height-viewport.clientHeight)/2);};
  $('undoBtn').onclick=()=>{if(!state.undo.length)return;state.redo.push(Int16Array.from(state.assignments));state.assignments=state.undo.pop();render();updateStats();scheduleSave();};
  $('redoBtn').onclick=()=>{if(!state.redo.length)return;state.undo.push(Int16Array.from(state.assignments));state.assignments=state.redo.pop();render();updateStats();scheduleSave();};
  $('addPartBtn').onclick=()=>{const name=prompt('追加するパーツ名');if(!name)return;state.parts.push({id:state.parts.length,name:name.trim(),color:COLORS[state.parts.length%COLORS.length]});state.activePart=state.parts.length-1;renderParts();scheduleSave();};
  $('renamePartBtn').onclick=()=>{const p=state.parts[state.activePart],name=prompt('パーツ名',p.name);if(!name)return;p.name=name.trim();renderParts();scheduleSave();};
  $('resetBtn').onclick=()=>{if(!confirm('すべてのマスク割当を未分類へ戻しますか？'))return;if(state.preview)cancelAssistPreview();snapshot();state.assignments=MODEL.createAssignments(state.alpha);render();updateStats();scheduleSave();};
  $('fileInput').addEventListener('change',async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      setLoadState(`${f.name} を読み込み中…`);
      if(f.type && !f.type.startsWith('image/'))throw new Error('画像ファイルを選択してください');
      const src=await fileToDataURL(f);await loadImage(src,f.name);scheduleSave();setTimeout(()=>$('centerBtn').click(),30);
    }catch(error){setLoadState(`読み込み失敗：${error.message}`,true);alert(`画像を読み込めませんでした。\n${error.message}`);}
    finally{e.target.value='';}
  });
  $('sampleBtn').onclick=async()=>{try{setLoadState('動作確認用サンプルを読み込み中…');await loadImage('assets/bartz_battle_native_16x24.png','バッツ戦闘待機');scheduleSave();setTimeout(()=>$('centerBtn').click(),30);}catch(error){setLoadState(`サンプル読込失敗：${error.message}`,true);}};
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

  async function init(){
    initEmptyCanvas();
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(saved?.source){state.parts=saved.parts||state.parts;state.activePart=Math.min(saved.activePart||0,state.parts.length-1);setLoadState('前回の画像を復元中…');await loadImage(saved.source,saved.sourceName||'復元画像',saved.assignments);setTimeout(()=>$('centerBtn').click(),50);}
    }catch(e){console.error(e);initEmptyCanvas();setLoadState('前回データを復元できませんでした。PNG画像を選択してください。',true);}
  }
  async function initCV(){
    const badge=$('cvStatus');
    badge.textContent='起動中';badge.className='cv-status loading';$('assistRun').disabled=true;setAssistGuide('OpenCV.jsを初期化しています。初回のみ時間がかかります。');
    try{await CV.ready();state.cvReady=true;badge.textContent='OpenCV 5 使用可能';badge.className='cv-status';setAssistModeUI();return true;}
    catch(error){state.cvReady=false;badge.textContent='読込失敗';badge.className='cv-status error';setAssistGuide(`OpenCV.js読込失敗：${error.message}`);return false;}
    finally{$('assistRun').disabled=!state.hasSource;}
  }
  setAssistModeUI();state.assistArmed=true;init();
})();
