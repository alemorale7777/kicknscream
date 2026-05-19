import Link from "next/link";

export default function ConfirmDeletionDonePage() {
  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Account deleted</h1>
        <p className="text-ink-300">
          Your KickNScream account is gone. Your name, email, phone, kids'
          names + photos, and any coach notes have been anonymized. A receipt
          has been sent to your original email address.
        </p>
        <Link href="/" className="text-turf-300 hover:text-turf-200 underline">
          Back to KickNScream
        </Link>
      </div>
    </main>
  );
}
