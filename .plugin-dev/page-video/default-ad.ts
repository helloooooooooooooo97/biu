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

function KineticTitle({k, lines, accent, time, fps, leave, springFn}) {
  let glyphOffset = 0;
  const titleLines = lines.map(function(line, lineIndex) {
    const lineStart = glyphOffset;
    glyphOffset += line.length;
    const glyphs = line.split("").map(function(char, charIndex) {
      const i = lineStart+charIndex;
      const p = springFn({frame:time*fps-i*1.35, fps, durationInFrames:20, config:{stiffness:210,damping:24}});
      const y = (1-p)*110*k;
      return React.createElement("span", {
        key:charIndex,
        style:{display:"inline-block", whiteSpace:"pre", opacity:p*leave, transform:"translateY("+y+"px) rotate("+(1-p)*3+"deg)"}
      }, char);
    });
    return React.createElement("div", {
      key:lineIndex,
      style:{display:"flex", whiteSpace:"nowrap", color:lineIndex===1 ? accent : "#F7F5F2"}
    }, glyphs);
  });
  return <div style={{display:"flex", flexDirection:"column", alignItems:"flex-start", maxWidth:1550*k, fontSize:126*k, lineHeight:.98, fontWeight:780, letterSpacing:-5*k}}>{titleLines}</div>;
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

export default function AdScene({time, progress, durationInFrames, fps, width, content, color, interpolate, spring, AbsoluteFill}) {
  const fields = String(content||"").split("|");
  const eyebrow = fields[0]||"BIU VIDEO";
  const counter = fields[1]||"01 / 01";
  const lines = [fields[2]||"一块内容", fields[3]||"也能是一支片"];
  const note = fields[4]||"";
  const hold = fields[5]==="hold";
  const duration = durationInFrames/fps;
  const enter = spring({frame:time*fps, fps, durationInFrames:24, config:{stiffness:180,damping:22}});
  const leave = hold ? 1 : interpolate(time,[duration-1.25,duration-.25],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const noteIn = interpolate(time,[.7,1.3],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const drift = interpolate(progress,[0,1],[-28,28],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const k = width/1920;
  return (
    <AbsoluteFill style={{background:"#191919", color:"#F7F5F2", overflow:"hidden", fontFamily:"Inter, ui-sans-serif, system-ui"}}>
      <Grid k={k} drift={drift} />
      <Glow k={k} accent={color} enter={enter} />
      <Meta k={k} eyebrow={eyebrow} counter={counter} accent={color} enter={enter} />
      <div style={{position:"absolute", left:120*k, right:120*k, top:"50%", transform:"translateY(-52%)"}}>
        <KineticTitle k={k} lines={lines} accent={color} time={time} fps={fps} leave={leave} springFn={spring} />
        <Note k={k} text={note} accent={color} opacity={noteIn*leave} reveal={enter*leave} />
      </div>
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
