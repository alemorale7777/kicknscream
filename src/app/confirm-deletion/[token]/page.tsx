import { confirmParentDeletionAction } from "@/actions/parent-deletion";

/**
 * Token landing page — renders a single "Yes, delete my account" button.
 * The token isn't validated until the form is submitted; we don't want to
 * burn the token on a preview-loading mail-client GET.
 */
export default async function ConfirmDeletionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  async function confirm() {
    "use server";
    await confirmParentDeletionAction(token);
  }

  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Confirm deletion</h1>
        <p className="text-ink-300">
          This will anonymize your KickNScream account across every tenant you
          have access to. It cannot be undone.
        </p>
        <form action={confirm}>
          <button
            type="submit"
            className="bg-danger text-pitch-950 px-6 py-3 rounded-md font-semibold hover:bg-danger/90"
          >
            Yes, delete my account
          </button>
        </form>
      </div>
    </main>
  );
}
