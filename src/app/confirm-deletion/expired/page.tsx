import Link from "next/link";

export default function ConfirmDeletionExpiredPage() {
  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-ink-300">
          That deletion confirmation link has expired or has already been used.
          If you still want to delete your account, ask any tenant you're
          registered with to send a fresh request.
        </p>
        <Link href="/" className="text-turf-300 hover:text-turf-200 underline">
          Back to KickNScream
        </Link>
      </div>
    </main>
  );
}
