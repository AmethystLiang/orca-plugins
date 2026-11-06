import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'

const { MiniGolfEngine: Engine, MiniGolfCourse: Course } = load('engine.js', 'course.js')

function seeded(seed) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function run(ball, hole) {
  for (let i = 0; i < 12000 && ball.moving; i++) Engine.stepBall(ball, hole)
}

test('the course has nine named holes and the published par', () => {
  assert.equal(Course.name, 'Main Branch')
  assert.deepEqual([...Course.holes.map((hole) => hole.name)], ['Hello World', 'Rubber Duck', 'Off By One', 'Bottleneck', 'Left Join', 'Rollback', 'Merge Conflict', 'Stack Trace', 'Ship It'])
  assert.equal(Course.holes.length, 9)
  assert.equal(Course.par, 27)
})

const ASPECTS = [1.2, 1.47, 2, 2.6]

for (const [index, source] of Course.holes.entries()) {
  test('hole ' + (index + 1) + ' geometry places everything in play', () => {
    for (const aspect of ASPECTS) {
      const hole = Engine.fitHole(source, aspect)
      for (const spot of [hole.tee, hole.cup, ...hole.bumpers, ...hole.sands]) {
        assert.ok(Engine.inPolygon(spot.x, spot.y, hole.course))
      }
      for (const block of hole.blocks) {
        assert.ok(!Engine.inPolygon(hole.tee.x, hole.tee.y, block))
        assert.ok(!Engine.inPolygon(hole.cup.x, hole.cup.y, block))
      }
    }
  })

  test('hole ' + (index + 1) + ' fills the panel at every shape', () => {
    for (const aspect of ASPECTS) {
      const hole = Engine.fitHole(source, aspect)
      const xs = hole.course.map((point) => point[0])
      const ys = hole.course.map((point) => point[1])
      assert.equal(Math.round(Math.min(...xs)), 14)
      assert.equal(Math.round(Math.max(...xs)), 286)
      assert.equal(Math.round(Math.min(...ys)), 14)
      assert.equal(Math.round(Math.max(...ys)), Math.round(300 * aspect - 14))
    }
  })

  test('hole ' + (index + 1) + ' keeps the ball in play and it always stops', () => {
    const random = seeded(index + 11)
    for (const aspect of ASPECTS) {
      const hole = Engine.fitHole(source, aspect)
      for (let shot = 0; shot < 80; shot++) {
        const ball = Engine.createBall(hole)
        const angle = random() * Math.PI * 2
        Engine.strike(ball, { dx: Math.cos(angle), dy: Math.sin(angle), power: 0.2 + random() * 0.8 }, hole)
        for (let i = 0; i < 12000 && ball.moving; i++) {
          Engine.stepBall(ball, hole)
          assert.ok(Engine.inPolygon(ball.x, ball.y, hole.course))
        }
        assert.equal(ball.moving, false)
      }
    }
  })

  test('hole ' + (index + 1) + ' can be finished at par at every shape', () => {
    const random = seeded(index + 101)
    for (const aspect of ASPECTS) {
      const hole = Engine.fitHole(source, aspect)
      let found = false
      for (let attempt = 0; attempt < 400000 && !found; attempt++) {
        const ball = Engine.createBall(hole)
        for (let stroke = 0; stroke < hole.par && !ball.sunk; stroke++) {
          const angle = random() * Math.PI * 2
          Engine.strike(ball, { dx: Math.cos(angle), dy: Math.sin(angle), power: 0.1 + random() * 0.9 }, hole)
          run(ball, hole)
        }
        found = ball.sunk
      }
      assert.ok(found, 'no par route at aspect ' + aspect)
    }
  })
}

test('resizing mid-hole keeps the ball in play', () => {
  for (const source of Course.holes) {
    const tall = Engine.fitHole(source, 2.6)
    const short = Engine.fitHole(source, 1.2)
    const ball = Engine.createBall(tall)
    Engine.moveBall(ball, tall, short)
    assert.ok(Engine.inPolygon(ball.x, ball.y, short.course))
    assert.equal(Math.round(ball.y), Math.round(short.tee.y))
  }
})

test('a drag shoots away from the pull and caps its power', () => {
  const shot = Engine.shotFromDrag({ x: 100, y: 100 }, { x: 100, y: 400 })
  assert.equal(shot.dy, -1)
  assert.equal(shot.power, 1)
  assert.equal(Engine.shotFromDrag({ x: 100, y: 100 }, { x: 101, y: 101 }), null)
})

test('a fixed step replays a shot identically', () => {
  const hole = Course.holes[2]
  const play = () => {
    const ball = Engine.createBall(hole)
    Engine.strike(ball, { dx: 0.6, dy: -0.8, power: 0.7 })
    run(ball, hole)
    return [ball.x, ball.y]
  }
  assert.deepEqual(play(), play())
})
