import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Open the renderer with ?gallery to browse faces and moods.
const Gallery = lazy(() => import('./dev/Gallery.tsx'))
const showGallery = new URLSearchParams(window.location.search).has('gallery')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showGallery ? (
      <Suspense>
        <Gallery />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
