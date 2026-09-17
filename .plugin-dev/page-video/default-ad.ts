export const DEFAULT_AD_COMPONENT_SOURCE = `
const SCENES = [
  {eyebrow:"BIU VIDEO", title:["一块内容","也能是一支片"], note:"在页面里直接播放、修改、继续创作", accent:"#8B5CF6"},
  {eyebrow:"01 / DESCRIBE", title:["写下结构","Agent 编排节奏"], note:"\\x3Ctimeline>  \\x3Ctrack>  \\x3Ccomponent>", accent:"#38BDF8"},
  {eyebrow:"02 / TYPE", title:["文字不是出现","是登场"], note:"逐字、逐词、逐行，都跟着帧走", accent:"#F472B6"},
  {eyebrow:"03 / TRANSITION", title:["切换画面","不必打断情绪"], note:"遮罩推进 · 双画面交叠 · 连续运动", accent:"#FACC15"},
  {eyebrow:"04 / FOCUS", title:["镜头跟着","重点走"], note:"缩放、光标与标注，让视线有方向", accent:"#34D399"},
  {eyebrow:"05 / REACT", title:["不够表达？","直接写组件"], note:"frame + spring + interpolate + AbsoluteFill", accent:"#FB7185"},
  {eyebrow:"06 / SYNC", title:["脚本、时间轴、播放","始终同步"], note:"改完一行，下一帧就能看到", accent:"#60A5FA"},
  {eyebrow:"BIU", title:["从想法","到成片。"], note:"Agent 负责编排，你保留最终决定", accent:"#A78BFA"}
];

function Grid({k, drift}) {
  return <div style={{position:"absolute", inset:0, opacity:.16, backgroundImage:"linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize:(80*k)+"px "+(80*k)+"px", transform:"translateX("+drift*k+"px)"}} />;
}

function Glow({k, accent, enter}) {
  return <div style={{position:"absolute", width:900*k, height:900*k, right:-250*k, top:-420*k, borderRadius:"50%", background:accent, opacity:.12, filter:"blur("+(120*k)+"px)", transform:"scale("+(0.86+enter*.14)+")"}} />;
}

function Meta({k, eyebrow, index, total, accent, enter}) {
  return (
    <div>
      <div style={{position:"absolute", left:120*k, right:120*k, top:78*k, display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:18*k, letterSpacing:4*k, color:"rgba(247,245,242,.55)"}}>
        <span>{eyebrow}</span><span>{String(index+1).padStart(2,"0")} / {String(total).padStart(2,"0")}</span>
      </div>
      <div style={{position:"absolute", left:120*k, top:132*k, height:4*k, width:(120+enter*220)*k, background:accent}} />
    </div>
  );
}

function KineticTitle({k, lines, accent, local, fps, leave, springFn}) {
  let glyphOffset = 0;
  const titleLines = lines.map(function(line, lineIndex) {
    const lineStart = glyphOffset;
    glyphOffset += line.length;
    const glyphs = line.split("").map(function(char, charIndex) {
      const i = lineStart + charIndex;
      const p = springFn({frame:local*fps-i*1.35, fps, durationInFrames:20, config:{stiffness:210,damping:24}});
      const y = (1-p)*110*k;
      return React.createElement("span", {
        key:charIndex,
        style:{display:"inline-block", whiteSpace:"pre", opacity:p*leave, transform:"translateY("+y+"px) rotate("+(1-p)*3+"deg)"}
      }, char);
    });
    return React.createElement("div", {
      key:lineIndex,
      style:{display:"flex", whiteSpace:"nowrap", color:lineIndex === 1 ? accent : "#F7F5F2"}
    }, glyphs);
  });
  return <div style={{display:"flex", flexDirection:"column", alignItems:"flex-start", maxWidth:1550*k, fontSize:126*k, lineHeight:.98, fontWeight:780, letterSpacing:-5*k}}>{titleLines}</div>;
}

function Note({k, text, accent, local, leave, reveal, interpolateFn}) {
  const opacity = interpolateFn(local,[.7,1.3],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})*leave;
  return (
    <div style={{marginTop:48*k, display:"flex", alignItems:"center", gap:18*k, fontSize:25*k, letterSpacing:.5*k, color:"rgba(247,245,242,.64)", opacity:opacity, transform:"translateY("+(1-reveal)*18*k+"px)"}}>
      <span style={{width:9*k, height:9*k, borderRadius:"50%", background:accent}} />{text}
    </div>
  );
}

function Progress({k, index, local, sceneDuration, total, accent}) {
  const width = (index+Math.min(1,local/sceneDuration))/total*100;
  return (
    <div style={{position:"absolute", left:120*k, right:120*k, bottom:70*k, height:2*k, background:"rgba(255,255,255,.12)"}}>
      <div style={{height:"100%", width:width+"%", background:accent}} />
    </div>
  );
}

function Wipe({position, accent}) {
  return <div style={{position:"absolute", inset:"0 0 0 "+position+"%", background:accent, transform:"skewX(-7deg) scaleX(1.08)", transformOrigin:"left"}} />;
}

export default function BiuAd({time, fps, width, interpolate, spring, AbsoluteFill}) {
  const sceneDuration = 7;
  const index = Math.min(SCENES.length-1, Math.floor(time/sceneDuration));
  const scene = SCENES[index];
  const local = time-index*sceneDuration;
  const enter = spring({frame:local*fps, fps, durationInFrames:24, config:{stiffness:180,damping:22}});
  const leave = interpolate(local,[5.75,6.75],[1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const wipe = interpolate(local,[6.15,6.95],[110,-10],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const drift = interpolate(local,[0,7],[-28,28],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const k = width/1920;
  return (
    <AbsoluteFill style={{background:"#191919", color:"#F7F5F2", overflow:"hidden", fontFamily:"Inter, ui-sans-serif, system-ui"}}>
      <Grid k={k} drift={drift} />
      <Glow k={k} accent={scene.accent} enter={enter} />
      <Meta k={k} eyebrow={scene.eyebrow} index={index} total={SCENES.length} accent={scene.accent} enter={enter} />
      <div style={{position:"absolute", left:120*k, right:120*k, top:"50%", transform:"translateY(-52%)"}}>
        <KineticTitle k={k} lines={scene.title} accent={scene.accent} local={local} fps={fps} leave={leave} springFn={spring} />
        <Note k={k} text={scene.note} accent={scene.accent} local={local} leave={leave} reveal={enter*leave} interpolateFn={interpolate} />
      </div>
      <Progress k={k} index={index} local={local} sceneDuration={sceneDuration} total={SCENES.length} accent={scene.accent} />
      <Wipe position={wipe} accent={scene.accent} />
    </AbsoluteFill>
  );
}
`
