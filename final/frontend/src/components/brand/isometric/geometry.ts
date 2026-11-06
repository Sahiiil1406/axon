/** Orthographic camera: 45° azimuth, 30° elevation. All shapes share this world. */
export type Point = readonly [number, number, number]
export type Tone = "base" | "body" | "high" | "accent" | "ink"
export interface Part { x: number; y: number; z: number; w: number; d: number; h: number; tone: Tone; name: string }
export const project = ([x, y, z]: Point) => [320 + (x - y) * .866, 152 + (x + y) * .5 - z] as const
export const polygon = (points: Point[]) => points.map(point => project(point).join(",")).join(" ")
export function faces(p: Part) {
  const { x, y, z, w, d, h } = p
  return {
    left: polygon([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]]),
    right: polygon([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]]),
    top: polygon([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]]),
  }
}
export function makeScene(stage: number) {
  const parts: Part[] = []
  const add = (name: string, x: number, y: number, z: number, w: number, d: number, h: number, tone: Tone = "body") => parts.push({name,x,y,z,w,d,h,tone})
  // A machined bench: feet, mounting base, fascia, fasteners and two ruler rails.
  for (const x of [5,225]) for (const y of [5,135]) add("isolation foot",x,y,-12,10,10,12,"ink")
  add("bench lower casting",0,0,0,240,150,8,"base")
  add("bench upper plate",2,2,8,236,146,4,"body")
  add("front label inlay",14,147,3,68,2,5,"ink")
  for (let i=0;i<22;i++) add("front calibration tick",10+i*10,140,12,1,i%5===0?7:4,.5,"high")
  for (const x of [8,228]) for (const y of [8,138]) add("mounting bolt",x,y,12,3,3,1,"high")
  if(stage===0) {
    add("registry cabinet",65,35,12,104,70,70)
    add("cabinet cap",62,32,82,110,76,4,"high")
    for(let i=0;i<4;i++) {
      add("permission drawer",72,105,20+i*15,90,3,12,i===1?"high":"base")
      add("drawer handle",104,108,23+i*15,25,5,3,"high")
      add("record indicator",80,109,24+i*15,4,1,4,i===1?"accent":"ink")
    }
    add("identity reader pedestal",14,65,12,35,45,12,"base")
    add("identity reader",17,68,24,29,39,5,"high")
    for(let i=0;i<5;i++) add("identity contact",20+i*4,72,29,2,12,1,"accent")
    add("grant switch socket",190,75,12,28,28,10,"base")
    add("grant switch spindle",200,85,22,7,7,22,"high")
    add("grant switch handle",191,83,44,26,10,4,"accent")
  } else if(stage===1) {
    add("terminal base",28,30,12,110,78,12,"base")
    add("terminal body",35,35,24,96,64,42)
    add("display bezel",40,100,35,86,5,29,"ink")
    add("display window",45,105,39,76,1,21,"high")
    for(let i=0;i<3;i++) add("intent field",51,106,43+i*5,50-i*9,1,1,"accent")
    add("keyboard tray",35,113,12,100,22,4,"high")
    for(let row=0;row<3;row++) for(let col=0;col<12;col++) add("keyboard key",40+col*7.2,116+row*5,16,5,3,2,"body")
    add("ticket output pedestal",164,55,12,46,65,12,"base")
    add("intent ticket",168,61,24,38,49,3,"accent")
    for(let i=0;i<5;i++) add("encoded field",173,67+i*7,27,27-i%2*8,1,.5,"ink")
  } else if(stage===2) {
    for(const x of [52,163]) for(const y of [35,101]) add("press guide post",x,y,12,5,5,98,"high")
    add("press crown",44,29,110,132,83,10,"body")
    add("signing ram",102,59,69,19,23,41,"high")
    add("signature die",90,50,62,43,41,7,"accent")
    for(let i=0;i<2;i++) {
      add(i===0?"sender plate":"verify plate",61,43,16+i*19,102,60,7,i===1?"high":"body")
      for(let j=0;j<6;j++) add("frame contact",66+j*15,98,23+i*19,8,3,1,"accent")
    }
    add("press lever mount",180,50,12,21,25,30,"base")
    add("press lever",188,60,42,5,5,48,"high")
    add("lever grip",182,55,90,17,15,5,"ink")
  } else if(stage===3) {
    for(const y of [38,103]) add("scanner rail",20,y,14,195,5,5,"high")
    for(let i=0;i<14;i++) add("conveyor slat",25+i*13,45,12,8,56,5,"body")
    for(const y of [30,108]) add("scan gantry upright",107,y,12,10,12,86,"body")
    add("scanner bridge",104,30,98,16,90,10,"high")
    add("optical scan head",106,52,90,12,46,8,"accent")
    add("result instrument",174,115,12,42,22,32,"base")
    add("result window",179,137,25,32,1,14,"high")
    for(let i=0;i<6;i++) add("trace segment",182+i*4,138,28+i%3*3,2,1,2,"accent")
  } else if(stage===4) {
    for(const y of [34,92]) {
      add("admission lane",15,y,12,210,28,3,"base")
      for(let i=0;i<11;i++) add("lane guide",24+i*18,y+2,15,8,2,1,"high")
    }
    for(const y of [32,58]) add("canonical barrier mount",138,y,15,8,7,19,"body")
    add("closed canonical barrier",138,32,34,8,33,8,"ink")
    add("stake foundation",112,87,15,47,39,13,"high")
    for(const y of [88,119]) add("alternative gate post",127,y,28,7,7,45,"body")
    add("alternative gate crown",127,88,73,7,38,5,"accent")
    for(let i=0;i<3;i++) add("stake weight",184,95,15+i*7,27,24,5,"high")
    for(let i=0;i<3;i++) add("gate status light",129,122,39+i*9,3,2,3,"accent")
  } else {
    add("settlement recorder",113,37,12,84,72,54,"body")
    add("counter bezel",121,109,36,68,4,25,"ink")
    for(let i=0;i<3;i++) {
      add("counter wheel",126+i*20,113,41,16,2,15,"high")
      add("counter segment",130+i*20,115,47,8,1,2,i===2?"accent":"ink")
    }
    add("receipt outlet",122,52,66,66,20,4,"ink")
    add("receipt paper",126,60,70,58,47,1,"high")
    for(let i=0;i<5;i++) add("receipt text",131,66+i*7,71,40-i%2*12,1,.3,"body")
    add("budget meter base",25,55,12,55,55,10,"base")
    for(let i=0;i<8;i++) add("remaining budget segment",31+i*5,62,22,3,36,3,i<6?"accent":"body")
  }
  // Stable back-to-front painter order, shared by every scene and theme.
  return parts.sort((a,b)=> {
    const layerA = a.z + a.h <= 12 ? 0 : 1
    const layerB = b.z + b.h <= 12 ? 0 : 1
    return layerA - layerB || (a.x+a.y+a.w/2+a.d/2+a.z*.2)-(b.x+b.y+b.w/2+b.d/2+b.z*.2)
  })
}
export const scenes = Array.from({length:6},(_,stage)=>makeScene(stage))
