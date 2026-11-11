import {createContext,useCallback,useContext,useEffect,useState} from 'react'
import {collection,onSnapshot} from 'firebase/firestore'
import {configured,db} from './firebase'
import {M as BUILTIN} from './data.js'

export const NO_MACHINE = {id:'',n:'Machine',c:'',d:'',s:[],a:[],images:[],video:'',poster:''}
// Cloudinary delivery: smaller files in the best format for each browser
export const optimg = (u, w = 1200) => u && u.includes('/image/upload/') && !u.includes('/upload/f_auto') ? u.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`) : u
export const optvid = u => u && u.includes('/video/upload/') && !u.includes('/upload/f_auto') ? u.replace('/upload/', '/upload/f_auto,q_auto/') : u
const toMachine = (id, d) => ({id, n:d.n||'', c:d.c||d.n||'', d:d.d||'', s:(d.specs||[]).map(x => [x.k,x.v]), a:d.a||[], images:d.images||[], video:d.video||'', poster:d.poster||'', order:d.order||0})

export const MachinesCtx = createContext({machines:[],source:'builtin',loading:true,settled:false,reload:async () => {}})
export const useMachines = () => useContext(MachinesCtx)

// machines come from the database and update live: when the admin saves, every open page changes without a refresh.
// the built-in machine is shown if the database has none or cannot be reached
const CK = 'sm_machines_v1'
const readMachines = () => { try { const l = JSON.parse(localStorage.getItem(CK)); return Array.isArray(l) && l.length ? l : null } catch { return null } }
export function MachinesProvider({children}) {
  // the page never waits for the database: it starts with the last list seen on this device (or the built-in one) and updates live
  // settled stays false until the database has answered once, so a link to a machine is never called "not found" while the list is still on its way
  const [state,setState] = useState(() => { const c = configured && readMachines(); return c ? {machines:c,source:'database',loading:false,settled:!configured} : {machines:BUILTIN,source:'builtin',loading:false,settled:!configured} })
  useEffect(() => {
    if (!configured) return   // no database: keep showing the built-in machine
    // Firestore can stay silent for a long time while it retries a connection it cannot make, so never wait on it
    // for ever: after a few seconds the list we already have is the answer.
    const t = setTimeout(() => setState(s => s.settled ? s : {...s,settled:true}), 4000)
    const unsub = onSnapshot(collection(db,'machines'), snap => {
      // Firestore raises an empty snapshot from its own local cache when it cannot reach the server. That is not
      // "there are no machines": acting on it threw away the saved list and left the visitor with the built-in
      // machine, exactly when the network is already failing. Wait for a real answer instead.
      if (snap.empty && snap.metadata.fromCache) return setState(s => ({...s,settled:true}))
      const list = snap.docs.map(d => toMachine(d.id, d.data())).sort((a,b) => a.order - b.order)
      if (list.length) { try { localStorage.setItem(CK, JSON.stringify(list)) } catch {} setState({machines:list,source:'database',loading:false,settled:true}) }
      else { try { localStorage.removeItem(CK) } catch {} setState({machines:BUILTIN,source:'builtin',loading:false,settled:true}) }
    }, () => setState(s => ({...s,settled:true})))   // the database cannot be reached: stop waiting, the built-in machine is what we have
    return () => { clearTimeout(t); unsub() }
  }, [])
  const reload = useCallback(async () => {}, [])   // not needed any more, kept so the admin page code still works
  return <MachinesCtx.Provider value={{...state,reload}}>{children}</MachinesCtx.Provider>
}
