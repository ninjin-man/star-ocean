(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SpriteBackgroundGuard=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  var VERSION='v1.16.3-hotfix';
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rgbDistance(data,p,q){
    var i=p*4,j=q*4;
    var dr=data[i]-data[j],dg=data[i+1]-data[j+1],db=data[i+2]-data[j+2];
    return Math.sqrt(dr*dr+dg*dg+db*db);
  }
  function colorDistanceToMean(data,p,mean){
    var i=p*4,dr=data[i]-mean[0],dg=data[i+1]-mean[1],db=data[i+2]-mean[2];
    return Math.sqrt(dr*dr+dg*dg+db*db);
  }
  function pixelLuma(data,p){var i=p*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2];}
  function pixelSat(data,p){
    var i=p*4,r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    return mx===0?0:(mx-mn)/mx;
  }
  function countMask(mask){var n=0;for(var i=0;i<mask.length;i++)if(mask[i])n++;return n;}

  function getBBox(mask,w,h,pad){
    var minx=w,miny=h,maxx=-1,maxy=-1,count=0;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(mask[y*w+x]){
      count++;if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;
    }
    if(!count)return {x:0,y:0,w:w,h:h,count:0,minx:0,miny:0,maxx:w-1,maxy:h-1};
    var px=pad===false?0:Math.max(2,Math.round((maxx-minx+1)*.025));
    var py=pad===false?0:Math.max(2,Math.round((maxy-miny+1)*.018));
    minx=clamp(minx-px,0,w-1);maxx=clamp(maxx+px,0,w-1);
    miny=clamp(miny-py,0,h-1);maxy=clamp(maxy+py,0,h-1);
    return {x:minx,y:miny,w:maxx-minx+1,h:maxy-miny+1,count:count,minx:minx,miny:miny,maxx:maxx,maxy:maxy};
  }

  function labelComponents(mask,w,h){
    var n=w*h,labels=new Int32Array(n),queue=new Int32Array(n),components=[null],label=0;
    for(var p=0;p<n;p++){
      if(!mask[p]||labels[p])continue;
      label++;
      var head=0,tail=0;queue[tail++]=p;labels[p]=label;
      var area=0,minx=w,miny=h,maxx=-1,maxy=-1,sumx=0,sumy=0,border=0,central=0,bottom=0;
      while(head<tail){
        var cur=queue[head++],x=cur%w,y=(cur/w)|0;
        area++;sumx+=x;sumy+=y;
        if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;
        if(x===0||x===w-1||y===0||y===h-1)border++;
        if(x>=w*.30&&x<=w*.70)central++;
        if(y>=h*.82)bottom++;
        for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          var xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
          var ni=yy*w+xx;if(mask[ni]&&!labels[ni]){labels[ni]=label;queue[tail++]=ni;}
        }
      }
      components[label]={label:label,area:area,minx:minx,miny:miny,maxx:maxx,maxy:maxy,w:maxx-minx+1,h:maxy-miny+1,cx:sumx/area,cy:sumy/area,border:border,central:central,bottom:bottom,score:0};
    }
    return {labels:labels,components:components,count:label};
  }

  function scorePersonComponents(labeled,w,h){
    var comps=labeled.components,total=w*h;
    for(var i=1;i<comps.length;i++){
      var c=comps[i],height=c.h/h,width=c.w/w,area=c.area/total;
      var aspect=c.h/Math.max(1,c.w);
      var aspectScore=1-Math.min(1,Math.abs(aspect-1.9)/2.2);
      var centerDist=Math.abs(c.cx-w*.5)/(w*.5);
      var centerScore=1-Math.min(1,centerDist);
      var bottomReach=c.maxy/(h-1);
      var centralRatio=c.central/c.area;
      var bottomRatio=c.bottom/c.area;
      var edgePenalty=c.border/Math.max(1,Math.sqrt(c.area)*4);
      c.score=height*34+Math.min(.28,area)*70+aspectScore*12+centerScore*13+bottomReach*15+centralRatio*10+Math.min(.15,bottomRatio)*25-edgePenalty*8-width*2;
    }
    return comps;
  }

  function bboxGap(a,b){
    var dx=Math.max(0,Math.max(a.minx-b.maxx-1,b.minx-a.maxx-1));
    var dy=Math.max(0,Math.max(a.miny-b.maxy-1,b.miny-a.maxy-1));
    return Math.sqrt(dx*dx+dy*dy);
  }

  function selectComponents(mask,w,h,usePersonScore){
    var labeled=labelComponents(mask,w,h),comps=scorePersonComponents(labeled,w,h);
    if(!labeled.count)return {mask:mask.slice(),components:0,mainArea:0,selected:null,componentScores:[]};
    var selected=1;
    for(var i=2;i<comps.length;i++){
      if(usePersonScore){if(comps[i].score>comps[selected].score)selected=i;}
      else if(comps[i].area>comps[selected].area)selected=i;
    }
    var main=comps[selected],keep=new Uint8Array(comps.length);keep[selected]=1;
    var nearDistance=Math.max(10,Math.min(w,h)*.055);
    var minSatellite=Math.max(8,Math.round(main.area*.0008));
    for(var j=1;j<comps.length;j++){
      if(j===selected)continue;
      var c=comps[j],gap=bboxGap(main,c);
      var likelyAccessory=gap<=nearDistance&&c.area>=minSatellite&&c.area<=main.area*.18;
      var verticalNeighbor=gap<=nearDistance*.7&&c.maxy>=main.miny&&c.miny<=main.maxy;
      if(likelyAccessory&&(verticalNeighbor||c.area>=main.area*.004))keep[j]=1;
    }
    var out=new Uint8Array(mask.length),keptArea=0;
    for(var p=0;p<out.length;p++){var l=labeled.labels[p];if(l&&keep[l]){out[p]=1;keptArea++;}}
    var scores=[];
    for(var k=1;k<comps.length;k++)scores.push({label:k,area:comps[k].area,score:Math.round(comps[k].score*10)/10,selected:k===selected});
    scores.sort(function(a,b){return b.score-a.score;});
    return {mask:out,components:labeled.count,mainArea:main.area,keptArea:keptArea,selected:main,componentScores:scores.slice(0,8)};
  }

  function fillHoles(mask,w,h){
    var n=w*h,seen=new Uint8Array(n),queue=new Int32Array(n),head=0,tail=0;
    function push(x,y){var p=y*w+x;if(seen[p]||mask[p])return;seen[p]=1;queue[tail++]=p;}
    for(var x=0;x<w;x++){push(x,0);push(x,h-1);}for(var y=0;y<h;y++){push(0,y);push(w-1,y);}
    while(head<tail){var cur=queue[head++],cx=cur%w,cy=(cur/w)|0;if(cx>0)push(cx-1,cy);if(cx<w-1)push(cx+1,cy);if(cy>0)push(cx,cy-1);if(cy<h-1)push(cx,cy+1);}
    var out=mask.slice(),filled=0;
    for(var i=0;i<n;i++)if(!mask[i]&&!seen[i]){out[i]=1;filled++;}
    return {mask:out,filled:filled};
  }

  function closeSinglePixelGaps(mask,w,h){
    var out=mask.slice(),closed=0;
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){
      var p=y*w+x;if(mask[p])continue;
      var n=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if((dx||dy)&&mask[(y+dy)*w+x+dx])n++;
      if(n>=6){out[p]=1;closed++;}
    }
    return {mask:out,closed:closed};
  }

  function buildDetailMap(imageData,mask,w,h){
    var data=imageData.data||imageData,detail=new Uint8Array(w*h);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var p=y*w+x;if(!mask[p])continue;
      var sum=0,n=0;
      if(x>0){sum+=rgbDistance(data,p,p-1);n++;}if(x<w-1){sum+=rgbDistance(data,p,p+1);n++;}
      if(y>0){sum+=rgbDistance(data,p,p-w);n++;}if(y<h-1){sum+=rgbDistance(data,p,p+w);n++;}
      detail[p]=clamp(Math.round(sum/Math.max(1,n)),0,255);
    }
    return detail;
  }

  function estimateCharacterCenter(mask,detail,bbox,w,h){
    var sx=0,sw=0;
    for(var y=bbox.miny;y<=bbox.maxy;y++)for(var x=bbox.minx;x<=bbox.maxx;x++){
      var p=y*w+x;if(!mask[p])continue;
      var yn=(y-bbox.miny)/Math.max(1,bbox.h-1);
      var centerPrior=1-Math.min(1,Math.abs(x-w*.5)/(w*.5));
      var weight=1+Math.min(5,detail[p]/18)+yn*2+centerPrior*.7;
      sx+=x*weight;sw+=weight;
    }
    return sw?sx/sw:(bbox.minx+bbox.maxx)/2;
  }

  function buildProtectedMask(mask,detail,bbox,centerX,w,h,strength){
    var n=w*h,protectedMask=new Uint8Array(n),queue=new Int32Array(n),head=0,tail=0;
    var coreHalf=Math.max(2,bbox.w*(strength==='strong'?.055:.07));
    var lowerHalf=bbox.w*.17;
    for(var y=bbox.miny;y<=bbox.maxy;y++)for(var x=bbox.minx;x<=bbox.maxx;x++){
      var p=y*w+x;if(!mask[p])continue;
      var yn=(y-bbox.miny)/Math.max(1,bbox.h-1),dx=Math.abs(x-centerX);
      var seed=(yn>.06&&dx<=coreHalf&&(detail[p]>=6||yn>.50))||(yn>.34&&dx<=lowerHalf&&detail[p]>=4)||(yn>.82&&dx<=bbox.w*.23);
      if(seed){protectedMask[p]=1;queue[tail++]=p;}
    }
    var passDetail=strength==='safe'?9:(strength==='strong'?15:12);
    while(head<tail){
      var cur=queue[head++],cx=cur%w,cy=(cur/w)|0;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;var xx=cx+dx,yy=cy+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
        var q=yy*w+xx;if(protectedMask[q]||!mask[q])continue;
        var yn=(yy-bbox.miny)/Math.max(1,bbox.h-1),dist=Math.abs(xx-centerX);
        var central=dist<=bbox.w*(yn>.52?.24:.17)&&(detail[q]>=5||yn>.50);
        var lower=yn>.72&&dist<=bbox.w*.32;
        var detailed=detail[q]>=passDetail&&dist<=bbox.w*.48;
        if(central||lower||detailed){protectedMask[q]=1;queue[tail++]=q;}
      }
    }
    // Detailed edge pixels adjacent to protected character are retained without growing into flat background.
    for(var iter=0;iter<2;iter++){
      var add=[];
      for(var yy=bbox.miny;yy<=bbox.maxy;yy++)for(var xx=bbox.minx;xx<=bbox.maxx;xx++){
        var p2=yy*w+xx;if(!mask[p2]||protectedMask[p2]||detail[p2]<32)continue;
        var near=false;for(var ddy=-1;ddy<=1&&!near;ddy++)for(var ddx=-1;ddx<=1;ddx++){
          var ax=xx+ddx,ay=yy+ddy;if(ax>=0&&ax<w&&ay>=0&&ay<h&&protectedMask[ay*w+ax]){near=true;break;}
        }
        if(near)add.push(p2);
      }
      for(var ai=0;ai<add.length;ai++)protectedMask[add[ai]]=1;
    }
    return protectedMask;
  }

  function regionParameters(strength){
    if(strength==='safe')return {detail:19,color:28,minRatio:.034,score:48,brightScore:38,grow:34,distance:.48};
    if(strength==='strong')return {detail:31,color:42,minRatio:.012,score:31,brightScore:25,grow:50,distance:.36};
    return {detail:25,color:35,minRatio:.020,score:39,brightScore:31,grow:42,distance:.42};
  }

  function labelUniformRegions(mask,protectedMask,detail,imageData,w,h,params){
    var data=imageData.data||imageData,n=w*h,labels=new Int32Array(n),queue=new Int32Array(n),regions=[null],label=0;
    for(var p=0;p<n;p++){
      if(!mask[p]||protectedMask[p]||detail[p]>params.detail||labels[p])continue;
      label++;var head=0,tail=0;queue[tail++]=p;labels[p]=label;
      var area=0,minx=w,miny=h,maxx=-1,maxy=-1,sumx=0,sumy=0,sumr=0,sumg=0,sumb=0,sumd=0,perimeter=0,exterior=0,nearExterior=0;
      while(head<tail){
        var cur=queue[head++],x=cur%w,y=(cur/w)|0,i=cur*4;
        area++;sumx+=x;sumy+=y;sumr+=data[i];sumg+=data[i+1];sumb+=data[i+2];sumd+=detail[cur];
        var closeToOutside=false;
        for(var oy=-2;oy<=2&&!closeToOutside;oy++)for(var ox=-2;ox<=2;ox++){
          var tx=x+ox,ty=y+oy;if(tx<0||tx>=w||ty<0||ty>=h||!mask[ty*w+tx]){closeToOutside=true;break;}
        }
        if(closeToOutside)nearExterior++;
        if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;
        var ns=[cur-1,cur+1,cur-w,cur+w];
        for(var ni=0;ni<4;ni++){
          var q=ns[ni],valid=!(ni===0&&x===0)&&!(ni===1&&x===w-1)&&!(ni===2&&y===0)&&!(ni===3&&y===h-1);
          if(!valid){perimeter++;exterior++;continue;}
          if(!mask[q]){perimeter++;exterior++;continue;}
          if(protectedMask[q]||detail[q]>params.detail){perimeter++;continue;}
          if(labels[q])continue;
          if(rgbDistance(data,cur,q)<=params.color){labels[q]=label;queue[tail++]=q;}else perimeter++;
        }
      }
      regions[label]={label:label,area:area,minx:minx,miny:miny,maxx:maxx,maxy:maxy,w:maxx-minx+1,h:maxy-miny+1,cx:sumx/area,cy:sumy/area,mean:[sumr/area,sumg/area,sumb/area],detail:sumd/area,perimeter:perimeter,exterior:exterior,nearExterior:nearExterior,luma:.299*(sumr/area)+.587*(sumg/area)+.114*(sumb/area)};
      var mx=Math.max(regions[label].mean[0],regions[label].mean[1],regions[label].mean[2]),mn=Math.min(regions[label].mean[0],regions[label].mean[1],regions[label].mean[2]);
      regions[label].sat=mx===0?0:(mx-mn)/mx;
    }
    return {labels:labels,regions:regions,count:label};
  }

  function decideUniformRegions(regionData,bbox,protectedBBox,centerX,maskArea,options,params){
    var removeReason=new Int8Array(regionData.regions.length),debug=[];
    for(var i=1;i<regionData.regions.length;i++){
      var r=regionData.regions[i],ratio=r.area/Math.max(1,maskArea),edgeExposure=r.exterior/Math.max(1,r.perimeter),nearExposure=r.nearExterior/Math.max(1,r.area),exposure=Math.max(edgeExposure,Math.min(1,nearExposure*4.5));
      var dist=Math.abs(r.cx-centerX)/Math.max(1,bbox.w*.5);
      var yn=(r.cy-bbox.miny)/Math.max(1,bbox.h-1);
      var reachesBottom=r.maxy>=bbox.maxy-Math.max(3,bbox.h*.045);
      var centralLower=yn>.42&&dist<.28;
      var areaScore=Math.min(30,ratio*300),detailScore=(1-Math.min(1,r.detail/Math.max(1,params.detail)))*15;
      var verticalCharacterLike=r.h>r.w*1.15&&yn>.30;
      var overflow=(Math.max(0,protectedBBox.minx-r.minx)+Math.max(0,r.maxx-protectedBBox.maxx))/Math.max(1,protectedBBox.w);
      var widerThanCharacter=r.w>protectedBBox.w*1.18;
      var backgroundExtent=dist>.35||overflow>.22||widerThanCharacter||ratio>.22;
      var score=areaScore+exposure*31+Math.min(1.4,dist)*10+detailScore+Math.min(18,overflow*22)+(yn<.48?6:0)-(reachesBottom?21:0)-(centralLower?18:0)-(verticalCharacterLike?14:0);
      var generic=options.objectRemoval&&backgroundExtent&&ratio>=params.minRatio&&exposure>.055&&score>=params.score;
      var brightShape=yn<.55||r.w>=r.h*1.05||dist>.45;
      var bright=options.brightRemoval&&brightShape&&r.luma>=205&&r.sat<=.26&&ratio>=params.minRatio*.55&&exposure>.035&&score>=params.brightScore;
      if(generic)removeReason[i]=1;else if(bright)removeReason[i]=2;
      if(generic||bright||ratio>=params.minRatio*.55)debug.push({label:i,area:r.area,ratio:+ratio.toFixed(4),score:+score.toFixed(1),luma:+r.luma.toFixed(1),sat:+r.sat.toFixed(2),detail:+r.detail.toFixed(1),exposure:+exposure.toFixed(2),reason:generic?'object':(bright?'bright':'kept')});
    }
    debug.sort(function(a,b){return b.score-a.score;});
    return {removeReason:removeReason,debug:debug.slice(0,10)};
  }

  function growRemovedRegions(mask,protectedMask,labels,regions,removeReason,imageData,w,h,params){
    var data=imageData.data||imageData,n=w*h,regionMap=new Int32Array(n),queue=new Int32Array(n),head=0,tail=0;
    for(var p=0;p<n;p++){
      var l=labels[p];if(l&&removeReason[l]){regionMap[p]=l;queue[tail++]=p;}
    }
    while(head<tail){
      var cur=queue[head++],x=cur%w,y=(cur/w)|0,lbl=regionMap[cur],mean=regions[lbl].mean;
      var ns=[cur-1,cur+1,cur-w,cur+w];
      for(var i=0;i<4;i++){
        var q=ns[i],valid=!(i===0&&x===0)&&!(i===1&&x===w-1)&&!(i===2&&y===0)&&!(i===3&&y===h-1);
        if(!valid||!mask[q]||protectedMask[q]||regionMap[q])continue;
        if(colorDistanceToMean(data,q,mean)<=params.grow){regionMap[q]=lbl;queue[tail++]=q;}
      }
    }
    var out=mask.slice(),objectCount=0,brightCount=0;
    for(var j=0;j<n;j++)if(regionMap[j]){
      out[j]=0;if(removeReason[regionMap[j]]===1)objectCount++;else brightCount++;
    }
    return {mask:out,objectRemoved:objectCount,brightRemoved:brightCount,regionMap:regionMap};
  }

  function removeDistantLowDetail(mask,protectedMask,detail,bbox,centerX,w,h,strength,distanceThreshold){
    var params=regionParameters(strength),candidate=new Uint8Array(mask.length);if(Number.isFinite(distanceThreshold))params.distance=distanceThreshold;
    for(var y=bbox.miny;y<=bbox.maxy;y++)for(var x=bbox.minx;x<=bbox.maxx;x++){
      var p=y*w+x;if(!mask[p]||protectedMask[p])continue;
      var dist=Math.abs(x-centerX)/Math.max(1,bbox.w),yn=(y-bbox.miny)/Math.max(1,bbox.h-1);
      if(dist>params.distance&&yn<.91&&detail[p]<=params.detail*.72)candidate[p]=1;
    }
    var labeled=labelComponents(candidate,w,h),removeLabels=new Uint8Array(labeled.components.length),maskArea=countMask(mask);
    for(var i=1;i<labeled.components.length;i++){
      var c=labeled.components[i],ratio=c.area/Math.max(1,maskArea),touchesBottom=c.maxy>=bbox.maxy-Math.max(3,bbox.h*.06);
      if(c.area>=Math.max(18,maskArea*.004)&&ratio<.45&&!touchesBottom)removeLabels[i]=1;
    }
    var out=mask.slice(),removed=0;
    for(var q=0;q<out.length;q++)if(removeLabels[labeled.labels[q]]){out[q]=0;removed++;}
    return {mask:out,removed:removed};
  }

  function restoreProtected(mask,baseMask,protectedMask){
    var out=mask.slice(),restored=0;
    for(var i=0;i<out.length;i++)if(baseMask[i]&&protectedMask[i]&&!out[i]){out[i]=1;restored++;}
    return {mask:out,restored:restored};
  }



  function buildBorderModels(imageData,w,h){
    var data=imageData.data||imageData,models=[],bands=8;
    function addRegion(x0,y0,x1,y1){
      var sr=0,sg=0,sb=0,n=0,step=Math.max(1,Math.floor(Math.min(w,h)/96));
      for(var y=y0;y<y1;y+=step)for(var x=x0;x<x1;x+=step){
        var i=(y*w+x)*4;if(data[i+3]<8)continue;
        sr+=data[i];sg+=data[i+1];sb+=data[i+2];n++;
      }
      if(n)models.push([sr/n,sg/n,sb/n]);
    }
    var bw=Math.max(2,Math.round(w*.08)),bh=Math.max(2,Math.round(h*.08));
    addRegion(0,0,w,bh);addRegion(0,h-bh,w,h);addRegion(0,0,bw,h);addRegion(w-bw,0,w,h);
    addRegion(0,0,bw,bh);addRegion(w-bw,0,w,bh);addRegion(0,h-bh,bw,h);addRegion(w-bw,h-bh,w,h);
    return models.length?models:[[255,255,255]];
  }

  function nearestModelDistance(data,p,models){
    var i=p*4,best=1e9;
    for(var m=0;m<models.length;m++){
      var dr=data[i]-models[m][0],dg=data[i+1]-models[m][1],db=data[i+2]-models[m][2];
      var d=Math.sqrt(dr*dr+dg*dg+db*db);if(d<best)best=d;
    }
    return best;
  }

  function recoverInternalBackground(mask,protectedMask,detail,imageData,w,h,bbox,strength,internalScale){
    var data=imageData.data||imageData,models=buildBorderModels(imageData,w,h),candidate=new Uint8Array(mask.length);
    var scale=Number.isFinite(internalScale)?Math.max(0.35,Math.min(1.5,internalScale)):0.75;
    var tol=(strength==='safe'?25:(strength==='strong'?48:36))*scale,maxDetail=(strength==='safe'?17:(strength==='strong'?33:25))*scale;
    for(var y=bbox.miny;y<=bbox.maxy;y++)for(var x=bbox.minx;x<=bbox.maxx;x++){
      var p=y*w+x;if(!mask[p]||protectedMask[p])continue;
      var yn=(y-bbox.miny)/Math.max(1,bbox.h-1),xn=Math.abs(x-(bbox.minx+bbox.maxx)*.5)/Math.max(1,bbox.w*.5);
      var dist=nearestModelDistance(data,p,models),thinZone=(xn>.12||yn<.42||yn>.67);
      if(thinZone&&dist<=tol&&detail[p]<=maxDetail)candidate[p]=1;
    }
    var lab=labelComponents(candidate,w,h),remove=new Uint8Array(lab.components.length),debug=[],maskArea=countMask(mask);
    for(var i=1;i<lab.components.length;i++){
      var c=lab.components[i],ratio=c.area/Math.max(1,maskArea),aspect=Math.max(c.w/c.h,c.h/c.w),yn=(c.cy-bbox.miny)/Math.max(1,bbox.h-1);
      var enclosed=c.border===0,thin=aspect>=2.0||Math.min(c.w,c.h)<=Math.max(3,Math.min(w,h)*.018);
      var usefulSize=c.area>=Math.max(3,maskArea*.00005)&&c.area<=maskArea*(strength==='strong'?.09:.045)*Math.max(.55,scale);
      var centralPenalty=(yn>.30&&yn<.72&&Math.abs(c.cx-(bbox.minx+bbox.maxx)*.5)<bbox.w*.16);
      if(enclosed&&usefulSize&&thin&&!centralPenalty)remove[i]=1;
      if(usefulSize)debug.push({area:c.area,w:c.w,h:c.h,thin:thin,remove:!!remove[i]});
    }
    var out=mask.slice(),removed=0;
    for(var p=0;p<out.length;p++)if(remove[lab.labels[p]]){out[p]=0;removed++;}
    return {mask:out,removed:removed,debug:debug.slice(0,8)};
  }

  function removeSupportShapes(mask,protectedMask,detail,imageData,w,h,bbox,centerX,strength){
    var params=regionParameters(strength),regions=labelUniformRegions(mask,protectedMask,detail,imageData,w,h,params),remove=new Int8Array(regions.regions.length),debug=[];
    for(var i=1;i<regions.regions.length;i++){
      var r=regions.regions[i],yn=(r.cy-bbox.miny)/Math.max(1,bbox.h-1),flat=r.w/Math.max(1,r.h),wide=r.w/Math.max(1,bbox.w),dist=Math.abs(r.cx-centerX)/Math.max(1,bbox.w*.5);
      var bottom=r.maxy>=bbox.maxy-Math.max(2,bbox.h*.12),lowDetail=r.detail<=(strength==='strong'?38:28),support=yn>.72&&bottom&&flat>=2.0&&wide>=.28&&lowDetail;
      var floorShadow=yn>.78&&flat>=2.8&&wide>=.40&&r.luma>145&&r.sat<.38;
      if((support||floorShadow)&&!(dist<.18&&r.h>bbox.h*.10))remove[i]=1;
      if(support||floorShadow)debug.push({label:i,area:r.area,flat:+flat.toFixed(2),wide:+wide.toFixed(2),luma:+r.luma.toFixed(1),remove:!!remove[i]});
    }
    var grown=growRemovedRegions(mask,protectedMask,regions.labels,regions.regions,remove,imageData,w,h,{grow:strength==='strong'?56:44});
    return {mask:grown.mask,removed:grown.objectRemoved+grown.brightRemoved,debug:debug.slice(0,8)};
  }

  function buildFeatureMasks(visualMask,w,h,bbox){
    var structure=new Uint8Array(visualMask.length);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var p=y*w+x;if(!visualMask[p])continue;
      var near=0,total=0;
      for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){
        var xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;total++;if(visualMask[yy*w+xx])near++;
      }
      var yn=(y-bbox.miny)/Math.max(1,bbox.h-1),central=Math.abs(x-(bbox.minx+bbox.maxx)*.5)<=bbox.w*(yn>.68?.30:.23);
      if(near>=7||central&&near>=4)structure[p]=1;
    }
    structure=selectComponents(structure,w,h,true).mask;
    var detailMask=new Uint8Array(visualMask.length);
    for(var i=0;i<visualMask.length;i++)if(visualMask[i]&&!structure[i])detailMask[i]=1;
    return {structureMask:structure,detailMask:detailMask};
  }

  function process(input){
    if(!input||!input.mask||!input.w||!input.h||!input.imageData)throw new Error('SpriteBackgroundGuard.process: invalid input');
    var w=input.w,h=input.h,options=input.options||{},strength=options.strength||'standard';
    var raw=input.mask.slice(),rawArea=countMask(raw),componentResult;
    var working=raw.slice();
    if(options.componentGuard!==false){
      componentResult=selectComponents(working,w,h,options.personScore!==false);working=componentResult.mask;
    }else{
      var rawLabels=labelComponents(working,w,h);componentResult={components:rawLabels.count,mainArea:rawArea,keptArea:rawArea,selected:null,componentScores:[]};
    }
    var holes=0,closed=0;
    if(options.holeRestore!==false){
      var close=closeSinglePixelGaps(working,w,h);working=close.mask;closed=close.closed;
      // Large enclosed gaps are deliberately not filled: hair/arm/leg gaps must remain background.
    }
    var beforeRemoval=working.slice(),bbox=getBBox(working,w,h,false),detail=buildDetailMap(input.imageData,working,w,h);
    var centerX=estimateCharacterCenter(working,detail,bbox,w,h),protectedMask=buildProtectedMask(working,detail,bbox,centerX,w,h,strength);
    var objectRemoved=0,brightRemoved=0,distanceRemoved=0,restored=0,regionDebug=[];
    if(options.objectRemoval||options.brightRemoval){
      var params=regionParameters(strength),regions=labelUniformRegions(working,protectedMask,detail,input.imageData,w,h,params);
      var protectedBBox=getBBox(protectedMask,w,h,false);
      var decision=decideUniformRegions(regions,bbox,protectedBBox,centerX,countMask(working),options,params);
      var grown=growRemovedRegions(working,protectedMask,regions.labels,regions.regions,decision.removeReason,input.imageData,w,h,params);
      working=grown.mask;objectRemoved=grown.objectRemoved;brightRemoved=grown.brightRemoved;regionDebug=decision.debug;
    }
    if(options.distanceRemoval){var distant=removeDistantLowDetail(working,protectedMask,detail,bbox,centerX,w,h,strength,options.distanceThreshold);working=distant.mask;distanceRemoved=distant.removed;}
    var internalRemoved=0,supportRemoved=0,internalDebug=[],supportDebug=[];
    if(options.internalRecovery!==false){
      var internal=recoverInternalBackground(working,protectedMask,detail,input.imageData,w,h,bbox,strength,options.internalScale);working=internal.mask;internalRemoved=internal.removed;internalDebug=internal.debug;
    }
    if(options.supportRemoval!==false){
      var support=removeSupportShapes(working,protectedMask,detail,input.imageData,w,h,bbox,centerX,strength);working=support.mask;supportRemoved=support.removed;supportDebug=support.debug;
    }
    var restoredResult=restoreProtected(working,beforeRemoval,protectedMask);working=restoredResult.mask;restored=restoredResult.restored;
    if(options.componentGuard!==false){working=selectComponents(working,w,h,options.personScore!==false).mask;}
    var finalBBox=getBBox(working,w,h,true),finalArea=countMask(working),features=buildFeatureMasks(working,w,h,finalBBox);
    return {mask:working,visualMask:working,structureMask:features.structureMask,detailMask:features.detailMask,bbox:finalBBox,stats:{version:VERSION,rawArea:rawArea,finalArea:finalArea,structureArea:countMask(features.structureMask),detailArea:countMask(features.detailMask),components:componentResult.components,mainArea:componentResult.mainArea||0,selectedScore:componentResult.selected?componentResult.selected.score:0,componentScores:componentResult.componentScores||[],holesRestored:holes,smallGapsClosed:closed,objectRemoved:objectRemoved,brightRemoved:brightRemoved,distanceRemoved:distanceRemoved,internalBackgroundRemoved:internalRemoved,supportRemoved:supportRemoved,protectedRestored:restored,centerX:+centerX.toFixed(1),strength:strength,regionDebug:regionDebug,internalDebug:internalDebug,supportDebug:supportDebug}};
  }

  return {VERSION:VERSION,process:process,getBBox:getBBox,labelComponents:labelComponents,selectComponents:selectComponents,fillHoles:fillHoles,buildDetailMap:buildDetailMap,buildFeatureMasks:buildFeatureMasks};
});
