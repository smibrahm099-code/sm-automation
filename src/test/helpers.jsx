import {render} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {AuthProvider} from '../auth.jsx'
import {MachinesProvider} from '../machines.jsx'
import App from '../App.jsx'

// the whole site, at whatever address the test asks for
export const renderApp = (route = '/') => render(
  <MemoryRouter initialEntries={[route]}>
    <AuthProvider><MachinesProvider><App/></MachinesProvider></AuthProvider>
  </MemoryRouter>
)

// one machine shaped the way the database stores it
export const machineDoc = (id, over = {}) => ({id, data:{
  n:'Machine ' + id, c:'Cat ' + id, d:'Description for ' + id,
  specs:[{k:'Model', v:id.toUpperCase()}], a:['Use A'],
  images:['/images/' + id + '.jpg'], video:'', poster:'', order:1, ...over}})
