(function (root) {
  var F = root.AMFormat
  var NAME_MIN = 96

  var LIST = [
    { key: 'pid', label: 'PID', width: 50, cls: 'pid' },
    { key: 'name', label: 'Name', width: NAME_MIN, cls: 'nm', fixed: true },
    { key: 'cpu', label: 'CPU', long: '% CPU', width: 54, cls: 'n', show: function (p) { return F.cpu(p.cpu) } },
    { key: 'mem', label: 'Mem', long: 'Memory', width: 58, cls: 'n mut', show: function (p) { return F.memSize(p.mem) } },
    { key: 'time', label: 'CPU Time', width: 68, cls: 'n', show: function (p) { return F.duration(p.time) } },
    { key: 'threads', label: 'Threads', width: 62, cls: 'n', show: function (p) { return F.count(p.threads) } },
    { key: 'idlew', label: 'Wake Ups', long: 'Idle Wake Ups', width: 64, cls: 'n', show: function (p) { return F.count(p.idlew) } },
    { key: 'gpu', label: 'GPU', long: '% GPU', width: 46, cls: 'n', show: function (p) { return F.fixed(p.gpu, 1) } },
    { key: 'gpuTime', label: 'GPU Time', width: 68, cls: 'n', show: function (p) { return F.duration(p.gpuTime) } },
    { key: 'ports', label: 'Ports', width: 54, cls: 'n', show: function (p) { return F.count(p.ports) } },
    { key: 'power', label: 'Energy', long: 'Energy Impact', width: 54, cls: 'n', show: function (p) { return F.fixed(p.power, 1) } },
    { key: 'sleep', label: 'Sleep', long: 'Preventing Sleep', width: 48, cls: 'n', show: function (p) { return p.sleep === undefined ? '–' : p.sleep ? 'Yes' : 'No' } },
    { key: 'diskWrite', label: 'Written', long: 'Bytes Written', width: 64, cls: 'n', show: function (p) { return F.bytes(p.diskWrite) } },
    { key: 'diskRead', label: 'Read', long: 'Bytes Read', width: 64, cls: 'n', show: function (p) { return F.bytes(p.diskRead) } },
    { key: 'netOut', label: 'Sent', long: 'Sent Bytes', width: 62, cls: 'n', show: function (p) { return F.bytes(p.netOut) } },
    { key: 'netIn', label: 'Rcvd', long: 'Rcvd Bytes', width: 62, cls: 'n', show: function (p) { return F.bytes(p.netIn) } },
    { key: 'user', label: 'User', width: 84, cls: 'usr', show: function (p) { return p.user ? p.user : '–' } }
  ]
  var BY = {}
  LIST.forEach(function (c) { BY[c.key] = c })
  var DEFAULT = ['pid', 'name', 'cpu', 'mem']
  var EXTRA = ['time', 'threads', 'idlew', 'gpu', 'gpuTime', 'ports', 'power', 'sleep', 'diskWrite', 'diskRead', 'netOut', 'netIn', 'user']

  function clean(order) {
    var seen = {}
    var out = (Array.isArray(order) ? order : DEFAULT).filter(function (k) {
      if (!BY[k] || seen[k]) return false
      seen[k] = true
      return true
    })
    if (!seen.name) out.splice(Math.min(1, out.length), 0, 'name')
    return out
  }

  function fit(order, width) {
    var used = 0
    var out = []
    order.forEach(function (k) {
      var w = BY[k].width
      if (k === 'name' || used + w <= width) { out.push(k); used += w }
    })
    return out
  }

  function needsDetails(order) { return order.some(function (k) { return DEFAULT.indexOf(k) < 0 }) }

  function move(order, key, before) {
    var out = order.filter(function (k) { return k !== key })
    var at = before === null ? out.length : out.indexOf(before)
    out.splice(at < 0 ? out.length : at, 0, key)
    return out
  }

  root.AMColumns = { LIST: LIST, BY: BY, DEFAULT: DEFAULT, EXTRA: EXTRA, clean: clean, fit: fit, move: move, needsDetails: needsDetails }
})(typeof globalThis !== 'undefined' ? globalThis : this)
