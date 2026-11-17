import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminPhotoManager, type AdminPhoto } from "@/components/admin/ui/AdminPhotoManager";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import "@/styles/globals.css";

declare global { interface Window { releaseShopUploads: (count?: number) => void; } }
const pending: Array<() => void> = [];
window.releaseShopUploads = (count = pending.length) => { for (let i = 0; i < count; i++) pending.shift()?.(); };
const picture = (id: string) => ({ id, url: `/images/shop/rosecityshirt1.webp#${id}`, description: `${id} metadata`, name: id });
function Fixture() {
  const [photos, setPhotos] = useState<AdminPhoto[]>([picture("First"), picture("Second"), picture("Third")]);
  const [events, setEvents] = useState<boolean[]>([]);
  const [undo, setUndo] = useState<boolean[]>([]);
  const [mounted, setMounted] = useState(true);
  const [callbacks, setCallbacks] = useState(0);
  const [uploads, setUploads] = useState(0);
  return <div className="admin-portal" style={{ maxWidth: 620, padding: 20 }}><AdminToastProvider>
    <h1>Shop manager options</h1>
    <button onClick={() => setCallbacks((count) => count + 1)}>Replace callbacks {callbacks}</button>
    <button onClick={() => setMounted(false)}>Unmount manager</button>
    <output data-events="">{JSON.stringify(events)}</output><output data-undo="">{JSON.stringify(undo)}</output><output data-uploads="">{uploads}</output><output data-photos="">{JSON.stringify(photos)}</output>
    {mounted && <AdminPhotoManager label="Shop photos" collectionId="shop" variant="tiles" photos={photos} onChange={setPhotos}
      allowedTypes={["image/png", "image/jpeg", "image/webp"]} maxBytes={15 * 1024 * 1024}
      showDescriptions={false} reorderLabels="earlier-later" removalMessage="Photo removed"
      onPendingChange={(value) => setEvents((previous) => [...previous, value])}
      onUndoPendingChange={(value) => setUndo((previous) => [...previous, value])}
      onUpload={async (files) => {
        setUploads((count) => count + 1);
        await new Promise<void>((resolve) => pending.push(resolve));
        return files.map((file) => ({ id: file.name, url: URL.createObjectURL(file), description: "Stored upload metadata", name: file.name }));
      }} />}
  </AdminToastProvider></div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
