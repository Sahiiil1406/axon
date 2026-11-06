import test from 'node:test'
import assert from 'node:assert/strict'
import { route } from '../src/components/brand/isometric/flow-routing.ts'

test('routes around an illustration with orthogonal segments',()=>{
  const obstacle={left:30,right:70,top:20,bottom:80}
  const result=route({x:10,y:50},{x:90,y:50},[obstacle],100)
  assert.ok(result)
  assert.deepEqual(result[0],{x:10,y:50})
  assert.deepEqual(result.at(-1),{x:90,y:50})
  assert.ok(result.some(p=>p.y<=20||p.y>=80))
  for(let i=1;i<result.length;i++){
    const a=result[i-1],b=result[i]
    assert.ok(a.x===b.x||a.y===b.y)
    for(let t=0;t<=1;t+=.02){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;assert.ok(!(x>30&&x<70&&y>20&&y<80))}
  }
})
test('does not draw through an enclosing obstacle when no path exists',()=>{
  assert.equal(route({x:10,y:50},{x:90,y:50},[{left:30,right:70,top:-1000,bottom:1000}],100),null)
})
test('avoids a previously reserved connector corridor',()=>{
  const result=route({x:10,y:10},{x:90,y:90},[{left:45,right:55,top:-20,bottom:80}],100)
  assert.ok(result)
  assert.ok(result.some(p=>p.y>=80))
})
