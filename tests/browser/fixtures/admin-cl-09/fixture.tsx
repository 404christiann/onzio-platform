import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { AdminPhotoManager, type AdminPhoto } from "@/components/admin/ui/AdminPhotoManager";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import "@/styles/globals.css";
import "./fixture.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const failUpload = params.get("failUpload") === "1";
const preview = document.createElement("canvas").toDataURL("image/png");
const initial: AdminPhoto[] = [
  { id: "first", url: preview, description: "Blue kit on a field", name: "First" },
  { id: "second", url: preview, description: "", name: "Second" },
];
let id = 0;
const pause = () => new Promise((resolve) => setTimeout(resolve, 650));
const rules = { allowedTypes: ["image/png", "image/jpeg"] as const, maxBytes: 1024 * 1024 };

function Fixture() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [rows, setRows] = useState(initial);
  const [activeKit, setActiveKit] = useState<"a" | "b">("a");
  const [tilesByKit, setTilesByKit] = useState<Record<"a" | "b", AdminPhoto[]>>({
    a: initial.map((photo) => ({ ...photo, id: `tile-${photo.id}` })),
    b: [{ id: "kit-b", url: preview, description: "Kit B on a field", name: "Kit B" }],
  });
  const tiles = tilesByKit[activeKit];
  const [dirty, setDirty] = useState(0);
  const ownedUrls = useRef(new Set<string>());
  const mounted = useRef(false);
  const createUrl = (file: File) => {
    const url = URL.createObjectURL(file);
    ownedUrls.current.add(url);
    return url;
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const retained = new Set([avatar, ...rows.map((photo) => photo.url), ...Object.values(tilesByKit).flatMap((kit) => kit.map((photo) => photo.url))]);
    for (const url of ownedUrls.current) {
      if (!retained.has(url)) {
        URL.revokeObjectURL(url);
        ownedUrls.current.delete(url);
      }
    }
  }, [avatar, rows, tilesByKit]);
  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  const dirtyOnce = () => setDirty((value) => value + 1);
  const abandon = (photos: AdminPhoto[]) => {
    for (const photo of photos) {
      if (ownedUrls.current.delete(photo.url)) URL.revokeObjectURL(photo.url);
    }
  };
  const upload = async (files: File[]) => {
    await pause();
    if (failUpload) throw new Error("Fixture upload failure");
    if (!mounted.current) return [];
    return files.map((file) => ({ id: `added-${++id}`, url: createUrl(file), description: "", name: file.name }));
  };
  return (
    <AdminToastProvider>
      <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
        <h1>Classic admin media primitives</h1>
        <output data-dirty-count="">Dirty changes: {dirty}</output>
        <section className="panel"><h2>Club crest</h2>
          <AdminImageField {...rules} label="Club crest" previewUrl={avatar} initials="RC" size={72} onDirty={dirtyOnce}
            onUpload={async (files) => { await pause(); if (!mounted.current) return false; setAvatar(createUrl(files[0])); return true; }}
            onRemove={() => setAvatar(null)} />
        </section>
        <section className="panel"><h2>Homepage slideshow</h2>
          <AdminPhotoManager {...rules} collectionId="homepage" label="Homepage slideshow" variant="rows" photos={rows} onChange={setRows} onUpload={upload} onAbandonedUpload={abandon} onDirty={dirtyOnce} />
        </section>
        <section className="panel"><h2>Shop kit photos</h2>
          <button type="button" onClick={() => setActiveKit((kit) => kit === "a" ? "b" : "a")}>Switch kit</button>
          <button type="button" onClick={() => setTilesByKit((kits) => ({ ...kits, [activeKit]: [...kits[activeKit]] }))}>Refresh kit</button>
          <output data-active-kit="">Kit {activeKit.toUpperCase()}</output>
          <AdminPhotoManager {...rules} collectionId={activeKit} label="Shop kit photos" variant="tiles" photos={tiles}
            onChange={(next) => setTilesByKit((kits) => ({ ...kits, [activeKit]: next }))}
            onUpload={upload} onAbandonedUpload={abandon} onDirty={dirtyOnce} />
        </section>
      </main>
    </AdminToastProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
(window as Window & { unmountAdminMediaFixture?: () => void }).unmountAdminMediaFixture = () => root.unmount();
root.render(<StrictMode><Fixture /></StrictMode>);

