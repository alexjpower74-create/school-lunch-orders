// (c) The teacher page counts marks locally and ignores the answer's counts → the count check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'teacher-counts',
  why: "the teacher page bumps its own counts after a tap instead of showing the API answer's counts",
  patches: [{
    file: 'teacher/teacher.js',
    from: 'renderCounts(res.counts)',
    to: "renderCounts({ ...day.counts, delivered: day.counts.delivered + (state === 'delivered' ? 1 : 0), absent: day.counts.absent + (state === 'absent' ? 1 : 0) })",
  }],
  spec: 'teacher.spec.mjs',
  grep: 'Given out and Absent update the counts from the answer and survive a reload',
  project: 'chromium-390',
  expect: ['after Liam given out'],
}))
