import { useEffect, useId, useRef, useState } from "react"
import { faces, project, scenes, type Part } from "./geometry"
import "./isometric.css"

const captions = [
  {title:"Authority cabinet", hint:"Identity is recorded; the owner controls the live grant.", readout:"Key · scope · budget · expiry", subject:"The grant drawer and its owner-controlled switch",parts:["Identity reader","Permission drawers","Owner switch"]},
  {title:"Intent terminal", hint:"The console assembles a request for one bounded action.", readout:"payAmount · 0.0001 ETH", subject:"The terminal display and encoded intent ticket",parts:["Console terminal","Intent fields","Encoded request"]},
  {title:"Signing press", hint:"The agent key signs one transaction containing two frames.", readout:"VERIFY + SENDER", subject:"A signing die over two transaction frame plates",parts:["Signing die","Verify plate","Sender plate"]},
  {title:"Simulation scanner", hint:"Inspect execution separately from canonical eligibility.", readout:"Canonical: foreign read ineligible", subject:"An optical head scans the prepared transaction",parts:["Prepared packet","Trace scanner","Eligibility result"]},
  {title:"Admission switch", hint:"The canonical lane is blocked; a staked account has an alternative path.", readout:"Same devnet · different admission rules", subject:"A closed canonical barrier beside a stake-supported alternative gate",parts:["Canonical barrier","Staked admission gate","Stake weights"]},
  {title:"Settlement recorder", hint:"Check time and budget, execute the call, then record the outcome.", readout:"Successful agent call → counter +10", subject:"A budget meter beside a counter and printed receipt",parts:["Budget meter","Result counter","Receipt output"]},
]

const diagramTitles = [["Define", "authority"], ["Shape the", "intent"], ["Sign the", "action"], ["Inspect", "execution"], ["Enter the", "alt mempool"], ["Settle", "onchain"]]

const labels: { text: string; point: readonly [number,number,number]; x: number; y: number }[][] = [
  [{text:"Identity reader",point:[30,85,29],x:88,y:90},{text:"Live grant drawers",point:[112,109,50],x:400,y:55},{text:"Owner control",point:[202,88,48],x:445,y:310}],
  [{text:"Console request",point:[86,106,50],x:88,y:80},{text:"Encoded intent",point:[185,85,27],x:430,y:300}],
  [{text:"Agent signing die",point:[110,65,69],x:400,y:45},{text:"VERIFY + SENDER",point:[104,80,38],x:88,y:110},{text:"Signing mechanism",point:[190,60,70],x:445,y:305}],
  [{text:"Prepared transaction",point:[70,70,23],x:88,y:95},{text:"Execution scanner",point:[112,65,98],x:395,y:45},{text:"Eligibility trace",point:[193,138,35],x:435,y:310}],
  [{text:"Canonical barrier",point:[140,46,42],x:395,y:70},{text:"Staked admission gate",point:[130,105,73],x:88,y:95},{text:"Stake requirement",point:[195,106,32],x:435,y:310}],
  [{text:"Epoch budget",point:[50,80,25],x:88,y:90},{text:"Onchain result",point:[150,114,48],x:430,y:305},{text:"Transaction receipt",point:[150,82,71],x:395,y:55}],
]

function Solid({part}: {part: Part}) {
  const f=faces(part)
  return <g className={`iso-part iso-tone-${part.tone}`}><polygon className="iso-face-left" points={f.left}/><polygon className="iso-face-right" points={f.right}/><polygon className="iso-face-top" points={f.top}/></g>
}

/** Crafted SVG only; no canvas, external runtime or per-frame React updates. */
export function AuthorityMachine({stage,active}: {stage:number;active:boolean}) {
  const id=useId()
  const ref=useRef<HTMLElement>(null)
  const [visible,setVisible]=useState(false)
  useEffect(()=>{
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.1})
    if(ref.current) observer.observe(ref.current)
    return ()=>observer.disconnect()
  },[])
  const meta=captions[stage]
  const moving=active&&visible
  const packet:Part={name:"transaction packet",x:stage===4?38:48,y:stage===4?100:62,z:stage===4?16:18,w:31,d:23,h:5,tone:"accent"}
  const seal=project([packet.x+9,packet.y+8,packet.z+packet.h+.2])
  return <figure ref={ref} className={`authority-machine ${moving?"is-running":""}`} aria-label={meta.title}>
    <svg viewBox="70 0 530 390" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{meta.title}</title><desc id={`${id}-desc`}>{meta.subject}. Illustrative mechanism for the Axon demo, not a live transaction.</desc>
      <defs><radialGradient id={`${id}-shadow`}><stop offset="0" stopColor="var(--iso-shadow)" stopOpacity=".35"/><stop offset="1" stopColor="var(--iso-shadow)" stopOpacity="0"/></radialGradient></defs>
      <ellipse cx="357" cy="305" rx="220" ry="57" fill={`url(#${id}-shadow)`}/>
      <g className="iso-assembly">
        {scenes[stage].map((part,index)=><Solid key={`${part.name}-${index}`} part={part}/>)}
        {(stage===3||stage===4)&&<g className={`iso-packet ${stage===4?"iso-packet-admission":""}`}><Solid part={packet}/><path d={`M${seal[0]} ${seal[1]} l5 3 l9 -5`} className="iso-packet-seal"/></g>}
        {stage===2&&<g className="iso-stamp"><Solid part={{name:"moving signature seal",x:98,y:58,z:52,w:23,d:23,h:3,tone:"accent"}}/></g>}
      </g>
      <g className="iso-diagram-heading" transform={`translate(${[385,405,390,395,390,400][stage]} ${[175,185,180,175,180,180][stage]})`} aria-hidden="true">
        <rect x="-10" y="-6" width={Math.max(...diagramTitles[stage].map(line=>line.length))*13+24} height="68"/>
        <text x="2" y="22">{diagramTitles[stage].map((line,index)=><tspan key={line} x="2" dy={index?27:0}>{line}</tspan>)}</text>
      </g>
      <g className="iso-annotations" aria-hidden="true">
        {labels[stage].map(({text,point,x,y})=>{
          const [px,py]=project(point)
          const endX=x<px?x+130:x
          return <g key={text}><path d={`M${px} ${py} V${y+10} H${endX}`} /><circle cx={px} cy={py} r="2"/><rect x={x} y={y} width="132" height="20"/><text x={x+7} y={y+13}>{text}</text></g>
        })}
      </g>
    </svg>
  </figure>
}
