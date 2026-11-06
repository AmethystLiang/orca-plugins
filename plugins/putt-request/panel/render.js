(function (root) {
  'use strict'
  const { WIDTH, HEIGHT, CUP_RADIUS, distanceToEdge, inOval, inPolygon } = root.MiniGolfEngine
  const CELL = 2
  const TURF = {
    turfA: '#2f9a72',
    turfB: '#39ab7f',
    turfEdge: '#1f7a58',
    sandA: '#e8cb7d',
    sandB: '#d4b263',
    bump: '#e5544b',
    bumpHi: '#ff8a6b',
    bumpLo: '#7d2230',
    flag: '#ff5d73',
    ball: '#ffffff',
    ballEdge: '#10201a',
    cup: '#0b0f22',
    cupRing: '#fbeec6',
    aim: '#ffffff',
    band: '#ffd34d'
  }

  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  function resolve(color, fallback) {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = fallback
    probe.fillStyle = color || fallback
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
    return [r, g, b]
  }
  function hex(rgb) {
    return '#' + rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')
  }
  function mix(a, b, amount) {
    return hex(a.map((value, index) => value + (b[index] - value) * amount))
  }

  function readPalette() {
    const style = getComputedStyle(document.documentElement)
    const background = resolve(style.getPropertyValue('--orca-background').trim(), '#000000')
    const foreground = resolve(style.getPropertyValue('--orca-foreground').trim(), '#e6e6e6')
    return Object.assign({}, TURF, {
      void: hex(background),
      voidAlt: mix(background, foreground, 0.05),
      star: mix(background, foreground, 0.4),
      wallHi: hex(foreground),
      wallLo: mix(foreground, background, 0.3),
      wallShade: mix(foreground, background, 0.65),
      pole: hex(foreground)
    })
  }

  function seeded(seed) {
    let state = seed
    return () => {
      state = (state * 16807) % 2147483647
      return (state - 1) / 2147483646
    }
  }

  function paintHole(context, hole, palette, cell) {
    const columns = Math.round(WIDTH / cell)
    const rows = Math.round(((hole.height || HEIGHT) + 1) / cell)
    const low = document.createElement('canvas')
    low.width = columns
    low.height = rows
    const pen = low.getContext('2d')
    const random = seeded(41)
    const scale = cell / 3
    for (let py = 0; py < rows; py++) {
      for (let px = 0; px < columns; px++) {
        const x = px * cell + cell / 2
        const y = py * cell + cell / 2
        const diagonal = Math.floor((px + py) * scale)
        const distance = distanceToEdge(x, y, hole.course)
        let color
        if (!inPolygon(x, y, hole.course)) {
          if (distance < 3.2) color = palette.wallHi
          else if (distance < 6.2) color = palette.wallLo
          else if (distance < 9.2) color = palette.wallShade
          else if (random() < 0.005 * scale * scale) color = palette.star
          else color = Math.floor(py * scale) % 8 === 0 && diagonal % 9 < 3 ? palette.voidAlt : palette.void
        } else {
          color = diagonal % 14 < 7 ? palette.turfA : palette.turfB
          if (distance < 4) color = palette.turfEdge
          if (hole.sands.some((sand) => inOval(x, y, sand))) color = diagonal % 4 === 0 ? palette.sandB : palette.sandA
        }
        for (const block of hole.blocks) {
          if (inPolygon(x, y, block)) color = distanceToEdge(x, y, block) < 3.1 ? palette.wallHi : palette.wallLo
        }
        for (const bumper of hole.bumpers) {
          const reach = Math.hypot(x - bumper.x, y - bumper.y)
          if (reach < bumper.r) {
            if (reach > bumper.r - 3.2) color = palette.bumpLo
            else color = x + y < bumper.x + bumper.y - 6 ? palette.bumpHi : palette.bump
          }
        }
        const toCup = Math.hypot(x - hole.cup.x, y - hole.cup.y)
        if (toCup < CUP_RADIUS) color = toCup > CUP_RADIUS - 3 ? palette.cupRing : palette.cup
        pen.fillStyle = color
        pen.fillRect(px, py, 1, 1)
      }
    }
    const flagX = Math.round(hole.cup.x / cell)
    const flagY = Math.round(hole.cup.y / cell)
    const pole = Math.round(27 / cell)
    const band = Math.round(6 / cell)
    pen.fillStyle = palette.pole
    pen.fillRect(flagX, flagY - pole, 1, pole)
    pen.fillStyle = palette.flag
    pen.fillRect(flagX + 1, flagY - pole, Math.round(15 / cell), band)
    pen.fillRect(flagX + 1, flagY - pole + band, Math.round(9 / cell), band)
    context.imageSmoothingEnabled = false
    context.drawImage(low, 0, 0, context.canvas.width, context.canvas.height)
  }

  function paintThumbnail(canvas, hole, palette) {
    canvas.width = 100
    canvas.height = 147
    paintHole(canvas.getContext('2d'), hole, palette, 3)
  }

  function square(context, x, y, size) {
    context.fillRect(Math.round(x / CELL) * CELL, Math.round(y / CELL) * CELL, size, size)
  }

  function drawFrame(context, background, view, palette) {
    const canvas = context.canvas
    const scale = canvas.width / WIDTH
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.imageSmoothingEnabled = false
    context.drawImage(background, 0, 0)
    context.setTransform(scale, 0, 0, scale, 0, 0)
    const { ball, shot, sinkTime, hole, message } = view
    const height = hole.height || HEIGHT
    const reachScale = hole.speedScale || 1
    if (shot) {
      context.fillStyle = palette.band
      for (let d = 6; d < 46 * shot.power + 6; d += 3) square(context, ball.x - shot.dx * d - 3, ball.y - shot.dy * d - 3, 6)
      context.fillStyle = palette.aim
      for (let d = 14; d < 28 + 170 * reachScale * shot.power; d += 15) square(context, ball.x + shot.dx * d - 3, ball.y + shot.dy * d - 3, 6)
    }
    let x = ball.x
    let y = ball.y
    let visible = true
    if (sinkTime !== null) {
      const t = Math.min(1, sinkTime / 0.25)
      if (t >= 1) visible = false
      x += (hole.cup.x - x) * t
      y += (hole.cup.y - y) * t
    }
    if (visible) {
      const left = Math.round(x / CELL) * CELL
      const top = Math.round(y / CELL) * CELL
      const reach = Math.ceil(9 / CELL)
      for (let i = -reach; i < reach; i++) {
        for (let j = -reach; j < reach; j++) {
          const distance = Math.hypot(i * CELL + CELL / 2, j * CELL + CELL / 2)
          if (distance < 6.4) {
            context.fillStyle = distance < 4.2 ? palette.ball : palette.ballEdge
            context.fillRect(left + i * CELL, top + j * CELL, CELL, CELL)
          }
        }
      }
    }
    if (message && sinkTime !== null && sinkTime > 0.25) {
      context.font = '700 16px ui-monospace, Menlo, monospace'
      const width = context.measureText(message).width + 26
      context.fillStyle = palette.void
      context.fillRect((WIDTH - width) / 2, height / 2 - 18, width, 36)
      context.strokeStyle = palette.wallHi
      context.lineWidth = CELL
      context.strokeRect((WIDTH - width) / 2, height / 2 - 18, width, 36)
      context.fillStyle = palette.wallHi
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(message, WIDTH / 2, height / 2 + 1)
    }
  }

  root.MiniGolfRender = { CELL, drawFrame, paintHole, paintThumbnail, readPalette }
})(globalThis)
