// (f) A transparent cover over the teacher's buttons → the tap check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'teacher-cover',
  why: "a transparent fixed layer sits over the teacher's list, so Given out / Absent cannot be tapped",
  patches: [{
    file: 'teacher/index.html',
    from: '<ul id="class-list" class="class-list" aria-live="polite"></ul>',
    to: '<div style="position:fixed;inset:0;z-index:50;background:transparent"></div><ul id="class-list" class="class-list" aria-live="polite"></ul>',
  }],
  spec: 'teacher.spec.mjs',
  grep: 'teacher marks are 56 px, not covered, no sideways scroll',
  project: 'webkit-390',
  expect: ['something else is on top'],
}))
