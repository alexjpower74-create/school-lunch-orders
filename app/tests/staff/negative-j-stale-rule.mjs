// (j) After saving the school, the "Parents see" rule line is not refreshed → the no-reload rule check goes red.
import { pageNegative } from '../negative-lib.mjs'

process.exit(pageNegative({
  dir: 'staff',
  name: 'stale-rule',
  why: 'the school form does not re-read /api/info after saving, so "Parents see" keeps the old cut-off rule',
  patches: [{
    file: 'admin/admin.js',
    from: "      info = await staffApi('GET', '/api/info') // the parents' rule line follows the saved cut-off\n",
    to: '      // (rule line not refreshed)\n',
  }],
  spec: 'settings.spec.mjs',
  grep: 'school settings save and come back after a reload',
  project: 'chromium-1280',
  expect: ["the parents' rule line after saving, without a reload"],
}))
