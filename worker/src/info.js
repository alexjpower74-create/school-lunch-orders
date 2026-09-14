// GET /api/info: the school, today in the school's zone, the cut-off rule and the allergen list. Public.
import { ALLERGENS } from './allergens.js'
import { cutoffRuleLabel, nextSchoolDay } from './calendar.js'
import { loadCal } from './db.js'
import { json } from './http.js'
import { TZ, dateLabel, longLabel, timeLabel } from './time.js'

export async function info(c) {
  const cal = await loadCal(c.db)
  const s = cal.school
  const next = nextSchoolDay(cal, c.today)
  return json({
    school_name: s.school_name, sample: s.sample, zone: TZ, today: c.today, date_label: dateLabel(c.today), long_label: longLabel(c.today),
    now: c.nowIso, time_label: timeLabel(c.now), next_school_day: next, next_school_day_label: next ? dateLabel(next) : null,
    payment_instructions: s.payment_instructions, cutoff_days_before: s.cutoff_days_before, cutoff_time: s.cutoff_time,
    cutoff_rule_label: cutoffRuleLabel(s.cutoff_days_before, s.cutoff_time), allergens: ALLERGENS,
  })
}
