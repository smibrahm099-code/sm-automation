import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import App from './App.jsx'
import {AuthProvider} from './auth.jsx'
import {MachinesProvider} from './machines.jsx'
import './styles.css'
// The web fonts are fetched without holding up the first paint. The swap lives here rather than in an
// inline onload attribute, which a strict Content-Security-Policy refuses to run - that would leave the
// stylesheet stuck on media="print" and the site unstyled.
document.getElementById('webfonts')?.setAttribute('media', 'all')
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><MachinesProvider><App/></MachinesProvider></AuthProvider></BrowserRouter>)
