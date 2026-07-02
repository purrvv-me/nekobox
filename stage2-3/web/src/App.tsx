import { useEffect, useState } from "react";
import { UnlockGate } from "./components/UnlockGate";
import { Explorer } from "./components/Explorer";
import { SharePage } from "./components/SharePage";
import { parseShareHash, type Session } from "./lib/vault";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [share, setShare] = useState(() => parseShareHash(location.hash));

  // React to hash changes so a /#/s/… link routes to the recipient view.
  useEffect(() => {
    const onHash = () => setShare(parseShareHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A share link is anonymous — never requires (or exposes) the local vault.
  if (share) return <SharePage id={share.id} fragment={share.fragment} />;

  return session ? (
    <Explorer session={session} onLock={() => setSession(null)} />
  ) : (
    <UnlockGate onSession={setSession} />
  );
}
