(function (root) {
  'use strict'
  const VERSION = 2
  const BOARD_SIZE = 10
  const FIRST_COURSE = 'main-branch'

  function newProgress() {
    return { unlocked: 1, completed: false, current: null, round: [], board: [] }
  }

  function newSave() {
    return {
      version: VERSION,
      courses: {},
      last: null,
      endlessBoard: [],
      endless: { runId: null, streak: 0, played: 0, order: [] }
    }
  }

  function fromVersion1(value) {
    const save = newSave()
    const progress = newProgress()
    for (const key of ['unlocked', 'completed', 'current', 'round']) {
      if (value[key] !== undefined) progress[key] = value[key]
    }
    progress.board = value.courseBoard || []
    save.courses[FIRST_COURSE] = progress
    save.last = progress.current !== null ? FIRST_COURSE : null
    save.endlessBoard = value.endlessBoard || []
    if (value.endless) save.endless = Object.assign(save.endless, value.endless)
    return save
  }

  function loadSave(value) {
    if (value && value.version === 1) return fromVersion1(value)
    if (!value || value.version !== VERSION) return newSave()
    const save = Object.assign(newSave(), value)
    if (!save.courses || typeof save.courses !== 'object') save.courses = {}
    for (const id of Object.keys(save.courses)) save.courses[id] = Object.assign(newProgress(), save.courses[id])
    return save
  }

  function progress(save, course) {
    if (!save.courses[course.id]) save.courses[course.id] = newProgress()
    return save.courses[course.id]
  }

  function peek(save, course) {
    return save.courses[course.id] || newProgress()
  }

  function courseOpen(save, courses, index) {
    return index === 0 || peek(save, courses[index - 1]).completed
  }

  function roundTotal(save, course) {
    return peek(save, course).round.reduce((total, strokes) => total + (strokes || 0), 0)
  }

  function toPar(save, course) {
    let difference = 0
    peek(save, course).round.forEach((strokes, index) => {
      if (strokes) difference += strokes - course.holes[index].par
    })
    return difference
  }

  function startHole(save, course, index) {
    progress(save, course).current = index
    save.last = course.id
  }

  function finishCourseHole(save, course, index, strokes, now) {
    const state = progress(save, course)
    state.round[index] = strokes
    state.unlocked = Math.min(course.holes.length, Math.max(state.unlocked, index + 2))
    const roundDone = course.holes.every((_, hole) => state.round[hole])
    if (!roundDone) {
      state.current = firstUnplayed(state, course)
      return { finished: false }
    }
    const entry = { total: roundTotal(save, course), toPar: toPar(save, course), at: now }
    state.board = insertEntry(state.board, entry, (a, b) => a.total - b.total || a.at - b.at)
    const rank = state.board.indexOf(entry)
    const firstFinish = !state.completed
    state.completed = true
    state.current = null
    if (firstFinish) save.endless.order = []
    const result = { finished: true, firstFinish, total: entry.total, toPar: entry.toPar, rank: rank === -1 ? null : rank + 1 }
    state.round = []
    return result
  }

  function firstUnplayed(state, course) {
    const index = course.holes.findIndex((_, hole) => !state.round[hole])
    return index === -1 ? null : index
  }

  function insertEntry(board, entry, compare) {
    return board.concat(entry).sort(compare).slice(0, BOARD_SIZE)
  }

  function holeAt(courses, slot) {
    for (const course of courses) {
      if (slot < course.holes.length) return { course, index: slot, hole: course.holes[slot] }
      slot -= course.holes.length
    }
    return null
  }

  function totalHoles(courses) {
    return courses.reduce((total, course) => total + course.holes.length, 0)
  }

  function endlessReady(save, courses) {
    return courses.some((course) => peek(save, course).completed)
  }

  function endlessPool(save, courses) {
    const pool = []
    let slot = 0
    for (const course of courses) {
      const done = peek(save, course).completed
      for (let index = 0; index < course.holes.length; index++, slot++) {
        if (done) pool.push(slot)
      }
    }
    return pool
  }

  function nextEndlessHole(save, courses, random) {
    const run = save.endless
    if (!run.order.length) {
      run.order = endlessPool(save, courses)
      for (let i = run.order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        const swap = run.order[i]
        run.order[i] = run.order[j]
        run.order[j] = swap
      }
    }
    return run.order[0]
  }

  function finishEndlessHole(save, courses, strokes, now) {
    const run = save.endless
    const slot = run.order.shift()
    run.played += 1
    const madePar = strokes <= holeAt(courses, slot).hole.par
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

  function bestCourse(save, course) {
    const board = peek(save, course).board
    return board.length ? board[0].total : null
  }

  function bestOfAll(save, courses) {
    const bests = courses.map((course) => peek(save, course).board[0])
    if (bests.some((entry) => !entry)) return null
    return {
      total: bests.reduce((total, entry) => total + entry.total, 0),
      toPar: bests.reduce((total, entry) => total + entry.toPar, 0),
      parts: bests.map((entry) => entry.total)
    }
  }

  function bestStreak(save) {
    return save.endlessBoard.length ? save.endlessBoard[0].streak : 0
  }

  root.MiniGolfSave = {
    BOARD_SIZE,
    bestCourse,
    bestOfAll,
    bestStreak,
    courseOpen,
    endlessPool,
    endlessReady,
    finishCourseHole,
    finishEndlessHole,
    holeAt,
    loadSave,
    newSave,
    nextEndlessHole,
    peek,
    roundTotal,
    startHole,
    toPar,
    totalHoles
  }
})(globalThis)
