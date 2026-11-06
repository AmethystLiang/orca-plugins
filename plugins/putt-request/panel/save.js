(function (root) {
  'use strict'
  const VERSION = 1
  const BOARD_SIZE = 10

  function newSave() {
    return {
      version: VERSION,
      unlocked: 1,
      completed: false,
      current: null,
      round: [],
      courseBoard: [],
      endlessBoard: [],
      endless: { runId: null, streak: 0, played: 0, order: [] }
    }
  }

  function loadSave(value) {
    if (!value || value.version !== VERSION) return newSave()
    return Object.assign(newSave(), value)
  }

  function roundTotal(save) {
    return save.round.reduce((total, strokes) => total + (strokes || 0), 0)
  }

  function toPar(save, course) {
    let difference = 0
    save.round.forEach((strokes, index) => {
      if (strokes) difference += strokes - course.holes[index].par
    })
    return difference
  }

  function startHole(save, index) {
    save.current = index
  }

  function finishCourseHole(save, course, index, strokes, now) {
    save.round[index] = strokes
    save.unlocked = Math.min(course.holes.length, Math.max(save.unlocked, index + 2))
    const roundDone = course.holes.every((_, hole) => save.round[hole])
    if (!roundDone) {
      save.current = firstUnplayed(save, course)
      return { finished: false }
    }
    const entry = { total: roundTotal(save), toPar: toPar(save, course), at: now }
    save.courseBoard = insertEntry(save.courseBoard, entry, (a, b) => a.total - b.total || a.at - b.at)
    const rank = save.courseBoard.indexOf(entry)
    save.completed = true
    save.current = null
    const result = { finished: true, total: entry.total, toPar: entry.toPar, rank: rank === -1 ? null : rank + 1 }
    save.round = []
    return result
  }

  function firstUnplayed(save, course) {
    const index = course.holes.findIndex((_, hole) => !save.round[hole])
    return index === -1 ? null : index
  }

  function insertEntry(board, entry, compare) {
    return board.concat(entry).sort(compare).slice(0, BOARD_SIZE)
  }

  function endlessReady(save) {
    return save.completed
  }

  function endlessPool(save, course) {
    return course.holes.map((_, index) => index).slice(0, save.completed ? course.holes.length : save.unlocked)
  }

  function nextEndlessHole(save, course, random) {
    const run = save.endless
    if (!run.order.length) {
      run.order = endlessPool(save, course)
      for (let i = run.order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        const swap = run.order[i]
        run.order[i] = run.order[j]
        run.order[j] = swap
      }
    }
    return run.order[0]
  }

  function finishEndlessHole(save, course, strokes, now) {
    const run = save.endless
    const index = run.order.shift()
    run.played += 1
    const madePar = strokes <= course.holes[index].par
    if (madePar) {
      if (run.streak === 0) run.runId = now
      run.streak += 1
      const others = save.endlessBoard.filter((entry) => entry.runId !== run.runId)
      save.endlessBoard = insertEntry(others, { runId: run.runId, streak: run.streak, at: now }, (a, b) => b.streak - a.streak || a.at - b.at)
    } else {
      run.streak = 0
      run.runId = null
    }
    return { madePar, streak: run.streak }
  }

  function bestCourse(save) {
    return save.courseBoard.length ? save.courseBoard[0].total : null
  }

  function bestStreak(save) {
    return save.endlessBoard.length ? save.endlessBoard[0].streak : 0
  }

  root.MiniGolfSave = {
    BOARD_SIZE,
    bestCourse,
    bestStreak,
    endlessPool,
    endlessReady,
    finishCourseHole,
    finishEndlessHole,
    loadSave,
    newSave,
    nextEndlessHole,
    roundTotal,
    startHole,
    toPar
  }
})(globalThis)
