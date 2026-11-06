export type XY = { x: number; y: number }
export type Obstacle = { left: number; top: number; right: number; bottom: number }
export const contains = (p: XY, r: Obstacle) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom
const intersects = (a: XY,b: XY,r: Obstacle) => a.x === b.x
  ? a.x > r.left && a.x < r.right && Math.max(a.y,b.y) > r.top && Math.min(a.y,b.y) < r.bottom
  : a.y > r.top && a.y < r.bottom && Math.max(a.x,b.x) > r.left && Math.min(a.x,b.x) < r.right

export const segmentClear = (a:XY,b:XY,obstacles:Obstacle[]) => !obstacles.some(r=>intersects(a,b,r))

/** Manhattan visibility routing around measured DOM rectangles; no curves. */
export function route(start:XY,end:XY,obstacles:Obstacle[],width:number):XY[]|null {
  const low=Math.min(start.y,end.y)-90, high=Math.max(start.y,end.y)+90
  const blocks=obstacles.filter(r=>r.bottom>low&&r.top<high)
  if(blocks.some(r=>contains(start,r)||contains(end,r))) return null
  // Prefer a straight line, one elbow, or a simple dogleg before visibility search.
  const mx=(start.x+end.x)/2,my=(start.y+end.y)/2
  const simple:XY[][]=[
    ...(start.x===end.x||start.y===end.y?[[start,end]]:[]),
    [start,{x:start.x,y:end.y},end],
    [start,{x:end.x,y:start.y},end],
    [start,{x:mx,y:start.y},{x:mx,y:end.y},end],
    [start,{x:start.x,y:my},{x:end.x,y:my},end],
  ]
  for(const path of simple)if(path.every((p,i)=>i===0||segmentClear(path[i-1],p,blocks)))return path.filter((p,i)=>i===0||p.x!==path[i-1].x||p.y!==path[i-1].y)
  const xs=[...new Set([0,width,start.x,end.x,...blocks.flatMap(r=>[r.left,r.right]).filter(x=>x>=0&&x<=width)])].sort((a,b)=>a-b)
  const ys=[...new Set([low,high,start.y,end.y,...blocks.flatMap(r=>[r.top,r.bottom]).filter(y=>y>=low&&y<=high)])].sort((a,b)=>a-b)
  const count=xs.length, startKey=ys.indexOf(start.y)*count+xs.indexOf(start.x), endKey=ys.indexOf(end.y)*count+xs.indexOf(end.x)
  const distances=new Map<number,number>([[startKey,0]]), parents=new Map<number,number>()
  const heap:{key:number;score:number}[]=[]
  const push=(key:number,score:number)=>{heap.push({key,score});let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}}
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;while(true){let next=i;const l=i*2+1,r=l+1;if(l<heap.length&&heap[l].score<heap[next].score)next=l;if(r<heap.length&&heap[r].score<heap[next].score)next=r;if(next===i)break;[heap[i],heap[next]]=[heap[next],heap[i]];i=next}}return first}
  const point=(key:number)=>({x:xs[key%count],y:ys[Math.floor(key/count)]})
  push(startKey,0)
  const visited=new Set<number>()
  while(heap.length){
    const current=pop().key
    if(visited.has(current))continue
    if(current===endKey){const result:XY[]=[];let at=current;while(true){result.unshift(point(at));if(at===startKey)break;at=parents.get(at)!}return result.filter((p,i)=>i===0||i===result.length-1||!((result[i-1].x===p.x&&p.x===result[i+1].x)||(result[i-1].y===p.y&&p.y===result[i+1].y)))}
    visited.add(current)
    const x=current%count,y=Math.floor(current/count),a=point(current)
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(nx<0||nx>=count||ny<0||ny>=ys.length)continue
      const key=ny*count+nx,b=point(key)
      if(visited.has(key)||blocks.some(r=>intersects(a,b,r)))continue
      const cost=distances.get(current)!+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+.1
      if(cost>=(distances.get(key)??Infinity))continue
      distances.set(key,cost);parents.set(key,current)
      push(key,cost+Math.abs(b.x-end.x)+Math.abs(b.y-end.y))
    }
  }
  return null
}
