import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {Routes,Route,Link,NavLink,Navigate,Outlet,useLocation,useNavigate} from 'react-router-dom'
import {useAuth} from './auth.jsx'
import {Home,About,Machines,MachineDetail,AuthForm,ForgotPassword,AdminSetup,Enquire,Dashboard,Admin,AdminGate} from './pages.jsx'
function Layout() {
  const {user,isAdmin,logout} = useAuth(), [open,setOpen] = useState(false), {pathname} = useLocation(), nav = useNavigate(), mainRef = useRef(null)
  // on wide screens html.fit scrolls <main>, not the window, so the window scroll alone left the new page part-scrolled
  useEffect(() => { setOpen(false); window.scrollTo(0,0); mainRef.current?.scrollTo(0,0) }, [pathname])
  useLayoutEffect(() => { document.documentElement.classList.toggle('fit', pathname !== '/') }, [pathname])
  const on = ({isActive}) => isActive ? 'on' : ''
  return <>
    <header><Link className="brand" to={user && isAdmin ? '/admin' : '/'}><img src="/images/logo.png" alt="SM Automation logo"/><span>SM AUTOMATION</span></Link>
      <button className="menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}><span></span><span></span><span></span></button>
      <nav className={open ? 'open' : ''}>
        {user && isAdmin ? <><NavLink className={on} to="/admin">Admin</NavLink><button onClick={async () => { await logout(); nav('/login') }}>Log out</button></> : <>
        <NavLink className={on} to="/" end>Home</NavLink><NavLink className={on} to="/about">About</NavLink><NavLink className={on} to="/machines">Machines</NavLink>
        {user ? <NavLink className={on} to="/dashboard">Dashboard</NavLink> : <NavLink className={on} to="/login">Login</NavLink>}
        <Link className="btn" to="/machines">Enquire</Link></>}
      </nav></header>
    <main ref={mainRef}><Outlet/></main>
    <footer><span><b className="hd" style={{color:'var(--tx)'}}>SM AUTOMATION</b><span className="sep"> · </span>Smart Machines. Better Tomorrow.</span><span>Automation · Precision · Progress</span>
    <p className="credit"><span>Designed and Developed by <b>CRAFT TECH</b></span><span className="sep"> · </span><span>Contact: <a href="tel:+919629862258">9629862258</a></span></p></footer>
  </>
}
// normal users only: the owner is sent to the Admin page, a visitor to the login page
function Protected({children,admin}) {
  const {user,isAdmin,loading,adminChecked} = useAuth(), loc = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" state={{from:loc.pathname}} replace/>
  if (admin) return !adminChecked ? <section className="wrap"><p className="sub">Checking access...</p></section> : isAdmin ? children : <AdminGate/>
  if (isAdmin) return <Navigate to="/admin" replace/>   // a normal page opens at once; the owner is moved to Admin as soon as it is known
  return children
}
// login / register / forgot: someone already logged in is sent on to the right place
function Guest({children}) {
  const {user,isAdmin,loading} = useAuth(), loc = useLocation(), from = loc.state?.from
  if (loading) return null
  if (!user) return children
  return <Navigate to={isAdmin ? '/admin' : (from && from !== '/admin' ? from : '/dashboard')} replace/>
}
export default function App() {
  return <Routes><Route element={<Layout/>}>
    <Route index element={<Home/>}/><Route path="about" element={<About/>}/><Route path="machines" element={<Machines/>}/><Route path="machines/:id" element={<MachineDetail/>}/>
    <Route path="login" element={<Guest><AuthForm/></Guest>}/><Route path="register" element={<Guest><AuthForm register/></Guest>}/><Route path="forgot" element={<Guest><ForgotPassword/></Guest>}/>
    <Route path="admin/setup" element={<AdminSetup/>}/>
    <Route path="enquire/:id" element={<Protected><Enquire/></Protected>}/>
    <Route path="dashboard" element={<Protected><Dashboard/></Protected>}/>
    <Route path="admin" element={<Protected admin><Admin/></Protected>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route></Routes>
}
