import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPhotoManager, type AdminPhotoManagerProps } from "@/components/admin/ui/AdminPhotoManager";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";

const props: AdminPhotoManagerProps = { label: "Photos", collectionId: "one", variant: "tiles",
  photos: [{ id: "one", url: "/one.png", description: "Original metadata", name: "First" }],
  allowedTypes: ["image/png"], maxBytes: 15 * 1024 * 1024, onChange() {}, async onUpload() { return []; },
};
function markup(options: Partial<AdminPhotoManagerProps>) {
  return renderToStaticMarkup(createElement(AdminToastProvider, null, createElement(AdminPhotoManager, { ...props, ...options })));
}
describe("optional Shop photo-manager presentation", () => {
  it("keeps default output identical to explicit legacy options", () => {
    expect(markup({})).toBe(markup({ showDescriptions: true, reorderLabels: "up-down" }));
    expect(markup({})).toContain("Original metadata");
    expect(markup({})).toContain("Move First up");
    expect(markup({})).toContain("Move First down");
  });
  it("hides Shop-only description controls without changing supplied photo metadata", () => {
    const before = structuredClone(props.photos);
    const output = markup({ showDescriptions: false, reorderLabels: "earlier-later", removalMessage: "Photo removed" });
    expect(output).not.toContain("Describe this photo");
    expect(output).toContain("Move First earlier");
    expect(output).toContain("Move First later");
    expect(props.photos).toEqual(before);
  });
});
