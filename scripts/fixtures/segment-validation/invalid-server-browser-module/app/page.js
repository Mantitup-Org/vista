import { createRoot } from 'react-dom/client'

export default function InvalidServerBrowserModulePage() {
  return <p>{String(Boolean(createRoot))}</p>
}
