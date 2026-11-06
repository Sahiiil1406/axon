import "./flow-connectors.css"
import { useEffect, useId, useRef, useState, type RefObject } from "react"
import { route, segmentClear, type Obstacle, type XY } from "./flow-routing"

const links = [
  [0,0,0,1,"Owner grants","left"],[0,1,1,0,"Request action","top"],
  [1,0,2,0,"Prepare","top"],[2,0,2,1,"Sign intent","left"],[2,1,3,0,"Simulate","top"],
  [3,0,3,1,"Canonical check","left"],[3,1,4,0,"Alternative path","top"],
  [4,0,4,1,"Authority valid","left"],[4,1,5,0,"Submit + include","top"],
  [5,0,5,1,"Success","top"],[5,0,5,2,"Check failed","top"],
] as const
interface Wire { fromStage:number; toStage:number; d:string; start:XY; end:XY; label:string; x:number; y:number; rotated:boolean }
const overlap=(a:Obstacle,b:Obstacle)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top

export function FlowConnectors({storyRef,activeStage}:{storyRef:RefObject<HTMLDivElement|null>;activeStage:number}) {
  const id=useId()
  const [visible,setVisible]=useState(false)
  useEffect(()=>{
    if(!storyRef.current)return
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting))
    observer.observe(storyRef.current)
    return()=>observer.disconnect()
  },[storyRef])
  const [drawing,setDrawing]=useState<{width:number;height:number;wires:Wire[]}>({width:1,height:1,wires:[]})
  const cache=useRef("")
  useEffect(()=>{
    const story=storyRef.current
    if(!story)return
    let frame=0,cancelled=false
    const measure=()=>{
      frame=0
      if(cancelled)return
      const root=story.getBoundingClientRect(), margin=28, width=root.width+margin*2
      const rect=(element:Element,pad=9):Obstacle=>{const r=element.getBoundingClientRect();return {left:r.left-root.left+margin-pad,right:r.right-root.left+margin+pad,top:r.top-root.top-pad,bottom:r.bottom-root.top+pad}}
      const allCards=Array.from(story.querySelectorAll('.app-flow-card'))
      const other=Array.from(story.querySelectorAll('.iso-annotations > g > rect,.iso-legend,.authority-machine figcaption,.authority-machine footer,.authority-machine > header,.flow-step-label,.flow-scroll-intro'))
      const fixed=[...allCards,...other].map(element=>({element,box:rect(element)}))
      const labelObstacles=Array.from(story.querySelectorAll(".iso-assembly")).map(element=>rect(element,5))
      const occupied:Obstacle[]=[],wires:Wire[]=[]
      for(const [fromStage,fromIndex,toStage,toIndex,label,incoming] of links){
        const from=story.querySelectorAll(`[data-flow-stage="${fromStage}"] .app-flow-card`)[fromIndex]
        const to=story.querySelectorAll(`[data-flow-stage="${toStage}"] .app-flow-card`)[toIndex]
        if(!from||!to)continue
        const a=rect(from,0),b=rect(to,0)
        const obstacles=fixed.filter(item=>allCards.includes(item.element)).map(item=>item.box).concat(occupied)
        // Every action leaves the bottom. Align top ports where cards overlap,
        // and use a single elbow for side entries whenever geometry permits.
        const sharedLeft=Math.max(a.left,b.left)+20, sharedRight=Math.min(a.right,b.right)-20
        const sharedX=sharedLeft<=sharedRight?(sharedLeft+sharedRight)/2:null
        const sourceXs=sharedX!==null&&incoming==="top"?[sharedX]:[(a.left+a.right)/2,a.left+24,a.right-24]
        const pairs=sourceXs.map(x=>{
          const start={x,y:a.bottom},out={x,y:a.bottom+18}
          const end=incoming==="top"?{x:sharedX??(b.left+b.right)/2,y:b.top}:{x:incoming==="left"?b.left:b.right,y:(b.top+b.bottom)/2}
          const into=incoming==="top"?{x:end.x,y:end.y-18}:{x:end.x+(incoming==="left"?-18:18),y:end.y}
          return {start,out,end,into}
        })
        const best:{points:XY[]|null}={points:null}
        let bestScore=Infinity
        const simplify=(path:XY[])=>path.filter((point,index)=>
          index===0||index===path.length-1||
          !((path[index-1].x===point.x&&point.x===path[index+1].x)||
            (path[index-1].y===point.y&&point.y===path[index+1].y)))
        const consider=(path:XY[])=>{
          const candidate=simplify(path)
          const length=candidate.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-candidate[i].x)+Math.abs(p.y-candidate[i].y),0)
          const score=(candidate.length-2)*10000+length
          if(score<bestScore){bestScore=score;best.points=candidate}
        }
        for(const pair of pairs){
          if(pair.out.x<0||pair.out.x>width||pair.into.x<0||pair.into.x>width)continue
          const unrelated=fixed.filter(item=>allCards.includes(item.element)&&item.element!==from&&item.element!==to).map(item=>item.box).concat(occupied)
          if(!segmentClear(pair.start,pair.out,unrelated)||!segmentClear(pair.into,pair.end,unrelated))continue
          const elbow={x:pair.start.x,y:pair.end.y}
          const direct=incoming==="top"&&pair.start.x===pair.end.x&&pair.end.y>pair.start.y
            ?[pair.start,pair.end]
            :incoming!=="top"&&pair.end.y>pair.out.y&&
              (incoming==="left"?pair.start.x<pair.into.x:pair.start.x>pair.into.x)
              ?[pair.start,elbow,pair.end]:null
          if(direct&&direct.slice(1).every((point,index)=>segmentClear(direct[index],point,unrelated))){consider(direct);continue}
          // Top entries on staggered cards need two turns. Try a clear
          // horizontal bridge before falling back to obstacle routing.
          if(incoming==="top"&&pair.into.y>pair.out.y){
            for(const y of [(pair.out.y+pair.into.y)/2,pair.out.y,pair.into.y]){
              const candidate=[pair.start,{x:pair.start.x,y},{x:pair.end.x,y},pair.end]
              if(candidate.slice(1).every((point,index)=>segmentClear(candidate[index],point,unrelated)))consider(candidate)
            }
          }
          const routed=route(pair.out,pair.into,obstacles,width)
          if(routed)consider([pair.start,...routed,pair.end])
        }
        const points=best.points
        if(!points)continue
        for(let i=1;i<points.length-1;){
          const a=points[i-1],b=points[i],c=points[i+1]
          if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))points.splice(i,1)
          else i++
        }
        const segments=points.slice(1).map((p,i)=>({a:points![i],b:p,length:Math.abs(p.x-points![i].x)+Math.abs(p.y-points![i].y)})).sort((a,b)=>b.length-a.length)
        let labelPosition:{x:number;y:number;rotated:boolean}|undefined
        const labelWidth=label.length*5.4+18
        for(const segment of segments){
          const rotated=segment.a.x===segment.b.x
          if(segment.length<labelWidth+14)continue
          for(const t of [.5,.3,.7]){
            const x=segment.a.x+(segment.b.x-segment.a.x)*t,y=segment.a.y+(segment.b.y-segment.a.y)*t
            const box={left:x-(rotated?10:labelWidth/2),right:x+(rotated?10:labelWidth/2),top:y-(rotated?labelWidth/2:10),bottom:y+(rotated?labelWidth/2:10)}
            if(!fixed.some(item=>overlap(box,item.box))&&!labelObstacles.some(item=>overlap(box,item))&&!occupied.some(item=>overlap(box,item))){labelPosition={x,y,rotated};occupied.push(box);break}
          }
          if(labelPosition)break
        }
        for(const {a,b,length} of segments)if(length>40)occupied.push({left:Math.min(a.x,b.x)+(a.x===b.x?-4:16),right:Math.max(a.x,b.x)+(a.x===b.x?4:-16),top:Math.min(a.y,b.y)+(a.y===b.y?-4:16),bottom:Math.max(a.y,b.y)+(a.y===b.y?4:-16)})
        wires.push({fromStage,toStage,d:points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),start:points[0],end:points[points.length-1],label,...(labelPosition??{x:-1000,y:-1000,rotated:false})})
      }
      const last=story.lastElementChild?.getBoundingClientRect()
      const next={width,height:Math.ceil((last?.bottom??root.bottom)-root.top),wires}, serialized=JSON.stringify(next)
      if(cache.current!==serialized){cache.current=serialized;setDrawing(next)}
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)}
    const observer=new ResizeObserver(schedule)
    observer.observe(story)
    story.querySelectorAll('.flow-stage-composition,.app-flow-card').forEach(element=>observer.observe(element))
    document.fonts.ready.then(schedule)
    window.addEventListener('resize',schedule)
    schedule()
    return()=>{cancelled=true;observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule)}
  },[storyRef])
  return <svg className={`flow-routed-connectors ${visible?"is-visible":""}`} style={{position:"absolute",left:-28,top:0,overflow:"visible",pointerEvents:"none",zIndex:1}} width={drawing.width} height={drawing.height} viewBox={`0 0 ${drawing.width} ${drawing.height}`} aria-hidden="true" data-connection-count={drawing.wires.length}>
    <defs><marker id={id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L6 3.5 L0 7" fill="none" stroke="currentColor" strokeWidth="1.6"/></marker></defs>
    {drawing.wires.map((wire,index)=><g key={index} className={`${wire.fromStage===activeStage||wire.toStage===activeStage?"is-current":""} ${wire.fromStage===0||wire.label==="Success"?"flow-wire-green":"flow-wire-cyan"}`}><path className="flow-route-underlay" d={wire.d}/><path className="flow-route-line" d={wire.d} markerEnd={`url(#${id})`}/><path className="flow-route-pulse" d={wire.d} pathLength="1"/><circle cx={wire.start.x} cy={wire.start.y} r="3"/><g transform={`translate(${wire.x} ${wire.y})${wire.rotated?' rotate(-90)':''}`}><rect x={-(wire.label.length*5.4+18)/2} y="-10" width={wire.label.length*5.4+18} height="20"/><text textAnchor="middle" dominantBaseline="central">{wire.label}</text></g></g>)}
  </svg>
}
