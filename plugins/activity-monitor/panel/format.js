(function (root) {
  var GiB = 1024 * 1024 * 1024
  var MiB = 1024 * 1024

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

  function gib(bytes) { return (bytes / GiB).toFixed(1) }

  function memSize(bytes) {
    if (bytes >= GiB) return (bytes / GiB).toFixed(1) + ' GB'
    return Math.round(bytes / MiB) + ' MB'
  }

  function diskSize(bytes) {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
    return Math.round(bytes / 1e9) + ' GB'
  }

  function total(bytes) {
    if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    return Math.round(bytes / 1e6) + ' MB'
  }

  function rate(bps) {
    if (bps === null || bps === undefined) return '–'
    if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' GB/s'
    if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' MB/s'
    return Math.round(bps / 1e3) + ' KB/s'
  }

  function pct(v) { return Math.round(clamp(v, 0, 100)) + '%' }

  var DARK = ['#4ade80', '#fbbf24', '#f87171']
  var LIGHT = ['#15803d', '#b45309', '#dc2626']
  var palette = DARK

  function setLight(light) { palette = light ? LIGHT : DARK }
  function heatColors() { return palette }
  function heat(f) { return f < 0.5 ? palette[0] : f < 0.8 ? palette[1] : palette[2] }
  function cpu(v) { return v === null || v === undefined ? '–' : v.toFixed(1) + '%' }
  function missing(v) { return v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) }
  function count(v) { return missing(v) ? '–' : Math.round(v).toLocaleString('en-US') }
  function bytes(v) {
    if (missing(v)) return '–'
    if (v >= 1e12) return (v / 1e12).toFixed(2) + ' TB'
    if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB'
    if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB'
    if (v >= 1e3) return Math.round(v / 1e3) + ' KB'
    return Math.round(v) + ' B'
  }
  function duration(v) {
    if (missing(v)) return '–'
    var h = Math.floor(v / 3600)
    var m = Math.floor((v % 3600) / 60)
    var s = v % 60
    if (h) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + Math.floor(s)
    return m ? m + ':' + (s < 10 ? '0' : '') + s.toFixed(2) : s.toFixed(2)
  }
  function gb(v) { return missing(v) ? '–' : (v / GiB).toFixed(2) + ' GB' }
  function fixed(v, d) { return missing(v) ? '–' : v.toFixed(d) }

  function norm(arr, window) {
    var tail = arr.slice(-(window || 120))
    var max = 1
    for (var i = 0; i < tail.length; i++) if (tail[i] > max) max = tail[i]
    return arr.map(function (v) { return (v / max) * 100 })
  }

  function visibleProcs(list, query, sort, gone, limit, order) {
    var q = (query || '').trim().toLowerCase()
    var rows = list.filter(function (p) { return !gone[p.pid] && (!q || p.name.toLowerCase().indexOf(q) >= 0) })
    var value = function (p) {
      var v = p[sort]
      if (typeof v === 'boolean') return v ? 1 : 0
      return v === null || v === undefined ? -1 : v
    }
    rows.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'user') return String(a.user || '~').localeCompare(String(b.user || '~')) || a.name.localeCompare(b.name)
      if (sort === 'pid') return a.pid - b.pid
      return value(b) - value(a) || a.name.localeCompare(b.name)
    })
    if (order) {
      var rank = {}
      order.forEach(function (pid, i) { rank[pid] = i })
      rows.sort(function (a, b) { return (a.pid in rank ? rank[a.pid] : 1e9) - (b.pid in rank ? rank[b.pid] : 1e9) })
    }
    return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit), matched: rows.length }
  }

  root.AMFormat = { clamp: clamp, gib: gib, memSize: memSize, diskSize: diskSize, total: total, rate: rate, pct: pct, cpu: cpu, count: count, bytes: bytes, duration: duration, fixed: fixed, gb: gb, heat: heat, heatColors: heatColors, setLight: setLight, norm: norm, visibleProcs: visibleProcs }
})(typeof globalThis !== 'undefined' ? globalThis : this)
