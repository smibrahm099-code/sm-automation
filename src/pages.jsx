import {useEffect,useRef,useState} from 'react'
import {Link,Navigate,useNavigate,useParams,useLocation} from 'react-router-dom'
import {addDoc,collection,deleteDoc,doc,getDocs,onSnapshot,query,where,orderBy,serverTimestamp} from 'firebase/firestore'
import {configured,db} from './firebase'
import {useAuth,authError,withTimeout,retry,diagnose,restGetPublic,restMyEnquiries,REQUIRE_VERIFIED} from './auth.jsx'
import {checkEmail} from './emailcheck.js'
import {useMachines,optimg,optvid,NO_MACHINE} from './machines.jsx'
import AdminMachines from './AdminMachines.jsx'
const Ph = ({src}) => <img className="ph" loading="lazy" decoding="async" src={optimg(src,600) || '/images/sma-6-0.jpg'} alt="Machine"/>
const fmt = t => t?.toDate ? t.toDate().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : ''
// wa.me wants the full international number as digits only, so a leading +, spaces or dashes in
// VITE_OWNER_WA are dropped here rather than pasted into the address, where they break the link.
export const waNumber = () => String(import.meta.env.VITE_OWNER_WA || '').replace(/\D/g, '')
// window.open leaves the opened tab a handle back to this page unless noopener is asked for;
// a target="_blank" link gets that for nothing, window.open does not.
const openTab = u => window.open(u, '_blank', 'noopener')
// shown instead of the login, register, forgot-password and owner-setup forms when .env has no Firebase settings
const NotConfigured = ({what}) => <section className="wrap"><div className="form">
  <h1 className="t">{what} is not available yet</h1>
  <p className="sub">This copy of the website has no Firebase settings, so accounts cannot be used. Put the four <b>VITE_FIREBASE_*</b> values in <b>.env</b> (Firebase console &gt; Project settings &gt; General &gt; Your apps) and start the website again. Home, About and the machines work without them.</p>
  <Link className="btn" style={{width:'100%'}} to="/machines">Browse machines</Link>
</div></section>
// one column of machine photos moving up, shown on the right of the home hero
function VStrip() {
  const {machines:M} = useMachines()
  const imgs = M.flatMap(m => [...m.images, m.poster].filter(Boolean).map(src => ({m,src:optimg(src,700)})))
  const it = [...imgs,...imgs,...imgs,...imgs]
  return <div className="vcols" aria-label="Machine showcase"><div className="vtrack up">{it.map((x,i) => <Link key={i} className="vc" to={'/machines/'+x.m.id}><img src={x.src} alt="" loading="lazy" decoding="async"/><span>{x.m.c}</span></Link>)}</div></div>
}
function Card({m,level}) {
  const tilt = e => { const c = e.currentTarget, r = c.getBoundingClientRect(); c.style.transform = `rotateY(${((e.clientX-r.left)/r.width-.5)*10}deg) rotateX(${-((e.clientY-r.top)/r.height-.5)*10}deg)` }
  return <Link className="card" to={'/machines/'+m.id} onPointerMove={tilt} onPointerLeave={e => e.currentTarget.style.transform=''}><div className="th"><Ph src={m.images[0]}/></div>{level === 2 ? <h2>{m.c}</h2> : <h3>{m.c}</h3>}<p>{m.d}</p></Link>
}
// level 2 where the cards sit straight under the page title, level 3 where a section heading comes first
const Cards = ({level}) => { const {machines} = useMachines(); return <div className="grid3">{machines.map(m => <Card key={m.id} m={m} level={level}/>)}</div> }

// the photo shows at once; the video loads only after the page is ready, on desktop, and not on slow or data-saving connections
function HeroBg() {
  const [play,setPlay] = useState(false)
  useEffect(() => {
    if (window.innerWidth < 861 || navigator.connection?.saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const go = () => setTimeout(() => setPlay(true), 400)
    if (document.readyState === 'complete') { go(); return }
    window.addEventListener('load', go, {once:true}); return () => window.removeEventListener('load', go)
  }, [])
  return <><img className="herobg" src="/images/hero-poster.jpg" alt="" aria-hidden="true" fetchpriority="high"/>
    {play && <video className="herobg" autoPlay muted loop playsInline preload="auto" aria-hidden="true"><source src="/videos/hero-loop.mp4" type="video/mp4"/></video>}<div className="herobg-shade"/></>
}
export function Home() { return <>
  <HeroBg/>
  <div className="first"><section className="hero"><div><h1>Powering industry with <span>precision automation</span></h1><p>Advanced printing, cutting, open type and closed type machines, built for factories that cannot afford downtime.</p><div className="row"><Link className="btn" to="/machines">Explore machines</Link><Link className="btn ghost" to="/about">Learn more</Link></div></div><VStrip/></section></div>
  <section className="wrap"><h2 className="t">Machine categories</h2><p className="sub">See the machine, watch it run and read its details.</p><Cards/></section></> }
export const About = () => <section className="wrap"><div className="split"><div><h1 className="t">About SM Automation</h1><p className="sub">We design, manufacture and supply advanced automation machines for a wide range of industries, with a focus on accuracy, durability and after-sales support.</p><Link className="btn" to="/machines">See our machines</Link></div>
  <div className="pan"><div className="feat" style={{gridTemplateColumns:'1fr 1fr'}}><div><b>Innovation</b><span>New designs each year</span></div><div><b>Quality</b><span>Tested before dispatch</span></div><div><b>Support</b><span>Install and service</span></div><div><b>Growth</b><span>Machines that scale with you</span></div></div></div></div></section>
export const Machines = () => <><section className="wrap"><h1 className="t">Explore our machines</h1><p className="sub">Choose a machine to see photos, a video and its details.</p><Cards level={2}/></section></>

export function MachineDetail() {
  const {id} = useParams(), nav = useNavigate(), {machines:M,loading,settled} = useMachines(), found = M.find(x => x.id === id), m = found || NO_MACHINE
  if (loading || (!found && !settled)) return <section className="wrap"><p>Loading...</p></section>
  if (!found) return <section className="wrap"><h1 className="t">Machine not found</h1><p className="sub">This machine is not on the website any more. It may have been removed.</p><Link className="btn" to="/machines">See all machines</Link></section>
  return <section className="wrap"><Link to="/machines" style={{color:'var(--mut)'}}>‹ All machines</Link>
    <div className="md2">
      {/* on a phone this strip scrolls sideways, so it has to be reachable with the keyboard too */}
      <div className="media" tabIndex={0} role="group" aria-label={'Photos and video of ' + m.n}>{m.images.map((s,i) => <img key={s} src={optimg(s,900)} alt={m.n} decoding="async" {...(i ? {loading:'lazy'} : {fetchpriority:'high'})}/>)}{m.video && <video controls playsInline preload="metadata" poster={optimg(m.poster,700)} src={optvid(m.video)}/>}</div>
      <div className="info"><h1 className="t">{m.n}</h1><p className="sub">{m.d}</p>
        <ul className="sp">{m.s.map(s => <li key={s[0]}><span>{s[0]}</span><b>{s[1]}</b></li>)}</ul>
        {m.a.length > 0 && <p><b className="hd">Applications</b><br/><span style={{color:'var(--mut)'}}>{m.a.join(' · ')}</span></p>}
        <div className="row"><button className="btn" onClick={() => nav('/enquire/'+m.id)}>Enquire now</button></div></div>
    </div></section>
}

function PwField({id,value,onChange,autoComplete}) {
  const [show,setShow] = useState(false)
  return <div className="pwbox"><input id={id} required type={show?'text':'password'} minLength={6} value={value} onChange={onChange} autoComplete={autoComplete}/><button type="button" onClick={() => setShow(!show)} aria-label={show?'Hide password':'Show password'}>{show?'Hide':'Show'}</button></div>
}

export function AuthForm({register}) {
  const {login,register:reg,logout,resendVerification,checkVerified} = useAuth(), nav = useNavigate(), loc = useLocation(), from = loc.state?.from
  const [f,setF] = useState({name:'',mobile:'',email:'',pw:''}), [err,setErr] = useState(''), [info,setInfo] = useState(''), [busy,setBusy] = useState(false), [verify,setVerify] = useState(false), [suggest,setSuggest] = useState(''), [keep,setKeep] = useState(false), [allowTypo,setAllowTypo] = useState(false)
  const set = k => e => setF({...f,[k]:e.target.value}), okMail = useRef('')
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      if (register) {
        const c = okMail.current === f.email.trim().toLowerCase() ? {ok:true} : await checkEmail(f.email, {allowTypo})
        if (!c.ok) { setErr(c.message); setSuggest(c.suggestion || ''); setKeep(!!c.canKeep); return }
        await reg(f.name.trim(),f.mobile.trim(),f.email.trim(),f.pw)
        if (REQUIRE_VERIFIED) { setVerify(true); return }
        nav(from || '/dashboard',{replace:true}); return
      }
      const r = await login(f.email.trim(),f.pw)
      if (r.admin) { nav('/admin',{replace:true}); return }   // the owner goes straight to the editing page, no email verification
      if (REQUIRE_VERIFIED && !r.user.emailVerified) { setVerify(true); return }
      nav(from && from !== '/admin' ? from : '/dashboard',{replace:true})
    }
    catch (x) { setErr(authError(x)) } finally { setBusy(false) }
  }
  if (!configured) return <NotConfigured what={register ? 'Creating an account' : 'Logging in'}/>
  if (verify) return <section className="wrap"><div className="form">
    <h1 className="t">Verify your email</h1>
    <p className="sub">We sent a link to <b>{f.email}</b>. Open your inbox (check spam too), click the link, then press the button below. Only real emails you can open can be used.</p>
    <div className="err" role="alert">{err}</div><div className="ok">{info}</div>
    <button className="btn" style={{width:'100%'}} disabled={busy} onClick={async () => { setBusy(true); setErr(''); setInfo(''); try { if (await checkVerified()) nav(from || '/dashboard',{replace:true}); else setErr('Not verified yet. Click the link in the email first.') } catch (x) { setErr(authError(x)) } finally { setBusy(false) } }}>{busy ? 'Please wait...' : "I've verified my email"}</button>
    <p style={{textAlign:'center'}}><button type="button" className="link" onClick={async () => { setErr(''); setInfo(''); try { await resendVerification(); setInfo('Verification email sent again.') } catch (x) { setErr(authError(x)) } }}>Resend email</button> · <button type="button" className="link" onClick={async () => { await logout(); setVerify(false); setErr(''); setInfo('') }}>Use a different email</button></p>
  </div></section>
  return <section className="wrap"><form className={register ? 'form wide' : 'form'} onSubmit={submit}>
    <h1 className="t">{register?'Create account':'Welcome back'}</h1><p className="sub" style={{marginBottom:0}}>{from?(from.startsWith('/enquire')?'Log in to send your enquiry.':'Log in to continue.'):register?'Join SM Automation.':'Log in to your account.'}</p>
    {register && <div className="pair"><div><label htmlFor="reg-name">Full name</label><input id="reg-name" required value={f.name} onChange={set('name')} autoComplete="name"/></div><div><label htmlFor="reg-mobile">Mobile number</label><input id="reg-mobile" required inputMode="tel" value={f.mobile} onChange={set('mobile')} autoComplete="tel"/></div></div>}
    <div className={register ? 'pair' : undefined}><div><label htmlFor="auth-email">Email</label><input id="auth-email" required type="email" value={f.email} onChange={e => { set('email')(e); okMail.current = ''; setSuggest(''); setKeep(false); setAllowTypo(false) }} onBlur={register ? async () => { if (!f.email) return; const c = await checkEmail(f.email, {allowTypo}); if (c.ok) okMail.current = f.email.trim().toLowerCase(); setErr(c.ok ? '' : c.message); setSuggest(c.suggestion || ''); setKeep(!!c.canKeep) } : undefined} autoComplete="username"/></div><div><label htmlFor="auth-pw">Password</label><PwField id="auth-pw" value={f.pw} onChange={set('pw')} autoComplete={register?'new-password':'current-password'}/></div></div>
    <div className="err" role="alert">{err}</div>
    {suggest && <div style={{margin:'4px 0 8px'}}><button type="button" className="link" onClick={() => { setF({...f,email:suggest}); setSuggest(''); setKeep(false); setErr('') }}>Use {suggest}</button>{keep && <> · <button type="button" className="link" style={{color:'var(--mut)'}} onClick={() => { setAllowTypo(true); setKeep(false); setSuggest(''); setErr('') }}>My email is correct</button></>}</div>}
    <button className="btn" style={{width:'100%'}} disabled={busy}>{busy?'Please wait...':register?'Register':'Log in'}</button>
    {!register && <p style={{textAlign:'center'}}><Link to="/forgot" state={{email:f.email}} style={{color:'var(--mut)'}}>Forgot password?</Link></p>}
    <p style={{textAlign:'center',color:'var(--mut)'}}>{register ? <>Already have an account? <Link to="/login" state={loc.state} style={{color:'var(--y)',textDecoration:'underline'}}>Log in</Link></> : <>New here? <Link to="/register" state={loc.state} style={{color:'var(--y)',textDecoration:'underline'}}>Register</Link></>}</p>
  </form></section>
}

export function ForgotPassword() {
  const {reset} = useAuth(), loc = useLocation()
  const [email,setEmail] = useState(loc.state?.email || ''), [err,setErr] = useState(''), [sent,setSent] = useState(''), [busy,setBusy] = useState(false), [wait,setWait] = useState(0)
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t) }, [wait])
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { const m = email.trim(); await reset(m); setSent(m); setWait(30) }
    catch (x) { setErr(authError(x)) } finally { setBusy(false) }
  }
  if (!configured) return <NotConfigured what="Resetting a password"/>
  if (sent) return <section className="wrap"><div className="form">
    <h1 className="t">Check your email</h1>
    <p className="sub">If an account exists for <b>{sent}</b>, we have sent a link to reset the password. Open it, choose a new password, then log in. Check the spam folder too.</p>
    <div className="err" role="alert">{err}</div>
    <Link className="btn" style={{width:'100%'}} to="/login">Back to log in</Link>
    <p style={{textAlign:'center'}}><button type="button" className="link" disabled={busy || wait > 0} onClick={submit}>{wait > 0 ? 'Send again in ' + wait + 's' : 'Send the email again'}</button> · <button type="button" className="link" onClick={() => setSent('')}>Use a different email</button></p>
  </div></section>
  return <section className="wrap"><form className="form" onSubmit={submit}>
    <h1 className="t">Forgot password?</h1><p className="sub" style={{marginBottom:0}}>Enter your email and we will send you a link to set a new password.</p>
    <label htmlFor="fp-email">Email</label><input id="fp-email" required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username"/>
    <div className="err" role="alert">{err}</div>
    <button className="btn" style={{width:'100%'}} disabled={busy}>{busy ? 'Please wait...' : 'Send reset link'}</button>
    <p style={{textAlign:'center',color:'var(--mut)'}}><Link to="/login" style={{color:'var(--y)'}}>Back to log in</Link></p>
  </form></section>
}

// /admin/setup: one-time creation of the owner (admin) login. No email verification for the admin.
export function AdminSetup() {
  const {claimAdmin,user,isAdmin} = useAuth(), nav = useNavigate()
  const [open,setOpen] = useState(null), [f,setF] = useState({email:'',pw:'',code:''}), [err,setErr] = useState(''), [busy,setBusy] = useState(false)
  const set = k => e => setF({...f,[k]:e.target.value})
  useEffect(() => { if (configured) retry(() => restGetPublic('meta/adminSetup')).then(d => setOpen(d === null)).catch(() => setOpen(true)) }, [])
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await claimAdmin(f.email.trim(), f.pw, f.code.trim()); nav('/admin',{replace:true}) }
    catch (x) { setErr(x.code === 'permission-denied' ? 'Wrong setup code, or the admin is already created. Check the code in firestore.rules (and that the latest rules are published).' : authError(x)); setBusy(false) }
  }
  if (!configured) return <NotConfigured what="Owner setup"/>
  if (user && isAdmin) return <Navigate to="/admin" replace/>
  return <section className="wrap"><form className="form" onSubmit={submit}>
    <h1 className="t">Owner setup</h1>
    {open === null ? <p className="sub">Checking...</p> : !open ? <>
      <p className="sub">The admin account is already created. Log in with the owner's email and password.</p>
      <Link className="btn" style={{width:'100%'}} to="/login">Go to log in</Link>
    </> : <>
      <p className="sub" style={{marginBottom:0}}>Create the admin login. This can be done only once. The admin does not need email verification.</p>
      <label htmlFor="as-email">Admin email</label><input id="as-email" required type="email" value={f.email} onChange={set('email')} autoComplete="username"/>
      <label htmlFor="as-pw">Password</label><PwField id="as-pw" value={f.pw} onChange={set('pw')} autoComplete="new-password"/>
      <label htmlFor="as-code">Setup code</label><input id="as-code" required value={f.code} onChange={set('code')} autoComplete="off"/>
      <div className="err" role="alert">{err}</div>
      <button className="btn" style={{width:'100%'}} disabled={busy}>{busy ? 'Please wait...' : 'Create admin account'}</button>
    </>}
  </form></section>
}

export function Enquire() {
  const {id} = useParams(), {machines:M,loading,settled} = useMachines(), found = M.find(x => x.id === id), m = found || NO_MACHINE, {user,profile} = useAuth(), nav = useNavigate()
  const [f,setF] = useState({name:profile?.name||'',mobile:profile?.mobile||'',email:user.email,company:'',message:''}), [err,setErr] = useState(''), [busy,setBusy] = useState(false), [step,setStep] = useState('form')
  const set = k => e => setF({...f,[k]:e.target.value})
  // the profile arrives from the database after this form is first drawn: fill the blanks then, without touching what the person has typed
  useEffect(() => { setF(x => ({...x, name:x.name || profile?.name || '', mobile:x.mobile || profile?.mobile || ''})) }, [profile?.name, profile?.mobile])
  const wa = () => 'https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(['*New Machine Enquiry*','Name: '+f.name,'Mobile: '+f.mobile,'Email: '+f.email,'Company: '+f.company,'Machine: '+m.n,'Requirement: '+f.message].join('\n'))
  // step 1: open WhatsApp with the message ready (nothing is saved yet)
  const submit = e => { e.preventDefault(); setErr(''); openTab(wa()); setStep('confirm') }
  // step 2: only when the person says the message was sent on WhatsApp is the enquiry saved, so the admin sees real enquiries only
  const sent = async () => {
    setErr(''); setBusy(true)
    try {
      await withTimeout(addDoc(collection(db,'enquiries'),{uid:user.uid,name:f.name,mobile:f.mobile,email:f.email,company:f.company,machineId:m.id,message:f.message,createdAt:serverTimestamp()}))
      nav('/dashboard')
    } catch (x) { setErr(authError(x)) } finally { setBusy(false) }
  }
  if (loading || (!found && !settled)) return <section className="wrap"><p>Loading...</p></section>
  // enquiring about a machine the owner has deleted used to quietly switch to a different one, and save that one's id
  if (!found) return <section className="wrap"><h1 className="t">Machine not found</h1><p className="sub">This machine is not on the website any more, so there is nothing to enquire about.</p><Link className="btn" to="/machines">See all machines</Link></section>
  if (step === 'confirm') return <section className="wrap"><div className="form">
    <h1 className="t">Send on WhatsApp</h1><p className="sub">WhatsApp has opened with your enquiry for <b>{m.n}</b>. Press <b>Send</b> there, then come back and tap the button below.</p>
    <div className="err" role="alert">{err}</div>
    <button className="btn" style={{width:'100%'}} disabled={busy} onClick={sent}>{busy ? 'Please wait...' : "Yes, I sent it on WhatsApp"}</button>
    <p style={{textAlign:'center'}}><button type="button" className="link" onClick={() => openTab(wa())}>Open WhatsApp again</button> · <button type="button" className="link" onClick={() => setStep('form')}>Edit my enquiry</button></p>
  </div></section>
  return <section className="wrap"><form className="form wide" onSubmit={submit}><h1 className="t">Enquiry form</h1><p className="sub" style={{marginBottom:0}}>Enquiring about {m.n}.</p>
    <div className="pair"><div><label htmlFor="eq-name">Full name *</label><input id="eq-name" required value={f.name} onChange={set('name')}/></div><div><label htmlFor="eq-mobile">Mobile number *</label><input id="eq-mobile" required value={f.mobile} onChange={set('mobile')}/></div></div>
    <div className="pair"><div><label htmlFor="eq-email">Email *</label><input id="eq-email" required type="email" value={f.email} onChange={set('email')}/></div><div><label htmlFor="eq-company">Company name *</label><input id="eq-company" required value={f.company} onChange={set('company')}/></div></div>
    <label htmlFor="eq-message">Requirement / message *</label><textarea id="eq-message" required rows={3} maxLength={1900} value={f.message} onChange={set('message')}/>
    <div className="err" role="alert">{err}</div><button className="btn" style={{width:'100%'}}>Continue to WhatsApp</button></form></section>
}

const EnqRow = ({e,who,onDel}) => { const {machines:M} = useMachines(), found = M.find(x => x.id === e.machineId), m = found || NO_MACHINE
  return <div className="enq"><div className="th"><Ph src={m.images[0]}/></div><div><b>{found ? m.n : (e.machineId || 'Machine') + ' (not listed any more)'}</b>{who && <> · {e.name}</>}<br/><span className="ok">Sent on WhatsApp</span> <span style={{color:'var(--mut)'}}>· {fmt(e.createdAt)}</span>{who && <div style={{color:'var(--mut)',fontSize:14}}>{e.mobile} · {e.email} · {e.company}<br/>{e.message}</div>}{onDel && <button type="button" className="link" style={{color:'#ff8a80',paddingLeft:0}} onClick={onDel}>Delete</button>}</div></div> }

export function Dashboard() {
  const {user,profile,logout} = useAuth(), nav = useNavigate(), [list,setList] = useState(null)
  useEffect(() => {
    restMyEnquiries(user.uid).catch(() => withTimeout(getDocs(query(collection(db,'enquiries'),where('uid','==',user.uid)))).then(s => s.docs.map(d => d.data()).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))))
      .then(setList).catch(() => setList([]))
  }, [user.uid])
  return <section className="wrap"><h1 className="t">Hello, {profile?.name || user.email}</h1>
    <div className="pan" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap',marginBottom:22}}>
      <div style={{color:'var(--mut)'}}>{user.email}{profile?.mobile && <><br/>{profile.mobile}</>}</div>
      <button className="btn ghost" onClick={async () => { await logout(); nav('/') }}>Log out</button>
    </div>
    <h2 className="hd" style={{marginBottom:12}}>My enquiries</h2>
    {list === null ? <p className="sub">Loading...</p> : list.length ? list.map((e,i) => <EnqRow key={i} e={e}/>)
      : <div className="pan">No enquiries yet.<br/><br/><Link className="btn" to="/machines">Browse machines</Link></div>}
  </section>
}

function AdminEnquiries() {
  const [list,setList] = useState(null)
  useEffect(() => onSnapshot(query(collection(db,'enquiries'),orderBy('createdAt','desc')), s => setList(s.docs.map(d => ({...d.data(),id:d.id}))), () => setList([])), [])
  const del = async e => { if (confirm('Delete this enquiry?')) try { await withTimeout(deleteDoc(doc(db,'enquiries',e.id))) } catch (x) { alert(authError(x)) } }
  return list === null ? <p>Loading...</p> : list.length ? list.map(e => <EnqRow key={e.id} e={e} who onDel={() => del(e)}/>) : <div className="pan">No enquiries yet.</div>
}

export function Admin() {
  const [tab,setTab] = useState('machines')
  return <section className="wrap"><h1 className="t">Admin</h1><p className="sub">Add and edit machines, and see enquiries. <Link to="/" style={{color:'var(--y)'}}>View website</Link></p>
    <div className="seg"><button className={tab==='machines'?'on':''} onClick={() => setTab('machines')}>Machines</button><button className={tab==='enquiries'?'on':''} onClick={() => setTab('enquiries')}>Enquiries</button></div>
    {tab === 'machines' ? <AdminMachines/> : <AdminEnquiries/>}</section>
}

// shown at /admin to a logged-in account that is not an admin (or whose admin access could not be confirmed)
export function AdminGate() {
  const {user,logout,refreshAdmin,adminError} = useAuth(), nav = useNavigate()
  const [retrying,setRetrying] = useState(false), [diag,setDiag] = useState(null)
  const again = async () => { setRetrying(true); setDiag(null); await refreshAdmin(); setRetrying(false) }
  const test = async () => { setDiag([{ok:true,t:'Testing...'}]); setDiag(await diagnose()) }
  useEffect(() => { if (adminError) test() }, [adminError])   // find the cause automatically
  return <section className="wrap"><div className="form">
    <h1 className="t">Admin access</h1>
    {adminError ? <div className="pan" style={{padding:16,marginBottom:14}}>
      <p className="err" style={{margin:0}}>Could not confirm your admin access ({adminError}). This is a connection problem, not a wrong password.</p>
      <div style={{display:'flex',gap:10,marginTop:12,flexWrap:'wrap'}}>
        <button type="button" className="btn" disabled={retrying} onClick={again}>{retrying ? 'Checking...' : 'Try again'}</button>
        <button type="button" className="btn ghost" onClick={test}>Find the problem</button>
      </div>
      {diag && <ul style={{margin:'12px 0 0',paddingLeft:18,fontSize:14}}>{diag.map((d,i) => <li key={i} style={{color:d.ok?'#4ade80':'#ff8a80',marginBottom:4}}>{d.t}</li>)}</ul>}
    </div> : <>
      <p className="sub">You are logged in as <b>{user.email}</b>, but this account is not an admin. Log in with the owner's account.</p>
      <button type="button" className="btn" style={{width:'100%'}} onClick={() => nav('/dashboard')}>Go to my dashboard</button>
    </>}
    <p style={{textAlign:'center',margin:'14px 0 0',fontSize:14}}><a href="#" style={{color:'var(--mut)'}} onClick={async e => { e.preventDefault(); await logout(); nav('/login') }}>Log out and use another account</a></p>
  </div></section>
}
