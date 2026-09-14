// "/" Sign in with the family code from the school's paper.
import { ApiError, api, session } from '../common/api.js'
import { $, getInfo, renderHeader, say } from './family.js'

if (session.get('family')?.token) location.replace('/family/')

const code = $('code')
const error = $('code-error')
const button = $('sign-in')

// Capitals only, and a dash after the first 4 characters (typing the dash yourself is fine too).
code.addEventListener('input', (ev) => {
  const raw = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  let v = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw
  if (raw.length === 4 && (ev.inputType || '').startsWith('insert')) v += '-'
  if (v !== code.value) code.value = v
  say(error, '')
})

$('signin-form').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const value = code.value.trim()
  if (!value) {
    say(error, 'Type your family code. It is on the paper from the school.')
    code.focus()
    return
  }
  button.disabled = true
  say(error, '')
  try {
    const s = await api('POST', '/api/family/signin', { body: { code: value } })
    session.set('family', s)
    location.replace('/family/')
  } catch (e) {
    say(error, e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    button.disabled = false
    code.focus()
  }
})

getInfo().then((info) => renderHeader(info, { home: '/' }), () => {})
