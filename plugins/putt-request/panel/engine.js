(function (root) {
  'use strict'
  const WIDTH = 300
  const HEIGHT = 440
  const BALL_RADIUS = 5
  const MAX_SPEED = 560
  const STEP = 1 / 240
  const FRICTION = 1.2
  const SAND_FRICTION = 4.8
  const STOP_SPEED = 11
  const SINK_SPEED = 230
  const CUP_RADIUS = 8
  const WALL_BOUNCE = 1.78
  const BUMPER_KICK = 40
  const FULL_DRAG = 130
  const MIN_DRAG = 3
  const MIN_POWER = 0.05
  const FIT_PADDING = 14
  const MIN_ASPECT = 1.2
  const MAX_ASPECT = 2.6

  function edges(points) {
    return points.map((point, index) => [point, points[(index + 1) % points.length]])
  }

  function inPolygon(x, y, points) {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const crosses = points[i][1] > y !== points[j][1] > y
      if (crosses && x < ((points[j][0] - points[i][0]) * (y - points[i][1])) / (points[j][1] - points[i][1]) + points[i][0]) {
        inside = !inside
      }
    }
    return inside
  }

  function closestOnSegment(x, y, segment) {
    const [[ax, ay], [bx, by]] = segment
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return [ax + t * dx, ay + t * dy]
  }

  function distanceToEdge(x, y, points) {
    let best = Infinity
    for (const segment of edges(points)) {
      const [cx, cy] = closestOnSegment(x, y, segment)
      best = Math.min(best, Math.hypot(x - cx, y - cy))
    }
    return best
  }

  function inOval(x, y, oval) {
    const a = (x - oval.x) / oval.rx
    const b = (y - oval.y) / oval.ry
    return a * a + b * b < 1
  }

  function createBall(hole) {
    return {
      x: hole.tee.x,
      y: hole.tee.y,
      vx: 0,
      vy: 0,
      moving: false,
      sunk: false,
      segments: edges(hole.course).concat(...hole.blocks.map(edges))
    }
  }

  function clampAspect(aspect) {
    return Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, aspect))
  }

  function fitHole(hole, aspect) {
    const height = WIDTH * clampAspect(aspect)
    const xs = hole.course.map((point) => point[0])
    const ys = hole.course.map((point) => point[1])
    const left = Math.min(...xs)
    const top = Math.min(...ys)
    const scaleX = (WIDTH - FIT_PADDING * 2) / (Math.max(...xs) - left)
    const scaleY = (height - FIT_PADDING * 2) / (Math.max(...ys) - top)
    const x = (value) => FIT_PADDING + (value - left) * scaleX
    const y = (value) => FIT_PADDING + (value - top) * scaleY
    const place = (spot) => Object.assign({}, spot, { x: x(spot.x), y: y(spot.y) })
    const polygon = (points) => points.map((point) => [x(point[0]), y(point[1])])
    const round = Math.min(scaleX, scaleY)
    return {
      name: hole.name,
      par: hole.par,
      height,
      speedScale: Math.max(scaleX, scaleY),
      course: polygon(hole.course),
      blocks: hole.blocks.map(polygon),
      bumpers: hole.bumpers.map((bumper) => Object.assign(place(bumper), { r: bumper.r * round })),
      sands: hole.sands.map((sand) => Object.assign(place(sand), { rx: sand.rx * scaleX, ry: sand.ry * scaleY })),
      cup: place(hole.cup),
      tee: place(hole.tee)
    }
  }

  function moveBall(ball, from, to) {
    const ratioY = (to.height - FIT_PADDING * 2) / (from.height - FIT_PADDING * 2)
    const speedRatio = to.speedScale / from.speedScale
    ball.y = FIT_PADDING + (ball.y - FIT_PADDING) * ratioY
    ball.vx *= speedRatio
    ball.vy *= speedRatio
    ball.segments = edges(to.course).concat(...to.blocks.map(edges))
  }

  function strike(ball, shot, hole) {
    const speed = MAX_SPEED * ((hole && hole.speedScale) || 1)
    ball.vx = shot.dx * shot.power * speed
    ball.vy = shot.dy * shot.power * speed
    ball.moving = true
  }

  function shotFromDrag(start, current) {
    const dx = start.x - current.x
    const dy = start.y - current.y
    const length = Math.hypot(dx, dy)
    if (length < MIN_DRAG) return null
    return { dx: dx / length, dy: dy / length, power: Math.min(1, length / FULL_DRAG) }
  }

  function stepBall(ball, hole) {
    if (!ball.moving) return
    const previousX = ball.x
    const previousY = ball.y
    const inSand = hole.sands.some((sand) => inOval(ball.x, ball.y, sand))
    const decay = Math.exp(-(inSand ? SAND_FRICTION : FRICTION) * STEP)
    ball.vx *= decay
    ball.vy *= decay
    ball.x += ball.vx * STEP
    ball.y += ball.vy * STEP
    for (const segment of ball.segments) {
      const [cx, cy] = closestOnSegment(ball.x, ball.y, segment)
      const ox = ball.x - cx
      const oy = ball.y - cy
      const distance = Math.hypot(ox, oy)
      if (distance < BALL_RADIUS && distance > 0) {
        const nx = ox / distance
        const ny = oy / distance
        const into = ball.vx * nx + ball.vy * ny
        if (into < 0) {
          ball.vx -= WALL_BOUNCE * into * nx
          ball.vy -= WALL_BOUNCE * into * ny
        }
        ball.x = cx + nx * BALL_RADIUS
        ball.y = cy + ny * BALL_RADIUS
      }
    }
    for (const bumper of hole.bumpers) {
      const ox = ball.x - bumper.x
      const oy = ball.y - bumper.y
      const distance = Math.hypot(ox, oy)
      const reach = bumper.r + BALL_RADIUS
      if (distance < reach && distance > 0) {
        const nx = ox / distance
        const ny = oy / distance
        const into = ball.vx * nx + ball.vy * ny
        if (into < 0) {
          const push = -2 * into + BUMPER_KICK
          ball.vx += push * nx
          ball.vy += push * ny
        }
        ball.x = bumper.x + nx * reach
        ball.y = bumper.y + ny * reach
      }
    }
    const escaped = !inPolygon(ball.x, ball.y, hole.course) || hole.blocks.some((block) => inPolygon(ball.x, ball.y, block))
    if (escaped) {
      ball.x = previousX
      ball.y = previousY
      ball.vx *= -0.6
      ball.vy *= -0.6
    }
    const speed = Math.hypot(ball.vx, ball.vy)
    if (Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y) < CUP_RADIUS && speed < SINK_SPEED * (hole.speedScale || 1)) {
      ball.moving = false
      ball.sunk = true
      ball.vx = 0
      ball.vy = 0
      return
    }
    if (speed < STOP_SPEED) {
      ball.moving = false
      ball.vx = 0
      ball.vy = 0
    }
  }

  root.MiniGolfEngine = {
    WIDTH,
    HEIGHT,
    STEP,
    CUP_RADIUS,
    MIN_POWER,
    clampAspect,
    createBall,
    distanceToEdge,
    fitHole,
    inOval,
    inPolygon,
    moveBall,
    shotFromDrag,
    stepBall,
    strike
  }
})(globalThis)
