import test from 'node:test'
import assert from 'node:assert/strict'
import { mountWorker } from 'orca/testing'
import * as main from '../src/worker.ts'

test('worker hides the status bar badge while calm and Orca refuses none of its calls', async () => {
  const worker = await mountWorker(main)
  const updates = worker.host.callsOf('statusBar.update')
  assert.ok(updates.length >= 1)
  assert.equal(updates[0].id, 'health')
  assert.equal(updates[0].visible, false)
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})
