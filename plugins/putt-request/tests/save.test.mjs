import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'

const { MiniGolfSave: Save, MiniGolfCourses: Courses } = load('engine.js', 'course.js', 'save.js')
const [Main, Feature, Hotfix] = Courses

function finishRound(save, course, strokes, at) {
  let result
  course.holes.forEach((_, index) => {
    result = Save.finishCourseHole(save, course, index, strokes, at)
  })
  return result
}

test('a new player has one open course, one open hole, no Endless and nothing to continue', () => {
  const save = Save.newSave()
  assert.deepEqual([...Courses.map((_, index) => Save.courseOpen(save, Courses, index))], [true, false, false])
  assert.equal(Save.peek(save, Main).unlocked, 1)
  assert.equal(Save.endlessReady(save, Courses), false)
  assert.equal(save.last, null)
})

test('finishing a hole at any score unlocks the next and moves Continue on', () => {
  const save = Save.newSave()
  Save.startHole(save, Main, 0)
  Save.finishCourseHole(save, Main, 0, 12, 1)
  assert.equal(Save.peek(save, Main).unlocked, 2)
  assert.equal(Save.peek(save, Main).current, 1)
  assert.equal(save.last, 'main-branch')
})

test('replaying a hole sends you back to the first one you have not played', () => {
  const save = Save.newSave()
  Save.finishCourseHole(save, Main, 0, 3, 1)
  Save.finishCourseHole(save, Main, 1, 3, 1)
  Save.finishCourseHole(save, Main, 0, 2, 1)
  assert.equal(Save.peek(save, Main).current, 2)
  assert.equal(Save.peek(save, Main).unlocked, 3)
})

test('each course unlocks the next, in order', () => {
  const save = Save.newSave()
  const first = finishRound(save, Main, 3, 1)
  assert.equal(first.firstFinish, true)
  assert.deepEqual([...Courses.map((_, index) => Save.courseOpen(save, Courses, index))], [true, true, false])
  finishRound(save, Feature, 3, 2)
  assert.deepEqual([...Courses.map((_, index) => Save.courseOpen(save, Courses, index))], [true, true, true])
  assert.equal(finishRound(save, Main, 3, 3).firstFinish, false)
})

test('courses keep separate rounds and boards', () => {
  const save = Save.newSave()
  finishRound(save, Main, 3, 1)
  Save.finishCourseHole(save, Feature, 0, 5, 2)
  assert.equal(Save.bestCourse(save, Main), 27)
  assert.equal(Save.bestCourse(save, Feature), null)
  assert.deepEqual([...Save.peek(save, Feature).round], [5])
  assert.equal(Save.toPar(save, Feature), 2)
})

test('finishing a course posts a score, opens Endless and clears the round', () => {
  const save = Save.newSave()
  const result = finishRound(save, Main, 3, 500)
  assert.deepEqual({ ...result }, { finished: true, firstFinish: true, total: 27, toPar: 0, rank: 1 })
  assert.equal(Save.endlessReady(save, Courses), true)
  assert.equal(Save.peek(save, Main).round.length, 0)
  assert.equal(Save.peek(save, Main).current, null)
})

test('a course board sorts low to high and keeps the top ten', () => {
  const save = Save.newSave()
  for (let strokes = 13; strokes >= 2; strokes--) finishRound(save, Main, strokes, strokes)
  const board = Save.peek(save, Main).board
  assert.equal(board.length, 10)
  assert.equal(board[0].total, 18)
  assert.equal(board[9].total, 99)
  assert.equal(finishRound(save, Main, 12, 99).rank, null)
})

test('Endless draws only from finished courses and grows when one is finished', () => {
  const save = Save.newSave()
  finishRound(save, Main, 3, 1)
  assert.deepEqual([...Save.endlessPool(save, Courses)], [0, 1, 2, 3, 4, 5, 6, 7, 8])
  Save.nextEndlessHole(save, Courses, Math.random)
  assert.equal(save.endless.order.length, 9)
  finishRound(save, Feature, 3, 2)
  assert.equal(save.endless.order.length, 0)
  const seen = new Set()
  for (let i = 0; i < 18; i++) {
    seen.add(Save.nextEndlessHole(save, Courses, Math.random))
    Save.finishEndlessHole(save, Courses, 1, i)
  }
  assert.equal(seen.size, 18)
  assert.equal(Save.holeAt(Courses, 9).hole.name, 'Fork')
  assert.equal(Save.holeAt(Courses, 26).hole.name, 'All Clear')
})

test('one streak keeps one growing board entry, and over par ends it', () => {
  const save = Save.newSave()
  finishRound(save, Main, 3, 1)
  Save.nextEndlessHole(save, Courses, Math.random)
  Save.finishEndlessHole(save, Courses, 1, 10)
  Save.nextEndlessHole(save, Courses, Math.random)
  Save.finishEndlessHole(save, Courses, 1, 11)
  assert.equal(save.endlessBoard.length, 1)
  assert.equal(Save.bestStreak(save), 2)
  Save.nextEndlessHole(save, Courses, Math.random)
  const lost = Save.finishEndlessHole(save, Courses, 20, 12)
  assert.equal(lost.madePar, false)
  assert.equal(save.endless.streak, 0)
  assert.equal(Save.bestStreak(save), 2)
})

test('the best of all courses waits for all three, then adds their bests', () => {
  const save = Save.newSave()
  finishRound(save, Main, 3, 1)
  finishRound(save, Main, 2, 2)
  finishRound(save, Feature, 4, 3)
  assert.equal(Save.bestOfAll(save, Courses), null)
  finishRound(save, Hotfix, 3, 4)
  assert.deepEqual(JSON.parse(JSON.stringify(Save.bestOfAll(save, Courses))), { total: 18 + 36 + 27, toPar: -9 + 8 - 1, parts: [18, 36, 27] })
})

test('a version 1 save keeps its Main Branch progress, boards and streak', () => {
  const old = {
    version: 1,
    unlocked: 9,
    completed: true,
    current: 4,
    round: [2, 3, 3, 3],
    courseBoard: [{ total: 25, toPar: -2, at: 7 }],
    endlessBoard: [{ runId: 3, streak: 6, at: 3 }],
    endless: { runId: null, streak: 0, played: 14, order: [5, 2] }
  }
  const save = Save.loadSave(old)
  assert.equal(save.version, 2)
  assert.equal(Save.bestCourse(save, Main), 25)
  assert.equal(Save.peek(save, Main).current, 4)
  assert.equal(save.last, 'main-branch')
  assert.equal(Save.bestStreak(save), 6)
  assert.deepEqual([...save.endless.order], [5, 2])
  assert.deepEqual([...Courses.map((_, index) => Save.courseOpen(save, Courses, index))], [true, true, false])
})

test('an unknown save version starts fresh instead of breaking', () => {
  assert.equal(Save.loadSave({ version: 99, unlocked: 9 }).last, null)
  assert.equal(Object.keys(Save.loadSave(null).courses).length, 0)
})
