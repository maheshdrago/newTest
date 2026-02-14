import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950 text-white">
      <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold">B</div>
          <span className="text-xl font-bold">BuildCraft AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-surface-300 hover:text-white transition-colors">Sign In</Link>
          <Link href="/register" className="px-4 py-2 rounded-lg gradient-brand text-sm font-medium hover:opacity-90 transition-opacity">Get Started</Link>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-8 pt-24 pb-32">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-soft" />
            Now with GPT-4 and Claude support
          </div>
          <h1 className="text-6xl sm:text-7xl font-bold leading-tight mb-6">
            Build apps with <span className="gradient-text">AI superpowers</span>
          </h1>
          <p className="text-xl text-surface-400 max-w-2xl mx-auto mb-12">
            Describe your application in plain English. Our AI generates production-ready code in seconds. Full-stack React, Next.js, Vue, and more.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register" className="px-8 py-3.5 rounded-xl gradient-brand text-lg font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-brand-500/25">Start Building Free</Link>
            <Link href="#features" className="px-8 py-3.5 rounded-xl border border-surface-700 text-lg font-medium hover:bg-surface-800 transition-colors">See How It Works</Link>
          </div>
        </div>
        <div id="features" className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'AI Code Generation', description: 'Describe your app and get production-ready code instantly. Supports React, Next.js, Vue, Svelte.' },
            { title: 'Real-time Collaboration', description: 'Work together in real-time. See cursors, edits, and chat with collaborators.' },
            { title: 'One-Click Deploy', description: 'Deploy with a single click. Get a live URL instantly with SSL and CDN.' },
            { title: 'Live Preview', description: 'See changes in real-time with hot-reload. Test on desktop, tablet, and mobile.' },
            { title: 'Enterprise Security', description: 'SOC2 compliant with JWT auth, RBAC, encryption at rest, and audit logging.' },
            { title: 'Version Control', description: 'Built-in version control with git integration. Branch, merge, and rollback.' },
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded-xl bg-surface-800/50 border border-surface-700/50 hover:border-brand-500/30 transition-colors">
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-surface-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-surface-800 px-8 py-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between text-sm text-surface-500">
          <p>BuildCraft AI - Enterprise AI Application Builder</p>
          <p>Built with enterprise-grade architecture</p>
        </div>
      </footer>
    </div>
  );
}
