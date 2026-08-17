import { useEffect, useState } from 'react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { PublicReplayPage } from './components/PublicReplayPage'
import { readAppRoute } from './publicReplay'

function Root() {
  const [route, setRoute] = useState(readAppRoute)

  useEffect(() => {
    const sync = () => setRoute(readAppRoute())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  return route.kind === 'public-replay'
    ? <PublicReplayPage id={route.id} />
    : <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
