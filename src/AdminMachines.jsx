import {useState} from 'react'
import {doc,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore'
import {db} from './firebase'
import {withTimeout,authError} from './auth.jsx'
import {useMachines,optimg,optvid} from './machines.jsx'
import {M as BUILTIN} from './data.js'
import {uploadToCloudinary,cloudinaryReady,posterFromVideo} from './cloudinary.js'

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'machine'
const blank = () => ({id:'',n:'',c:'',d:'',specs:[{k:'',v:''}],a:'',images:[],video:'',poster:'',origVideo:'',order:0})
const fromMachine = m => ({id:m.id,n:m.n,c:m.c===m.n?'':m.c,d:m.d,specs:m.s.length?m.s.map(([k,v]) => ({k,v})):[{k:'',v:''}],a:m.a.join(', '),images:[...m.images],video:m.video||'',poster:m.poster||'',origVideo:m.video||'',order:m.order||0})

export default function AdminMachines() {
  const {machines,source,reload} = useMachines()
  const [f,setF] = useState(null), [msg,setMsg] = useState(''), [busy,setBusy] = useState(false), [ups,setUps] = useState([])
  const upd = (k,v) => setF(x => ({...x,[k]:v}))
  const setSpec = (i,k,v) => setF(x => ({...x,specs:x.specs.map((s,j) => j === i ? {...s,[k]:v} : s)}))

  const addFiles = async (files, kind) => {
    for (const file of files) {
      const id = Math.random().toString(36).slice(2)
      setUps(u => [...u,{id,name:file.name,pct:0}])
      try {
        if (!file.type.startsWith(kind + '/')) throw new Error(kind === 'video' ? 'Please choose a video file.' : 'Please choose a photo.')
        const r = await uploadToCloudinary(file, pct => setUps(u => u.map(x => x.id === id ? {...x,pct} : x)))
        // the form may have been closed while this was uploading: writing into it then wiped the whole
        // editor (null for a photo, a half-built machine for a video) and crashed the admin page
        if (kind === 'video') setF(x => x && {...x,video:r.url})
        else setF(x => x && {...x,images:[...x.images,r.url]})
        setUps(u => u.filter(x => x.id !== id))
      } catch (e) { setUps(u => u.map(x => x.id === id ? {...x,err:e.message} : x)) }
    }
  }
  const save = async e => {
    e.preventDefault(); setMsg('')
    if (ups.some(u => !u.err)) return setMsg('Wait for the uploads to finish.')
    setBusy(true)
    try {
      const id = f.id || slug(f.n) + '-' + Date.now().toString(36).slice(-4)
      const data = {
        n:f.n.trim(), c:(f.c || f.n).trim(), d:f.d.trim(),
        specs:f.specs.filter(s => s.k.trim() || s.v.trim()).map(s => ({k:s.k.trim(),v:s.v.trim()})),
        a:f.a.split(',').map(s => s.trim()).filter(Boolean),
        images:f.images, video:f.video, poster:f.video === f.origVideo ? f.poster : posterFromVideo(f.video),
        order:f.order || Date.now(), updatedAt:serverTimestamp()
      }
      await withTimeout(setDoc(doc(db,'machines',id), data))
      await reload(); setF(null); setUps([]); setMsg('Saved. The website now shows this machine.')
    } catch (x) { setMsg(authError(x)) } finally { setBusy(false) }
  }
  const remove = async m => {
    if (!window.confirm('Delete "' + m.n + '" from the website?')) return
    try { await withTimeout(deleteDoc(doc(db,'machines',m.id))); await reload(); setMsg('Deleted.') } catch (x) { setMsg(authError(x)) }
  }
  const seed = async () => {
    setBusy(true); setMsg('')
    try {
      for (const m of BUILTIN) await withTimeout(setDoc(doc(db,'machines',m.id), {n:m.n,c:m.c,d:m.d,specs:m.s.map(([k,v]) => ({k,v})),a:m.a,images:m.images,video:m.video||'',poster:m.poster||'',order:1,updatedAt:serverTimestamp()}))
      await reload(); setMsg('Copied. You can now edit it and add more machines.')
    } catch (x) { setMsg(authError(x)) } finally { setBusy(false) }
  }

  if (f) return <form className="form wide" onSubmit={save}>
    <h2 className="hd" style={{fontSize:24}}>{f.id ? 'Edit machine' : 'Add machine'}</h2>
    {!cloudinaryReady && <p className="err">Photo and video uploads are not set up yet. See the README, "Admin" section.</p>}
    <label htmlFor="am-name">Machine name *</label><input id="am-name" required value={f.n} onChange={e => upd('n',e.target.value)} placeholder="SMA 6.0 Plate Grinding CNC Machine"/>
    <label htmlFor="am-title">Short title shown on cards (optional)</label><input id="am-title" value={f.c} onChange={e => upd('c',e.target.value)} placeholder="Plate Grinding CNC Machine"/>
    <label htmlFor="am-desc">Description</label><textarea id="am-desc" rows={3} value={f.d} onChange={e => upd('d',e.target.value)}/>
    <label>Specifications</label>
    {f.specs.map((s,i) => <div className="srow" key={i}><input placeholder="Name, e.g. Motor power" value={s.k} onChange={e => setSpec(i,'k',e.target.value)}/><input placeholder="Value, e.g. 5 HP" value={s.v} onChange={e => setSpec(i,'v',e.target.value)}/><button type="button" className="link" onClick={() => upd('specs',f.specs.filter((_,j) => j !== i))} aria-label="Remove row">✕</button></div>)}
    <button type="button" className="link" onClick={() => upd('specs',[...f.specs,{k:'',v:''}])}>+ Add specification</button>
    <label htmlFor="am-apps">Applications (separate with commas)</label><input id="am-apps" value={f.a} onChange={e => upd('a',e.target.value)} placeholder="Plate grinding, Steel plates"/>
    <label htmlFor="am-photos">Photos</label>
    <div className="athumbs">{f.images.map((u,i) => <figure key={u}><img src={optimg(u,300)} alt="" loading="lazy" decoding="async"/><div>{i > 0 && <button type="button" className="link" onClick={() => upd('images',[u,...f.images.filter(x => x !== u)])}>Main</button>}<button type="button" className="link" onClick={() => upd('images',f.images.filter(x => x !== u))}>Remove</button></div>{i === 0 && <small>Main photo</small>}</figure>)}</div>
    <input id="am-photos" type="file" accept="image/*" multiple onChange={e => { addFiles([...e.target.files],'image'); e.target.value = '' }}/>
    <label htmlFor="am-video">Video</label>
    {f.video && <div><video src={optvid(f.video)} controls playsInline preload="metadata" style={{maxWidth:240,maxHeight:300,borderRadius:12}}/><br/><button type="button" className="link" onClick={() => upd('video','')}>Remove video</button></div>}
    <input id="am-video" type="file" accept="video/*" onChange={e => { addFiles([...e.target.files],'video'); e.target.value = '' }}/>
    {ups.map(u => <p className="up" key={u.id}>{u.name}: {u.err ? <span className="err">{u.err}</span> : u.pct + '%'}</p>)}
    <div className="err" role="alert">{msg}</div>
    <div className="row"><button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save machine'}</button><button type="button" className="btn ghost" onClick={() => { setF(null); setUps([]); setMsg('') }}>Cancel</button></div>
  </form>

  return <div>
    {source === 'builtin' && <div className="pan" style={{marginBottom:16}}><p style={{margin:'0 0 12px'}}>The website is showing the built-in machine, which is not in the database yet. Copy it to the database so you can edit it and add more machines.</p><button className="btn sm" disabled={busy} onClick={seed}>{busy ? 'Copying...' : 'Copy to database'}</button></div>}
    <button className="btn" onClick={() => { setF(blank()); setMsg('') }}>+ Add machine</button>
    <div className="err" role="alert" style={{marginTop:12}}>{msg}</div>
    <div style={{marginTop:12}}>{machines.map(m => <div className="enq" key={m.id}><div className="th"><img className="ph" src={optimg(m.images[0],300) || '/images/sma-6-0.jpg'} alt=""/></div><div style={{flex:1}}><b>{m.n}</b><br/><span style={{color:'var(--mut)',fontSize:14}}>{m.images.length} photo(s){m.video ? ' · video' : ''}</span></div><button className="btn sm ghost" onClick={() => { setF(fromMachine(m)); setMsg('') }}>Edit</button>{source === 'database' && <button className="btn sm ghost" onClick={() => remove(m)}>Delete</button>}</div>)}</div>
  </div>
}
