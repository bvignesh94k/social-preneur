import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-purple-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Social Preneur</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
            Manage all your clients' social media
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Plan, approve, and auto-publish to LinkedIn, Facebook, Instagram, X, Threads & Pinterest
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="px-8 py-3 bg-white text-teal-600 font-semibold rounded-lg border-2 border-teal-600 hover:bg-teal-50 transition"
            >
              Sign Up
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-3xl mb-4">📅</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Plan & Schedule
            </h3>
            <p className="text-gray-600">
              Create content calendars, generate ideas with AI, and schedule posts across all platforms.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-3xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Client Approvals
            </h3>
            <p className="text-gray-600">
              Get client sign-off with passwordless magic links. No logins required.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-3xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Auto-Publish
            </h3>
            <p className="text-gray-600">
              Posts go live automatically to all platforms at the scheduled time.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
