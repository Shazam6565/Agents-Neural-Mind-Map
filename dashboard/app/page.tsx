'use client';

import { useAgentStream } from '@/hooks/useAgentStream';
import MindMap from '@/components/MindMap';

export default function Home() {
  const { events, isConnected } = useAgentStream();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-slate-950 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          AI Agent Mind Map Visualizer
          <span className={`ml-4 px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </p>
      </div>

      <div className="relative flex place-items-center w-full h-[600px] border border-gray-700 rounded-lg overflow-hidden bg-slate-900 mt-8">
        <MindMap events={events} />
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left mt-8">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Events{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            {events.length} events received.
          </p>
        </div>
      </div>
    </main>
  );
}
