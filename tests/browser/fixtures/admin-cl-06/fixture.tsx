import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminToastProvider, useAdminToast } from "@/components/admin/ui/AdminToast";
import { useAnimatedList } from "@/components/admin/ui/useAnimatedList";
import "@/styles/globals.css";
import "./fixture.css";

type Player = {
  id: string;
  name: string;
  detail: string;
  order: number;
};

const initial: Player[] = [
  { id: "maya", name: "Maya Torres", detail: "Forward · #9", order: 1 },
  { id: "jordan", name: "Jordan Lee", detail: "Midfield · #14", order: 2 },
  { id: "sam", name: "Sam Okafor", detail: "Defender · #4", order: 3 },
  { id: "ava", name: "Ava Chen", detail: "Goalkeeper · #1", order: 4 },
];

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

function PlayerList({ onExpire }: { onExpire: () => void }) {
  const [players, setPlayers] = useState(initial);
  const [added, setAdded] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [preserveSearch, setPreserveSearch] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const { listRef, rowProps, change } = useAnimatedList();
  const { showUndo } = useAdminToast();

  function remove(player: Player) {
    if (!change({ type: "remove", key: player.id }, () => {
      setPlayers((current) => current.filter((item) => item.id !== player.id));
      if (preserveSearch) search.current?.focus();
    })) return;
    showUndo({
      message: `Removed ${player.name}`,
      onUndo: () => change({ type: "add", key: player.id }, () => {
        setPlayers((current) => [...current, player].sort((a, b) => a.order - b.order));
      }),
      onExpire,
    });
  }

  function add() {
    const next = added + 1;
    const player = {
      id: `new-${next}`,
      name: `Riley Brooks ${next}`,
      detail: "Forward · #11",
      order: 0,
    };
    setAdded(next);
    change({ type: "add", key: player.id }, () => setPlayers((current) => [player, ...current]));
  }

  function addLong() {
    const next = added + 1;
    const player = {
      id: `long-${next}`,
      name: "W".repeat(120),
      detail: "Forward · #11",
      order: 0,
    };
    setAdded(next);
    change({ type: "add", key: player.id }, () => setPlayers((current) => [player, ...current]));
  }

  function reorder() {
    change({ type: "reorder" }, () => setPlayers((current) => [...current].reverse()));
  }

  return (
    <>
      <div className="toolbar">
        <input ref={search} aria-label="List search" />
        <label><input type="checkbox" checked={preserveSearch} onChange={event => setPreserveSearch(event.target.checked)} />Preserve search focus</label>
        <button type="button" onClick={add}>Add player</button>
        <button type="button" onClick={addLong}>Add long name</button>
        <button type="button" onClick={reorder}>Reverse order</button>
        <button type="button" onClick={() => setListVersion((version) => version + 1)}>Replace list element</button>
      </div>
      <form aria-label="Player editor">
        <div key={listVersion} ref={listRef} className="player-list" style={{ position: "static" }} aria-label="Players" data-admin-animated-list="">
          {players.map((player) => (
            <div
              key={player.id}
              {...rowProps(player.id)}
              className="player-row"
              data-player={player.id}
            >
              <input type="hidden" name="description" value={player.id} />
              <span className="avatar">{player.name.split(" ").map((part) => part[0]).join("")}</span>
              <span className="row-copy"><strong>{player.name}</strong><small>{player.detail}</small></span>
              <button type="button" onClick={() => remove(player)} aria-label={`Remove ${player.name}`}>Remove</button>
            </div>
          ))}
        </div>
      </form>
      <output aria-label="Player count">{players.length}</output>
    </>
  );
}

function ListFixture() {
  const [mounted, setMounted] = useState(true);
  const [expired, setExpired] = useState(0);
  return (
    <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
      <h1>Classic admin animated list</h1>
      <p>Remove a player, then Undo below the list.</p>
      <button type="button" onClick={() => setMounted(false)}>Unmount toast provider</button>
      <button type="button" onClick={() => setMounted(true)}>Remount toast provider</button>
      {mounted && <AdminToastProvider><PlayerList onExpire={() => setExpired((count) => count + 1)} /></AdminToastProvider>}
      <output aria-label="Expired toast count">{expired}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ListFixture />
  </StrictMode>,
);

