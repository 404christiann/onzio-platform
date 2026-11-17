"use client";
import { SlidingPanel } from "@/components/ui/sliding-panel";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { PROGRAMS_PAGE_LIMITS } from "@/lib/programs-page-content";
import type { ProgramsPageDraft } from "@/lib/program-admin";
import type { ProgramsEditor } from "./useProgramsEditor";
import { FormField as LegacyFormField, ClassicFormField } from "./ProgramFormField";

export function ProgramsCopyFields({ editor, classic = false, disabled = false }: { editor: ProgramsEditor; classic?: boolean; disabled?: boolean }) {
  const FormField = classic ? ClassicFormField : LegacyFormField;
  const { activePageCopySection, pageCopyDirection, pageCopy, pageCopyErrors, pageCopyDefaults, updatePageCopy } = editor.copy;
  function pageCopyFieldError(field: keyof ProgramsPageDraft) {
    const message = pageCopyErrors[field];
    return message ? (
      <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
        {message}
      </p>
    ) : null;
  }

  const content = <>
              {activePageCopySection === "homepageBand" && (
                <div data-page-copy-section="homepageBand">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Eyebrow" error={pageCopyFieldError("pathwayEyebrow")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.pathwayEyebrow}
                        onChange={(event) => updatePageCopy("pathwayEyebrow", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayEyebrow}
                        placeholder={pageCopyDefaults.pathwayEyebrow}
                      />
                    </FormField>
                    <FormField label="Heading" error={pageCopyFieldError("pathwayHeading")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.pathwayHeading}
                        onChange={(event) => updatePageCopy("pathwayHeading", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayHeading}
                        placeholder={pageCopyDefaults.pathwayHeading}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5">
                    <FormField label="Intro paragraph" error={pageCopyFieldError("pathwayIntro")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.pathwayIntro}
                        onChange={(event) => updatePageCopy("pathwayIntro", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.pathwayIntro}
                        placeholder={pageCopyDefaults.pathwayIntro}
                        aria-invalid={Boolean(pageCopyFieldError("pathwayIntro"))}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {activePageCopySection === "pageHeader" && (
                <div data-page-copy-section="pageHeader">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Eyebrow" error={pageCopyFieldError("heroEyebrow")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroEyebrow}
                        onChange={(event) => updatePageCopy("heroEyebrow", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroEyebrow}
                        placeholder={pageCopyDefaults.heroEyebrow}
                      />
                    </FormField>
                    <div className="hidden sm:block" aria-hidden="true" />
                    <FormField label="Headline line 1" error={pageCopyFieldError("heroHeadlineLineOne")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroHeadlineLineOne}
                        onChange={(event) => updatePageCopy("heroHeadlineLineOne", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroHeadlineLineOne}
                        placeholder={pageCopyDefaults.heroHeadlineLineOne}
                      />
                    </FormField>
                    <FormField label="Headline line 2" error={pageCopyFieldError("heroHeadlineLineTwo")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.heroHeadlineLineTwo}
                        onChange={(event) => updatePageCopy("heroHeadlineLineTwo", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroHeadlineLineTwo}
                        placeholder={pageCopyDefaults.heroHeadlineLineTwo}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5">
                    <FormField label="Intro paragraph" error={pageCopyFieldError("heroIntro")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.heroIntro}
                        onChange={(event) => updatePageCopy("heroIntro", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.heroIntro}
                        placeholder={pageCopyDefaults.heroIntro}
                        aria-invalid={Boolean(pageCopyFieldError("heroIntro"))}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {activePageCopySection === "closingBand" && (
                <div data-page-copy-section="closingBand">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Heading line 1" error={pageCopyFieldError("closingHeadingLineOne")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingHeadingLineOne}
                        onChange={(event) => updatePageCopy("closingHeadingLineOne", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingHeadingLineOne}
                        placeholder={pageCopyDefaults.closingHeadingLineOne}
                      />
                    </FormField>
                    <FormField label="Heading line 2" error={pageCopyFieldError("closingHeadingLineTwo")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingHeadingLineTwo}
                        onChange={(event) => updatePageCopy("closingHeadingLineTwo", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingHeadingLineTwo}
                        placeholder={pageCopyDefaults.closingHeadingLineTwo}
                      />
                    </FormField>
                  </div>
                  <div className="mt-5 grid gap-5">
                    <FormField label="Paragraph" error={pageCopyFieldError("closingBody")}>
                      <Textarea
                        className="min-h-24"
                        value={pageCopy.closingBody}
                        onChange={(event) => updatePageCopy("closingBody", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingBody}
                        placeholder={pageCopyDefaults.closingBody}
                        aria-invalid={Boolean(pageCopyFieldError("closingBody"))}
                      />
                    </FormField>
                    <FormField label="Button label" error={pageCopyFieldError("closingCtaLabel")}>
                      <input
                        className={ADMIN_INPUT_CLASS}
                        value={pageCopy.closingCtaLabel}
                        onChange={(event) => updatePageCopy("closingCtaLabel", event.target.value)}
                        maxLength={PROGRAMS_PAGE_LIMITS.closingCtaLabel}
                        placeholder={pageCopyDefaults.closingCtaLabel}
                      />
                    </FormField>
                  </div>
                </div>
              )}
  </>;
  return classic ? <fieldset className="classic-programs-fields" disabled={disabled}>{content}</fieldset> : <SlidingPanel activeKey={activePageCopySection} direction={pageCopyDirection}>{content}</SlidingPanel>;
}
