// /staff/ PIN sign-in: keypad taps (or the keyboard's digits), POST /api/staff/signin, then the role's own page.
import { api, session } from '../common/api.js'
import { $, $$, brand, clearMessage, getInfo, ROLE_HOME, showError } from './staff.js'

const MAX = 6
let pin = ''
let sending = false

function renderDots() {
  const dots = $('#pin-dots')
  const slots = Math.max(4, pin.length)
  dots.replaceChildren(
    ...Array.from({ length: slots }, (_, i) => {
      const d = document.createElement('span')
      d.className = `pin-dot${i < pin.length ? ' on' : ''}`
      return d
    }),
  )
  dots.setAttribute('aria-label', pin.length ? `${pin.length} ${pin.length === 1 ? 'digit' : 'digits'} typed` : 'No digits yet')
}

function press(key) {
  if (sending) return
  if (/^\d$/.test(key)) {
    if (pin.length < MAX) pin += key
    clearMessage($('#pin-error'))
  } else if (key === 'back') {
    pin = pin.slice(0, -1)
  } else if (key === 'clear') {
    pin = ''
  }
  renderDots()
}

async function submit() {
  if (sending) return
  const error = $('#pin-error')
  if (pin.length < 4) {
    showError(error, { message: 'Tap your 4 to 6 digit PIN first.' })
    return
  }
  sending = true
  $('#pin-submit').disabled = true
  try {
    const s = await api('POST', '/api/staff/signin', { body: { pin } })
    session.set('staff', s)
    location.assign(ROLE_HOME[s.role] || '/staff/')
  } catch (err) {
    pin = ''
    renderDots()
    showError(error, err)
    sending = false
    $('#pin-submit').disabled = false
  }
}

for (const key of $$('button.key')) key.addEventListener('click', () => press(key.dataset.key))
$('#pin-submit').addEventListener('click', submit)
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') press('back')
  else if (e.key === 'Enter' && document.activeElement?.tagName !== 'A') {
    e.preventDefault()
    submit()
  }
})

$('[data-sticky-header]').append(brand())
renderDots()
getInfo()
  .then((info) => {
    if (info.school_name) $('[data-sticky-header] .brand').replaceWith(brand(info.school_name, info.sample))
  })
  .catch(() => {})
