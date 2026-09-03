import { useState, useEffect } from 'react';
import Publisher from './components/Publisher';
import Subscriber from './components/Subscriber';

function App() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
      setMode('subscriber');
    }
  }, []);

  if (mode === 'subscriber') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Subscriber />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">File Transfer</h1>
          <p className="text-slate-400">Send files directly between devices</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div className="flex gap-2 mb-6 bg-slate-900/50 rounded-xl p-1">
            <button
              onClick={() => setMode('publisher')}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'publisher'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Send Files
            </button>
            <button
              onClick={() => setMode('subscriber')}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                mode === 'subscriber'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Receive Files
            </button>
          </div>

          <div className="flex justify-center">
            <div className={mode === 'publisher' ? 'w-full' : 'hidden'}>
              <Publisher />
            </div>
            <div className={mode === 'subscriber' ? 'w-full' : 'hidden'}>
              <Subscriber />
            </div>
            {!mode && (
              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-4 bg-slate-700/50 rounded-2xl flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <p className="text-slate-400">Choose an option above to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
