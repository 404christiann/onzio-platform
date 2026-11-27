"use client";
import ResilientImage from "@/components/ResilientImage";
import FileUpload from "@/components/admin/FileUpload";
import { AdminDialogSection } from "@/components/admin/ui/AdminDialog";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { AdminPanel } from "@/components/admin/AdminPage";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SlidingPanel } from "@/components/ui/sliding-panel";
import { X as AdminRemoveIcon, ChevronUp as AdminOrderUp, ChevronDown as AdminOrderDown, IconCaretDown as AdminSelectChevron } from "@/components/admin/icons";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { PROGRAM_MEDIA_LIMITS, PROGRAM_REGISTRATION_LIMITS } from "@/lib/program-content";
import { MEDIA_RULES, mediaAccept, mediaTypesLabel } from "@/lib/media-rules";
import type { ProgramDraft, ProgramValidationErrors } from "@/lib/program-admin";
import { PROGRAM_EDITOR_TABS, type ProgramEditorTab } from "./program-editor-types";
import type { ProgramsEditor } from "./useProgramsEditor";
import { FormField as LegacyFormField, ClassicFormField, fieldError } from "./ProgramFormField";
import { LINK_DESTINATION_HINT } from "@/lib/link-destination";

export function ProgramFields({ editor, classic = false, section, disabled = false }: { editor: ProgramsEditor; classic?: boolean; section?: ProgramEditorTab; disabled?: boolean }) {
  const FormField = classic ? ClassicFormField : LegacyFormField;
  const { hidesSlugField } = editor.policy;
  const { draft, errors, activeTab: editorTab, tabDirection, selectTab, saving, updateDraft, derivedSlugForNewProgram, addHighlight, setHighlight, reorderHighlight, removeHighlight } = editor.program;
  const { gallery, galleryInput, uploadingRole, uploadingGallery, uploadMedia, uploadGalleryImage, setGalleryAlt, reorderGallery, removeGalleryImage } = editor.media;
  const { registrationForms } = editor;
  const activeTab = section ?? editorTab;
  const mediaBusy = disabled || editor.state.pickerPending || uploadingRole !== null || uploadingGallery;
  if (!draft) return null;
  const content = <>
              {activeTab === "content" && (
              <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {hidesSlugField ? (
                  <div>
                    <span className={ADMIN_LABEL_CLASS}>Page address</span>
                    <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-body text-sm text-muted-foreground">
                      /programs/
                      <span className="text-foreground">
                        {draft.id
                          ? draft.slug
                          : derivedSlugForNewProgram(draft)}
                      </span>
                    </p>
                    <p className="mt-1.5 font-body text-xs leading-5 text-muted-foreground">
                      {draft.id
                        ? "Set when this program was created and fixed from then on, so existing links keep working. Renaming the navigation label does not change it."
                        : "Created from the navigation label below when you save. It cannot be changed afterwards."}
                    </p>
                    {fieldError(errors, "slug")}
                  </div>
                ) : (
                  <FormField label="Slug" error={fieldError(errors, "slug")}>
                    <input
                      className={ADMIN_INPUT_CLASS}
                      value={draft.slug}
                      onChange={(event) => updateDraft("slug", event.target.value)}
                      placeholder="youth-academy"
                      maxLength={64}
                    />
                  </FormField>
                )}
                <FormField label="Navigation label" error={fieldError(errors, "navLabel")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.navLabel}
                    onChange={(event) => updateDraft("navLabel", event.target.value)}
                    maxLength={40}
                  />
                </FormField>
                <FormField label="Display title" error={fieldError(errors, "displayTitle")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.displayTitle}
                    onChange={(event) => updateDraft("displayTitle", event.target.value)}
                    maxLength={120}
                  />
                </FormField>
                <FormField label="Kicker" error={fieldError(errors, "kicker")}>
                  <input
                    className={ADMIN_INPUT_CLASS}
                    value={draft.kicker}
                    onChange={(event) => updateDraft("kicker", event.target.value)}
                    maxLength={80}
                  />
                </FormField>
              </div>

              <div className="mt-5 grid gap-5">
                <FormField label="Summary" error={fieldError(errors, "summary")}>
                  <Textarea
                    className="min-h-24"
                    value={draft.summary}
                    onChange={(event) => updateDraft("summary", event.target.value)}
                    maxLength={320}
                    aria-invalid={Boolean(fieldError(errors, "summary"))}
                  />
                </FormField>
                <FormField label="Body" error={fieldError(errors, "body")}>
                  <Textarea
                    className="min-h-40"
                    value={draft.body}
                    onChange={(event) => updateDraft("body", event.target.value)}
                    maxLength={6000}
                    aria-invalid={Boolean(fieldError(errors, "body"))}
                  />
                </FormField>
              </div>

              <div className="mt-7 border-t border-border pt-7">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-body text-sm font-semibold normal-case tracking-normal text-foreground">
                      Highlights
                    </h3>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      Ordered short points used by the public program layout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addHighlight}
                    disabled={draft.highlights.length >= 200}
                    className="min-h-11 rounded-lg border border-border px-3 py-2 font-body text-sm font-semibold normal-case tracking-normal text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                  >
                    Add highlight
                  </button>
                </div>
                {fieldError(errors, "highlights")}
                {draft.highlights.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
                    No highlights added.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.highlights.map((highlight, index) => (
                      <div key={`${index}-${draft.highlights.length}`} className="flex items-start gap-2">
                        <input
                          className={ADMIN_INPUT_CLASS}
                          value={highlight}
                          onChange={(event) => setHighlight(index, event.target.value)}
                          maxLength={320}
                          aria-label={`Highlight ${index + 1}`}
                        />
                        <button type="button" onClick={() => reorderHighlight(index, -1)} disabled={index === 0} className="min-h-11 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground disabled:opacity-20" aria-label={`Move highlight ${index + 1} up`}><AdminOrderUp size={14} className="inline-block align-middle" /></button>
                        <button type="button" onClick={() => reorderHighlight(index, 1)} disabled={index === draft.highlights.length - 1} className="min-h-11 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground disabled:opacity-20" aria-label={`Move highlight ${index + 1} down`}><AdminOrderDown size={14} className="inline-block align-middle" /></button>
                        <button type="button" onClick={() => removeHighlight(index)} className="min-h-11 rounded-lg border border-destructive/15 px-3 py-2.5 text-sm text-destructive/70" aria-label={`Remove highlight ${index + 1}`}><AdminRemoveIcon size={14} className="inline-block align-middle" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-7 grid gap-5 border-t border-border pt-7 sm:grid-cols-2">
                <FormField label="Layout variant">
                  <NativeSelect chevronIcon={AdminSelectChevron} value={draft.layoutVariant} onChange={(event) => updateDraft("layoutVariant", event.target.value as ProgramDraft["layoutVariant"])}>
                    <NativeSelectOption value="statement_band">Statement band</NativeSelectOption>
                    <NativeSelectOption value="detail_focus">Detail focus</NativeSelectOption>
                  </NativeSelect>
                </FormField>
                <div className="rounded-lg border border-border p-3"><span className={ADMIN_LABEL_CLASS}>Visibility</span><p className="mt-2 font-body text-sm text-muted-foreground">{draft.status === "active" ? "Active — visible publicly" : "Hidden — admin only"}. {classic ? "Change visibility in the Visibility section." : "Change visibility in Manage programs."}</p></div>
              </div>
              </>
              )}

              {activeTab === "media" && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  {!classic && <span className={ADMIN_LABEL_CLASS}>Hero image</span>}
                  {classic ? <AdminImageField
                    label="Hero image"
                    size={96}
                    shape="square"
                    {...adminImageRules("photo")}
                    previewUrl={draft.heroMediaPreviewUrl || null}
                    uploading={uploadingRole === "hero"}
                    disabled={mediaBusy}
                    onPendingChange={pending => editor.media.setPickerPending("hero", pending)}
                    onUpload={files => uploadMedia("hero", files)}
                    onRemove={draft.heroMediaAssetId ? () => {
                      updateDraft("heroMediaAssetId", null);
                      updateDraft("heroMediaPreviewUrl", "");
                    } : undefined}
                  /> : (
                  <FileUpload
                    label="Upload hero image"
                    accept={mediaAccept("photo")}
                    onUpload={(files) => void uploadMedia("hero", files)}
                    uploading={uploadingRole === "hero"}
                    previewUrl={draft.heroMediaPreviewUrl || null}
                    onRemove={draft.heroMediaAssetId ? () => {
                      updateDraft("heroMediaAssetId", null);
                      updateDraft("heroMediaPreviewUrl", "");
                    } : undefined}
                  />
                  )}
                </div>
                <div>
                  {!classic && <span className={ADMIN_LABEL_CLASS}>Detail image</span>}
                  {classic ? <AdminImageField
                    label="Detail image"
                    size={96}
                    shape="square"
                    {...adminImageRules("photo")}
                    previewUrl={draft.detailMediaPreviewUrl || null}
                    uploading={uploadingRole === "detail"}
                    disabled={mediaBusy}
                    onPendingChange={pending => editor.media.setPickerPending("detail", pending)}
                    onUpload={files => uploadMedia("detail", files)}
                    onRemove={draft.detailMediaAssetId ? () => {
                      updateDraft("detailMediaAssetId", null);
                      updateDraft("detailMediaPreviewUrl", "");
                    } : undefined}
                  /> : (
                  <FileUpload
                    label="Upload detail image"
                    accept={mediaAccept("photo")}
                    onUpload={(files) => void uploadMedia("detail", files)}
                    uploading={uploadingRole === "detail"}
                    previewUrl={draft.detailMediaPreviewUrl || null}
                    onRemove={draft.detailMediaAssetId ? () => {
                      updateDraft("detailMediaAssetId", null);
                      updateDraft("detailMediaPreviewUrl", "");
                    } : undefined}
                  />
                  )}
                </div>
              </div>
              )}

              {activeTab === "registration" && (
              <div className="mt-6 space-y-6">
                <AdminPanel as="div">
                  <h3 className="font-body text-sm font-semibold normal-case tracking-normal text-foreground">
                    Registration destination
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    Where the registration band sends visitors. An open Onzio
                    form takes priority when selected. A draft or closed form
                    falls back to the button link below; with neither
                    available, visitors see the &ldquo;coming soon&rdquo; text.
                  </p>

                  <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 flex-none accent-primary"
                      checked={draft.registrationEnabled}
                      onChange={(event) =>
                        updateDraft("registrationEnabled", event.target.checked)
                      }
                    />
                    <span>
                      <span className="block font-body text-xs font-semibold normal-case tracking-normal text-foreground">
                        Show the registration section on this program page
                      </span>
                      <span className="mt-1 block font-body text-xs text-muted-foreground">
                        When on, this program leads with the registration band and
                        its image gallery instead of the standard highlight band.
                      </span>
                    </span>
                  </label>

                  <div className="mt-5">
                    <FormField label="Onzio registration form">
                      <NativeSelect chevronIcon={AdminSelectChevron} value={draft.registrationFormId ?? ""} onChange={(event) => updateDraft("registrationFormId", event.target.value || null)}>
                        <NativeSelectOption value="">No native form — use the button link below</NativeSelectOption>
                        {registrationForms.map((form) => (
                          <NativeSelectOption key={form.id} value={form.id}>{form.title} — {form.status}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <p className="mt-2 font-body text-xs leading-5 text-muted-foreground">
                      Only an open form launches the native registration modal. Draft and closed forms preserve the external-link fallback.
                    </p>
                  </div>

                  {/* These fields remain the fallback whenever no linked Onzio
                      form resolves open. */}
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <FormField label="Button label" error={fieldError(errors, "externalCtaLabel")}>
                      <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaLabel} onChange={(event) => updateDraft("externalCtaLabel", event.target.value)} maxLength={40} placeholder="Register" />
                    </FormField>
                    <FormField label="Button link" error={fieldError(errors, "externalCtaHref")}>
                      <input className={ADMIN_INPUT_CLASS} value={draft.externalCtaHref} onChange={(event) => updateDraft("externalCtaHref", event.target.value)} maxLength={2048} />
                      <p className="mt-1 text-xs text-muted-foreground">{LINK_DESTINATION_HINT}</p>
                    </FormField>
                  </div>
                </AdminPanel>

                <AdminPanel as="div">
                  <h3 className="font-body text-sm font-semibold normal-case tracking-normal text-foreground">
                    Registration band copy
                  </h3>
                  <p className="mt-1 max-w-2xl font-body text-xs leading-5 text-muted-foreground">
                    The wording shown on the registration band itself. Every
                    field below starts filled in with the standard wording —
                    edit it, or clear a field to keep it updating automatically
                    if the standard wording ever changes.
                  </p>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <FormField
                      label="Registration eyebrow"
                      error={fieldError(errors, "registrationEyebrow")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationEyebrow}
                        onChange={(event) =>
                          updateDraft("registrationEyebrow", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.eyebrow}
                      />
                    </FormField>
                    <FormField
                      label="Registration headline"
                      error={fieldError(errors, "registrationHeadline")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationHeadline}
                        onChange={(event) =>
                          updateDraft("registrationHeadline", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.headline}
                      />
                    </FormField>
                  </div>

                  <div className="mt-5 grid gap-5">
                    <FormField
                      label="Registration body — link published"
                      error={fieldError(errors, "registrationBody")}
                    >
                      <Textarea
                        className="min-h-24"
                        value={draft.registrationBody}
                        onChange={(event) =>
                          updateDraft("registrationBody", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.body}
                        aria-invalid={Boolean(fieldError(errors, "registrationBody"))}
                      />
                    </FormField>
                    <FormField
                      label="Registration body — no link yet"
                      error={fieldError(errors, "registrationPendingBody")}
                    >
                      <Textarea
                        className="min-h-24"
                        value={draft.registrationPendingBody}
                        onChange={(event) =>
                          updateDraft("registrationPendingBody", event.target.value)
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.pendingBody}
                        aria-invalid={Boolean(fieldError(errors, "registrationPendingBody"))}
                      />
                    </FormField>
                    <FormField
                      label="Placeholder button text — no link yet"
                      error={fieldError(errors, "registrationPendingLabel")}
                    >
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={draft.registrationPendingLabel}
                        onChange={(event) =>
                          updateDraft(
                            "registrationPendingLabel",
                            event.target.value,
                          )
                        }
                        maxLength={PROGRAM_REGISTRATION_LIMITS.pendingLabel}
                      />
                    </FormField>
                  </div>
                </AdminPanel>

                <AdminPanel as="div">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-body text-sm font-semibold normal-case tracking-normal text-foreground">
                        Registration image gallery
                      </h3>
                      <p className="mt-1 max-w-xl font-body text-xs leading-5 text-muted-foreground">
                        Photos beside the registration section. Two or more
                        cross-fade as a slideshow. Up to{" "}
                        {PROGRAM_MEDIA_LIMITS.items} images; {mediaTypesLabel(MEDIA_RULES.photo.mimeTypes)}.
                      </p>
                    </div>
                    {classic ? <AdminImageField
                      label="Gallery image"
                      size={64}
                      shape="square"
                      {...adminImageRules("photo")}
                      uploading={uploadingGallery}
                      disabled={mediaBusy || gallery.length >= PROGRAM_MEDIA_LIMITS.items}
                      onPendingChange={pending => editor.media.setPickerPending("gallery", pending)}
                      onUpload={uploadGalleryImage}
                    /> : <>
                    <button
                      type="button"
                      onClick={() => galleryInput.current?.click()}
                      disabled={
                        uploadingGallery ||
                        gallery.length >= PROGRAM_MEDIA_LIMITS.items
                      }
                      className="min-h-11 rounded-lg border border-border px-3 py-2 font-body text-sm font-semibold normal-case tracking-normal text-muted-foreground transition hover:bg-accent disabled:opacity-30"
                    >
                      {uploadingGallery ? "Uploading…" : "Add image"}
                    </button>
                    <input
                      ref={galleryInput}
                      type="file"
                      accept={mediaAccept("photo")}
                      className="sr-only"
                      onChange={(event) =>
                        void uploadGalleryImage(event.target.files)
                      }
                    />
                    </>}
                  </div>

                  {gallery.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
                      No gallery images yet. Without them the registration section
                      shows this program&rsquo;s detail or hero photo.
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                      {gallery.map((item, index) => (
                        <li
                          key={item.id ?? `new-${index}`}
                          className="rounded-xl border border-border bg-muted/40 p-3"
                        >
                          <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-muted">
                            {item.url ? (
                              <ResilientImage
                                src={item.url}
                                alt={item.alt || `Gallery image ${index + 1}`}
                                fill
                                sizes="(max-width: 640px) 100vw, 40vw"
                                className="object-cover"
                              />
                            ) : null}
                            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-body text-xs font-semibold normal-case tracking-normal text-white">
                              {index + 1}
                            </span>
                          </div>
                          <input
                            className={`${ADMIN_INPUT_CLASS} mt-3`}
                            value={item.alt}
                            onChange={(event) =>
                              setGalleryAlt(index, event.target.value)
                            }
                            maxLength={PROGRAM_MEDIA_LIMITS.alt}
                            placeholder="Describe this photo"
                            aria-label={`Gallery image ${index + 1} description`}
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => reorderGallery(index, -1)}
                              disabled={index === 0}
                              className="min-h-11 flex-1 rounded-md border border-border py-1.5 font-body text-sm normal-case text-muted-foreground transition hover:bg-accent disabled:opacity-20"
                              aria-label={`Move gallery image ${index + 1} up`}
                            >
                              <AdminOrderUp size={14} className="inline-block align-middle" />
                            </button>
                            <button
                              type="button"
                              onClick={() => reorderGallery(index, 1)}
                              disabled={index === gallery.length - 1}
                              className="min-h-11 flex-1 rounded-md border border-border py-1.5 font-body text-sm normal-case text-muted-foreground transition hover:bg-accent disabled:opacity-20"
                              aria-label={`Move gallery image ${index + 1} down`}
                            >
                              <AdminOrderDown size={14} className="inline-block align-middle" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeGalleryImage(index)}
                              className="min-h-11 rounded-md border border-destructive/15 px-3 py-1.5 font-body text-sm normal-case text-destructive/70"
                              aria-label={`Remove gallery image ${index + 1}`}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </AdminPanel>
              </div>
              )}
  </>;
  return classic ? <fieldset className="classic-programs-fields" disabled={disabled}><AdminDialogSection title={activeTab === "content" ? "Program details" : activeTab === "media" ? "Program photos" : "Sign-up details"}>{content}</AdminDialogSection></fieldset> : <>
              <ProgramTabs
                value={activeTab}
                onChange={selectTab}
                disabled={saving || uploadingRole !== null || uploadingGallery}
              />

    <SlidingPanel activeKey={activeTab} direction={tabDirection}>{content}</SlidingPanel>
  </>;
}

function ProgramTabs({
  value,
  onChange,
  disabled,
}: {
  value: ProgramEditorTab;
  onChange: (value: ProgramEditorTab) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 grid gap-1 rounded-lg bg-card p-1 sm:grid-cols-3">
      {PROGRAM_EDITOR_TABS.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            disabled={disabled}
            aria-pressed={selected}
            className={`min-h-11 font-body rounded-md px-3 py-2 text-sm normal-case tracking-normal transition-colors disabled:cursor-not-allowed ${
              selected ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

