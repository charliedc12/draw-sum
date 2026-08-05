import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.tsx'
import Today from './routes/Today.tsx'
import Path from './routes/Path.tsx'
import Log from './routes/Log.tsx'
import Session from './routes/Session.tsx'
import Gate from './routes/Gate.tsx'
import Progress from './routes/Progress.tsx'
import Settings from './routes/Settings.tsx'

/* HashRouter, not BrowserRouter: deep links and a reloaded home-screen PWA
   resolve without any server rewrite rules. */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Today />} />
          <Route path="path" element={<Path />} />
          <Route path="log" element={<Log />} />
          <Route path="session" element={<Session />} />
          <Route path="gate" element={<Gate />} />
          <Route path="progress" element={<Progress />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
