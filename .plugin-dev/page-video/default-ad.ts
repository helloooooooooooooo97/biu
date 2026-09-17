export const DEFAULT_AD_SCENE_SOURCE = `
function Grid({k, drift}) {
  return <div style={{position:"absolute", inset:0, opacity:.16, backgroundImage:"linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize:(80*k)+"px "+(80*k)+"px", transform:"translateX("+drift*k+"px)"}} />;
}

function Glow({k, accent, enter}) {
  return <div style={{position:"absolute", width:900*k, height:900*k, right:-250*k, top:-420*k, borderRadius:"50%", background:accent, opacity:.12, filter:"blur("+(120*k)+"px)", transform:"scale("+(0.86+enter*.14)+")"}} />;
}

function Meta({k, eyebrow, counter, accent, enter}) {
  return (
    <div>
      <div style={{position:"absolute", left:120*k, right:120*k, top:78*k, display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:18*k, letterSpacing:4*k, color:"rgba(247,245,242,.55)"}}>
        <span>{eyebrow}</span><span>{counter}</span>
      </div>
      <div style={{position:"absolute", left:120*k, top:132*k, height:4*k, width:(120+enter*220)*k, background:accent}} />
    </div>
  );
}

function KineticTitle({k, lines, accent, time, fps, leave, springFn, align, shift, size}) {
  let glyphOffset = 0;
  const titleLines = lines.map(function(line, lineIndex) {
    const lineStart = glyphOffset;
    glyphOffset += line.length;
    const glyphs = line.split("").map(function(char, charIndex) {
      const i = lineStart+charIndex;
      const p = springFn({frame:time*fps-i*1.15, fps, durationInFrames:18, config:{stiffness:180,damping:28}});
      const y = (1-p)*36*k;
      return React.createElement("span", {
        key:charIndex,
        style:{display:"inline-block", whiteSpace:"pre", opacity:p*leave, transform:"translateY("+y+"px) rotate("+(1-p)*.6+"deg)"}
      }, char);
    });
    return React.createElement("div", {
      key:lineIndex,
      style:{display:"flex", whiteSpace:"nowrap", color:lineIndex===1 ? accent : "#F7F5F2", transform:lineIndex===1 ? "translateX("+shift*k+"px)" : undefined}
    }, glyphs);
  });
  return <div style={{display:"flex", flexDirection:"column", alignItems:align, maxWidth:1550*k, fontSize:size*k, lineHeight:.98, fontWeight:780, letterSpacing:-5*k}}>{titleLines}</div>;
}

function Note({k, text, accent, opacity, reveal}) {
  return (
    <div style={{marginTop:48*k, display:"flex", alignItems:"center", gap:18*k, fontSize:25*k, letterSpacing:.5*k, color:"rgba(247,245,242,.64)", opacity:opacity, transform:"translateY("+(1-reveal)*18*k+"px)"}}>
      <span style={{width:9*k, height:9*k, borderRadius:"50%", background:accent}} />{text}
    </div>
  );
}

function Progress({k, progress, accent}) {
  return (
    <div style={{position:"absolute", left:120*k, right:120*k, bottom:70*k, height:2*k, background:"rgba(255,255,255,.12)"}}>
      <div style={{height:"100%", width:progress*100+"%", background:accent}} />
    </div>
  );
}

function SceneLayout({variant, k, color, counter, progress, children}) {
  if (variant==="hero") return <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center"}}>{children}</div>;
  if (variant==="split") return (
    <div style={{position:"absolute", left:120*k, right:120*k, top:190*k, bottom:120*k, display:"grid", gridTemplateColumns:"38% 62%", alignItems:"center"}}>
      <div style={{fontSize:310*k, fontWeight:800, lineHeight:1, color:color, opacity:.28}}>{counter.slice(0,2)}</div>
      <div>{children}</div>
    </div>
  );
  if (variant==="marquee") return (
    <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", textAlign:"center"}}>
      <div style={{position:"absolute", left:-80*k, top:260*k, fontSize:210*k, fontWeight:850, letterSpacing:-8*k, whiteSpace:"nowrap", color:color, opacity:.09, transform:"translateX("+(progress*-220)*k+"px)"}}>TYPE TYPE TYPE</div>
      <div style={{position:"relative"}}>{children}</div>
    </div>
  );
  if (variant==="focus") return (
    <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", textAlign:"center"}}>
      <div style={{position:"absolute", width:650*k, height:650*k, border:"2px solid "+color, borderRadius:"50%", opacity:.35, transform:"scale("+(0.8+progress*.25)+")"}} />
      <div style={{position:"relative"}}>{children}</div>
    </div>
  );
  if (variant==="code") return (
    <div style={{position:"absolute", left:120*k, right:120*k, top:205*k, bottom:120*k, display:"grid", gridTemplateColumns:"44% 56%", alignItems:"center", gap:90*k}}>
      <div style={{padding:42*k, border:"1px solid rgba(255,255,255,.16)", borderRadius:18*k, background:"rgba(0,0,0,.28)", fontFamily:"ui-monospace, monospace", fontSize:22*k, lineHeight:1.9, color:"rgba(255,255,255,.6)"}}>
        <div style={{color:color}}>function Frame()</div><div>const p = spring(frame)</div><div>return &lt;AbsoluteFill /&gt;</div>
      </div>
      <div>{children}</div>
    </div>
  );
  if (variant==="stack") return (
    <div style={{position:"absolute", left:120*k, right:120*k, top:200*k, bottom:120*k}}>
      <div style={{position:"absolute", width:760*k, height:350*k, right:0, top:75*k, border:"2px solid "+color, borderRadius:24*k, opacity:.18, transform:"rotate(7deg)"}} />
      <div style={{position:"absolute", width:760*k, height:350*k, right:35*k, top:40*k, border:"2px solid "+color, borderRadius:24*k, opacity:.35, transform:"rotate(3deg)"}} />
      <div style={{position:"relative", paddingTop:90*k}}>{children}</div>
    </div>
  );
  if (variant==="finale") return <div style={{position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", transform:"scale("+(0.96+progress*.04)+")"}}>{children}</div>;
  return <div style={{position:"absolute", left:120*k, right:120*k, top:"50%", transform:"translateY(-52%)"}}>{children}</div>;
}

export default function AdScene({time, progress, durationInFrames, fps, width, content, color, variant, interpolate, spring, AbsoluteFill}) {
  const fields = String(content||"").split("|");
  const eyebrow = fields[0]||"BIU VIDEO";
  const counter = fields[1]||"01 / 01";
  const lines = [fields[2]||"一块内容", fields[3]||"也能是一支片"];
  const note = fields[4]||"";
  const hold = fields[5]==="hold";
  const duration = durationInFrames/fps;
  const enter = spring({frame:time*fps, fps, durationInFrames:24, config:{stiffness:180,damping:22}});
  const leave = hold ? 1 : interpolate(time,[duration-.65,duration-.1],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const noteIn = interpolate(time,[.3,.65],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const drift = interpolate(progress,[0,1],[-28,28],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const k = width/1920;
  const centered = variant==="hero" || variant==="marquee" || variant==="focus" || variant==="finale";
  const titleSize = variant==="code" ? 104 : variant==="stack" ? 112 : 126;
  const lineShift = variant==="stagger" ? 190 : 0;
  return (
    <AbsoluteFill style={{background:"#191919", color:"#F7F5F2", overflow:"hidden", fontFamily:"Inter, ui-sans-serif, system-ui"}}>
      <Grid k={k} drift={drift} />
      <Glow k={k} accent={color} enter={enter} />
      <Meta k={k} eyebrow={eyebrow} counter={counter} accent={color} enter={enter} />
      <SceneLayout variant={variant} k={k} color={color} counter={counter} progress={progress}>
        <KineticTitle k={k} lines={lines} accent={color} time={time} fps={fps} leave={leave} springFn={spring} align={centered ? "center" : "flex-start"} shift={lineShift} size={titleSize} />
        <Note k={k} text={note} accent={color} opacity={noteIn*leave} reveal={enter*leave} />
      </SceneLayout>
      <Progress k={k} progress={progress} accent={color} />
    </AbsoluteFill>
  );
}
`

export const DEFAULT_AD_WIPE_SOURCE = `
export default function AdWipe({progress, color, interpolate, AbsoluteFill}) {
  const left = interpolate(progress,[0,1],[110,-10],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  return <AbsoluteFill style={{left:left+"%", background:color, transform:"skewX(-7deg) scaleX(1.08)", transformOrigin:"left"}} />;
}
`
