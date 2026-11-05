import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enforceMovement } from '../src/components/ascii-sharks/permissions.ts'
const bounds = { left: 100, right: 500, top: 80, bottom: 400 }

test('confined swimmers reflect at all four padded boundaries', () => {
  for (const [x,y,vx,vy] of [[90,200,-40,10],[510,200,40,10],[200,70,10,-40],[200,410,10,40]]) {
    const fish = { x,y,vx,vy }
    enforceMovement(fish,'confined',bounds)
    assert.ok(fish.x >= 108 && fish.x <= 492 && fish.y >= 88 && fish.y <= 392)
    assert.ok(fish.vx !== 0 || fish.vy !== 0)
    if (x===90) assert.ok(fish.vx>0)
    if (x===510) assert.ok(fish.vx<0)
    if (y===70) assert.ok(fish.vy>0)
    if (y===410) assert.ok(fish.vy<0)
  }
})
test('denied swimmers bounce before entering from every side', () => {
  for (const [previous, next, axis, sign] of [
    [{x:50,y:200},{x:120,y:200},'vx',-1],
    [{x:550,y:200},{x:480,y:200},'vx',1],
    [{x:200,y:20},{x:200,y:100},'vy',-1],
    [{x:200,y:450},{x:200,y:380},'vy',1],
  ]) {
    const fish = {...next,vx:next.x-previous.x,vy:next.y-previous.y}
    enforceMovement(fish,'excluded',bounds,previous)
    assert.ok(fish.x <=92 || fish.x>=508 || fish.y<=72 || fish.y>=408)
    assert.ok(fish[axis]*sign>0)
  }
})
test('denied swimmers cannot tunnel through the panel at high speed', () => {
  const fish={x:600,y:200,vx:1000,vy:30}
  enforceMovement(fish,'excluded',bounds,{x:0,y:200})
  assert.ok(fish.x<92 && fish.vx<0)
  assert.equal(fish.vy,30)
})
test('invalid initial positions and resized zones relocate fish to allowed space', () => {
  const fish={x:250,y:90,vx:12,vy:20}
  enforceMovement(fish,'excluded',bounds)
  assert.ok(fish.y<72 && fish.vy<0)
  enforceMovement(fish,'confined',bounds)
  assert.equal(fish.y,88)
  assert.ok(fish.vy>0)
})
test('unrestricted swimmers cross the cyan zone unchanged', () => {
  const fish={x:200,y:200,vx:40,vy:-12}
  const before={...fish}
  enforceMovement(fish,'unrestricted',bounds,{x:50,y:200})
  assert.deepEqual(fish,before)
})
