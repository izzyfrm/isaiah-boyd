// Cloudflare Pages Function: /rblx/api/games
const places=[99832303399510,99841965770897,127034224100534];
const H={Accept:"application/json","User-Agent":"Mozilla/5.0 (compatible; isaiah-boyd-portfolio)"};
async function getJSON(url){
  const r=await fetch(url,{headers:H,signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error(url.split("?")[0]+" -> "+r.status);
  return r.json();
}
export async function onRequestGet(){
  // resolve each place independently so one failure doesn't break the rest
  const resolved=await Promise.all(places.map(async placeId=>{
    try{return {placeId,universeId:(await getJSON("https://apis.roblox.com/universes/v1/places/"+placeId+"/universe")).universeId}}
    catch{return {placeId,universeId:null}}
  }));
  const ids=resolved.map(x=>x.universeId).filter(Boolean).join(",");
  let details=new Map(),images=new Map(),error=null;
  if(ids){
    const [info,thumbs]=await Promise.allSettled([
      getJSON("https://games.roblox.com/v1/games?universeIds="+ids),
      getJSON("https://thumbnails.roblox.com/v1/games/icons?universeIds="+ids+"&size=512x512&format=Png&isCircular=false")]);
    if(info.status==="fulfilled")details=new Map((info.value.data||[]).map(x=>[String(x.id),x]));else error=String(info.reason);
    if(thumbs.status==="fulfilled")images=new Map((thumbs.value.data||[]).map(x=>[String(x.targetId),x.imageUrl]));
  }else error="Could not resolve universes";
  const games=resolved.map(x=>{const g=details.get(String(x.universeId));
    return {placeId:x.placeId,universeId:x.universeId,visits:g?.visits??null,playing:g?.playing??null,favorites:g?.favoritedCount??null,image:images.get(String(x.universeId))||null}});
  return Response.json({games,error},{headers:{"Cache-Control":error?"no-store":"public, max-age=60"}});
}
