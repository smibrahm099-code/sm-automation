// Instant email checks that need no email link: format, throwaway domains, Gmail rules, and whether the domain can receive mail.
// A single mailbox cannot be confirmed to exist without sending it a message, so this catches typos and fake domains, not every wrong address.
// big providers people mistype (gmil.com, gmial.com, gmail.con ...). Typo websites for these are often real, so this check does not depend on DNS.
const TARGETS = ['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','rediffmail.com']
// real domains that look like a typo of the ones above
const ALLOWED = new Set(['yahoo.in','yahoo.co.in','yahoo.co.uk','yahoo.com.au','outlook.in','outlook.com.au','hotmail.in','hotmail.co.uk','hotmail.co.in','hotmail.fr','hotmail.it','live.in','live.com','live.co.uk','googlemail.com','ymail.com','rocketmail.com','msn.com','mail.com','me.com','mac.com','zoho.in','zoho.com'])
const DISPOSABLE = new Set(['mailinator.com','10minutemail.com','guerrillamail.com','tempmail.com','temp-mail.org','yopmail.com','trashmail.com','sharklasers.com','throwawaymail.com','getnada.com','maildrop.cc','dispostable.com','fakeinbox.com'])

const lev = (a, b) => {
  const d = Array.from({length:a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1))
  return d[a.length][b.length]
}
const closest = domain => ALLOWED.has(domain) || TARGETS.includes(domain) ? undefined : TARGETS.find(c => lev(domain, c) <= 2)

// true: the domain can receive mail, false: it cannot, null: could not find out (never block the user for that)
async function domainHasMail(domain) {
  const ask = async type => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000)
    try {
      const r = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=' + type, {signal:ctl.signal})
      return await r.json()
    } finally { clearTimeout(t) }
  }
  try {
    const mx = await ask('MX')
    if (mx.Status === 3) return false
    if ((mx.Answer || []).some(a => a.type === 15 && a.data.trim() !== '0 .')) return true
    const a = await ask('A')
    return (a.Answer || []).some(x => x.type === 1)
  } catch { return null }
}

export async function checkEmail(raw, opts = {}) {
  const email = (raw || '').trim().toLowerCase()
  const m = /^([^\s@]+)@([^\s@]+\.[^\s@]{2,})$/.exec(email)
  if (!m) return {ok:false, message:'Enter a valid email address.'}
  const local = m[1], domain = m[2]
  if (DISPOSABLE.has(domain)) return {ok:false, message:'Temporary email addresses are not allowed. Use your real email.'}
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const name = local.split('+')[0]
    if (!/^[a-z0-9]{6,30}$/.test(name.replace(/\./g, '')) || name.startsWith('.') || name.endsWith('.') || name.includes('..'))
      return {ok:false, message:'This is not a valid Gmail address. Gmail names have 6 to 30 letters or numbers.'}
  }
  if (!opts.allowTypo) {
    const s = closest(domain)
    if (s) return {ok:false, message:'Did you mean ' + local + '@' + s + '?', suggestion:local + '@' + s, canKeep:true}
  }
  if (await domainHasMail(domain) === false) {
    const s = closest(domain)
    return s ? {ok:false, message:'This email domain does not exist. Did you mean ' + local + '@' + s + '?', suggestion:local + '@' + s}
             : {ok:false, message:'This email domain does not exist or cannot receive email.'}
  }
  return {ok:true}
}
