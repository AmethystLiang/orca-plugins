(function (root) {
  var F = root.AMFormat

  function braille(arr, cols, rows, colorAt) {
    var n = cols * 2
    var a = arr.slice(-n)
    while (a.length < n) a.unshift(0)
    var lv = a.map(function (v) { return Math.round((F.clamp(v, 0, 100) / 100) * rows * 4) })
    var L = [0x40, 0x4, 0x2, 0x1]
    var R = [0x80, 0x20, 0x10, 0x8]
    var out = ''
    for (var row = 0; row < rows; row++) {
      var bottom = (rows - 1 - row) * 4
      var line = ''
      for (var c = 0; c < cols; c++) {
        var bits = 0
        var fa = F.clamp(lv[2 * c] - bottom, 0, 4)
        var fb = F.clamp(lv[2 * c + 1] - bottom, 0, 4)
        for (var q = 0; q < fa; q++) bits |= L[q]
        for (q = 0; q < fb; q++) bits |= R[q]
        line += String.fromCharCode(0x2800 + bits)
      }
      out += '<div style="color:' + colorAt((rows - row - 0.5) / rows) + '">' + line + '</div>'
    }
    return '<div class="br">' + out + '</div>'
  }

  function rgba(hex, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex)
    if (!m) return hex
    var n = parseInt(m[1], 16)
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
  }

  function draw(cv, arr, o) {
    var dpr = root.devicePixelRatio || 1
    var w = cv.clientWidth
    var h = cv.clientHeight
    if (!w || !h) return
    var pw = Math.round(w * dpr)
    var ph = Math.round(h * dpr)
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
    var g = cv.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    var n = o.n
    var a = arr.slice(-(n + 2))
    var ax = o.axes || null
    if (ax) {
      g.strokeStyle = o.grid
      g.lineWidth = 1
      g.setLineDash([2, 3])
      var mid = Math.round(h / 2) + 0.5
      g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke()
      g.setLineDash([])
    }
    if (a.length < 2) { labels(); return }
    var e = 1 - Math.pow(1 - F.clamp(o.progress, 0, 1), 3)
    var dx = w / (n - 1)
    var pad = o.big ? 3 : 1.5
    var pts = a.map(function (v, i) {
      return [w + (i - (a.length - 1)) * dx + (1 - e) * dx, pad + (h - 2 * pad) * (1 - F.clamp(v, 0, 100) / 100)]
    })
    if (o.big && !ax) {
      g.strokeStyle = o.grid
      g.globalAlpha = 0.6
      g.lineWidth = 1
      ;[0.25, 0.5, 0.75].forEach(function (f) {
        var y = Math.round(h * f) + 0.5
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
      })
      g.globalAlpha = 1
    }
    var stroke, fillTop, fillBot
    if (o.heat) {
      var hc = F.heatColors()
      stroke = g.createLinearGradient(0, h, 0, 0)
      stroke.addColorStop(0, hc[0]); stroke.addColorStop(0.5, hc[0]); stroke.addColorStop(0.62, hc[1])
      stroke.addColorStop(0.8, hc[1]); stroke.addColorStop(0.92, hc[2])
      fillTop = rgba(hc[1], 0.22); fillBot = rgba(hc[0], 0)
    } else {
      stroke = o.color; fillTop = rgba(o.color, o.big ? 0.28 : 0.22); fillBot = rgba(o.color, 0)
    }
    function path() {
      g.moveTo(pts[0][0], pts[0][1])
      for (var i = 1; i < pts.length - 1; i++) {
        g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
      }
      g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    }
    var fill = g.createLinearGradient(0, 0, 0, h)
    fill.addColorStop(0, fillTop); fill.addColorStop(1, fillBot)
    g.beginPath(); path(); g.lineTo(pts[pts.length - 1][0], h); g.lineTo(pts[0][0], h); g.closePath()
    g.fillStyle = fill; g.fill()
    g.beginPath(); path()
    g.lineWidth = o.big ? 1.6 : 1.25; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = stroke; g.stroke()
    if (o.big) {
      var lp = pts[pts.length - 1]
      var pv = pts[pts.length - 2]
      var tx = Math.min(lp[0], w - 3)
      var t = (tx - pv[0]) / (lp[0] - pv[0] || 1)
      var ty = pv[1] + (lp[1] - pv[1]) * F.clamp(t, 0, 1)
      var dot = o.heat ? F.heat(1 - ty / h) : o.color
      g.beginPath(); g.arc(tx, ty, 5, 0, Math.PI * 2); g.fillStyle = rgba(dot, 0.18); g.fill()
      g.beginPath(); g.arc(tx, ty, 2.6, 0, Math.PI * 2); g.fillStyle = dot; g.fill()
    }
    labels()
    function labels() {
      if (!ax || !ax.top || h < 40 || w < 90) return
      g.font = (9 * (o.ts || 1)).toFixed(1) + 'px ui-monospace, "SF Mono", Menlo, monospace'
      g.textBaseline = 'middle'
      ;[[ax.top, 2, 6, 'left'], [ax.mid, 2, Math.round(h / 2), 'left'], [ax.span, w - 2, h - 6, 'right']].forEach(function (l) {
        if (!l[0]) return
        g.textAlign = l[3]
        var tw = g.measureText(l[0]).width
        var x0 = l[3] === 'right' ? l[1] - tw - 2 : l[1] - 2
        g.fillStyle = rgba(o.bg, 0.78)
        g.fillRect(x0, l[2] - 6, tw + 4, 12)
        g.fillStyle = o.text
        g.fillText(l[0], l[1], l[2])
      })
    }
  }

  root.AMGraph = { braille: braille, draw: draw, rgba: rgba }
})(typeof globalThis !== 'undefined' ? globalThis : this)
