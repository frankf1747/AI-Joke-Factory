import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureWatchIdentity, watchRequested } from './services/watchMode';

// Must run before the first render: context and apiClient read the watch identity on mount.
const search = window.location.search;
const watching = captureWatchIdentity(search);
// A watch link that could not be captured must not fall through to the shared
// session: that tab would silently be the instructor, with write access, while
// the person looking at it believes it is a read-only view of a bot.
const watchFailed = watchRequested(search) && !watching;

const WatchUnavailable: React.FC = () => (
  <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
    <div role="alert" className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-sm">
      <h1 className="mb-2 text-lg font-semibold text-gray-900">Watch mode unavailable</h1>
      <p>
        This link could not open a read-only view of a bot: either the link is malformed, or this
        browser blocks per-tab storage. Close this tab and use a 👁 button in the Bot Panel again.
      </p>
    </div>
  </main>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {watchFailed ? <WatchUnavailable /> : <App />}
  </React.StrictMode>
);
