import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'

const { MiniGolfSave: Save, MiniGolfCourse: Course } = load('engine.js', 'course.js', 'save.js')

function finishRound(save, strokes, at) {
  let result
  Course.holes.forEach((_, index) => {
    result = Save.finishCourseHole(save, Course, index, strokes, at)
  })
  return result
}

test('a new player has one open hole, no Endless and nothing to continue', () => {
  const save = Save.newSave()
  assert.equal(save.unlocked, 1)
  assert.equal(Save.endlessReady(save), false)
  assert.equal(save.current, null)
})

test('finishing a hole at any score unlocks the next and moves Continue on', () => {
  const save = Save.newSave()
  Save.finishCourseHole(save, Course, 0, 12, 1)
  assert.equal(save.unlocked, 2)
  assert.equal(save.current, 1)
})

test('replaying a hole sends you back to the first one you have not played', () => {
  const save = Save.newSave()
  Save.finishCourseHole(save, Course, 0, 3, 1)
  Save.finishCourseHole(save, Course, 1, 3, 1)
  Save.finishCourseHole(save, Course, 0, 2, 1)
  assert.equal(save.current, 2)
})

test('replaying an early hole never locks later ones', () => {
  const save = Save.newSave()
  Save.finishCourseHole(save, Course, 0, 3, 1)
  Save.finishCourseHole(save, Course, 1, 3, 1)
  Save.finishCourseHole(save, Course, 0, 2, 1)
  assert.equal(save.unlocked, 3)
  assert.equal(save.round[0], 2)
})

test('finishing the course posts a score, opens Endless and clears the round', () => {
  const save = Save.newSave()
  const result = finishRound(save, 3, 500)
  assert.deepEqual({ ...result }, { finished: true, total: 27, toPar: 0, rank: 1 })
  assert.equal(Save.endlessReady(save), true)
  assert.equal(Save.bestCourse(save), 27)
  assert.equal(save.round.length, 0)
  assert.equal(save.current, null)
  assert.equal(save.unlocked, 9)
})

test('the course board sorts low to high and keeps the top ten', () => {
  const save = Save.newSave()
  for (let strokes = 13; strokes >= 2; strokes--) finishRound(save, strokes, strokes)
  assert.equal(save.courseBoard.length, 10)
  assert.equal(save.courseBoard[0].total, 18)
  assert.equal(save.courseBoard[9].total, 99)
})

test('a score too poor for a full board reports no rank', () => {
  const save = Save.newSave()
  for (let i = 0; i < 10; i++) finishRound(save, 2, i)
  assert.equal(finishRound(save, 9, 99).rank, null)
})

test('Endless plays all nine holes before repeating', () => {
  const save = Save.newSave()
  finishRound(save, 3, 1)
  const seen = new Set()
  for (let i = 0; i < 9; i++) {
    seen.add(Save.nextEndlessHole(save, Course, Math.random))
    Save.finishEndlessHole(save, Course, 1, i)
  }
  assert.equal(seen.size, 9)
})

test('one streak keeps one growing board entry, and over par ends it', () => {
  const save = Save.newSave()
  finishRound(save, 3, 1)
  Save.nextEndlessHole(save, Course, Math.random)
  Save.finishEndlessHole(save, Course, 1, 10)
  Save.nextEndlessHole(save, Course, Math.random)
  Save.finishEndlessHole(save, Course, 1, 11)
  assert.equal(save.endlessBoard.length, 1)
  assert.equal(Save.bestStreak(save), 2)
  Save.nextEndlessHole(save, Course, Math.random)
  const lost = Save.finishEndlessHole(save, Course, 20, 12)
  assert.equal(lost.madePar, false)
  assert.equal(save.endless.streak, 0)
  assert.equal(Save.bestStreak(save), 2)
})

test('an unknown save version starts fresh instead of breaking', () => {
  assert.equal(Save.loadSave({ version: 99, unlocked: 9 }).unlocked, 1)
  assert.equal(Save.loadSave(null).unlocked, 1)
})
