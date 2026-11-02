export const metadata = { title: "Privacy & data retention" };
export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-navy-900">
      <h1 className="text-3xl font-semibold">Privacy & data retention</h1>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <section>
          <h2 className="text-lg font-semibold">What we collect</h2>
          <p>Your name, email and password (stored as a salted hash by our authentication library). Preferences you enter, including an approximate home town or map pin — we never need your exact address. The vacancy list you upload. Payment receipts you upload for manual review.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">How it is used</h2>
          <p>To rank and explain your options. Institution names and approximate coordinates are sent to the configured map, climate and facility providers to retrieve evidence. If the AI assistant is enabled, the options you can access and your question are sent to the AI provider. We do not sell data.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Storage</h2>
          <p>Files are kept in private storage and are only downloadable through authenticated requests by you (and, for receipts, by administrators reviewing payments). Location evidence about institutions is shared between users; travel routes from your locations are stored only within your project.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Retention and deletion</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Deleting a project immediately removes its uploaded file, imported rows, routes, scores, assistant chat and final lists.</li>
            <li>Deleting your account (Account → Delete account) removes all your projects, files, receipts, payment records and sessions. Audit log entries keep only internal IDs.</li>
            <li>When premium access expires, your projects and final lists are kept until you delete them.</li>
            <li>Shared institution location, climate and facility evidence is cached according to each provider&apos;s terms and refreshed after expiry.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Important</h2>
          <p>NextPlace does not submit transfer applications, determine eligibility, predict official allocations, or guarantee transfers, school admission or accommodation.</p>
        </section>
      </div>
    </div>
  );
}
