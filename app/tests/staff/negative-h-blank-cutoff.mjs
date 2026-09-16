// (h) The school form goes back to Number() for "school days before": a blank field quietly saves 0 ("order on the day") →
// the blank-field check goes red on the stored value.
import { pageNegative } from '../negative-lib.mjs'

process.exit(
  pageNegative({
    dir: 'staff',
    name: 'blank-cutoff',
    why: 'the school form reads cutoff days with Number(), so a blank field is sent as 0 and saved',
    patches: [
      {
        file: 'admin/admin.js',
        from: "  const days = wholeNumber($('#cutoff-days').value, 0, 5)\n",
        to: "  const days = Number($('#cutoff-days').value)\n",
      },
    ],
    spec: 'settings.spec.mjs',
    grep: 'a blank cut-off or class order is refused on the field and nothing is saved',
    project: 'chromium-1280',
    expect: ['cutoff_days_before still 1 in the API'],
  }),
)
