import { Shimmer } from "../Shimmer";
import frame from "./PageFrame.module.css";
import cards from "./SectionCards.module.css";
import previewCards from "./PreviewCards.module.css";
import dialog from "./EditorDialog.module.css";
import skeleton from "./skeletons.module.css";

/*
 * Shape-matched skeletons. Each one reuses the real component's layout classes,
 * so the loaded page occupies exactly the space the skeleton did. Where the real
 * content sets its own height (cards, header, Save, rows), the skeleton blocks sit
 * inside the same fixed-height boxes. Wrap them in ShimmerRegion for the delayed
 * fade-in; they are aria-hidden and the region announces "Loading".
 */

export function SectionCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className={cards.list} aria-hidden="true" data-section-cards-skeleton="">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={cards.card}>
          <div className={cards.text}>
            <Shimmer className={skeleton.cardTitle} style={{ inlineSize: `${34 + ((index * 11) % 22)}%` }} />
            <Shimmer className={skeleton.cardSummary} style={{ inlineSize: `${58 + ((index * 7) % 30)}%` }} />
          </div>
          <div className={cards.controls}>
            <Shimmer className={skeleton.switch} />
            <Shimmer className={skeleton.edit} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PageFrameSkeleton({ cardCount = 6, description = false }: { cardCount?: number; description?: boolean }) {
  return (
    <div className={frame.frame} aria-hidden="true" data-page-frame-skeleton="">
      <div className={frame.header}>
        <div className={frame.heading}>
          <Shimmer className={skeleton.crumb} />
          <Shimmer className={skeleton.title} />
          {description && <Shimmer className={skeleton.description} />}
        </div>
        <Shimmer className={skeleton.open} />
        <div className={frame.saveGroup}>
          <Shimmer className={skeleton.save} />
        </div>
      </div>
      <div className={frame.content}>
        <SectionCardsSkeleton count={cardCount} />
      </div>
    </div>
  );
}

/** The inside of EditorDialog while its sections load: the section list and a panel of fields, in the dialog's own grid. */
export function EditorDialogSkeletonBody({ sectionCount = 6 }: { sectionCount?: number }) {
  return (
    <>
      <div className={dialog.sections} aria-hidden="true" data-editor-dialog-skeleton="">
        <ul>
          {Array.from({ length: sectionCount }, (_, index) => (
            <li key={index}>
              <span className={dialog.sectionButton}>
                <Shimmer className={skeleton.sectionRow} style={{ inlineSize: `${48 + ((index * 13) % 40)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className={dialog.panel} aria-hidden="true">
        <Shimmer className={skeleton.panelTitle} />
        {[0, 1, 2].map((row) => (
          <div key={row} className={skeleton.field}>
            <Shimmer className={skeleton.fieldLabel} />
            <Shimmer className={skeleton.fieldInput} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Skeleton for PreviewCards: the same grid, fixed preview boxes and 64px footers. */
export function PreviewCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className={previewCards.grid} aria-hidden="true" data-preview-cards-skeleton="">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={previewCards.card}>
          <div className={previewCards.previewWrap}>
            <Shimmer className={`${previewCards.box} ${skeleton.previewBox}`} />
          </div>
          <div className={previewCards.foot}>
            <Shimmer className={skeleton.previewTitle} style={{ inlineSize: `${30 + ((index * 9) % 24)}%` }} />
            <div className={previewCards.controls}>
              <Shimmer className={skeleton.switch} />
              <Shimmer className={skeleton.previewEdit} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
