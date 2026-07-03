import { lazy, Suspense } from 'react'

const AbletonDeviceMapper = lazy(() => import('./AbletonDeviceMapper.jsx'))

export default function App() {
  return <Suspense fallback={<div className="route-loading">Loading Ableton Device Mapper…</div>}>
    <AbletonDeviceMapper />
  </Suspense>
}
