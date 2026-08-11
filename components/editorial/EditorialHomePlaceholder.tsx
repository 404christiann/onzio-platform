"use client";

import { useClubContext } from "@/components/ClubContextProvider";

/**
 * Temporary editorial homepage body for the shell phase.
 *
 * Later phases replace this with the real editorial home sections. It uses
 * the mockup hero's dark club-color gradient so the homepage header's
 * transparent state reads correctly at scrollY === 0, plus a light
 * follow-on section so scrolling exercises the white header transition.
 */
export default function EditorialHomePlaceholder() {
  const club = useClubContext();
  const [firstWord, ...rest] = club.name.split(/\s+/);
  return (
    <>
      <section className="editorial-placeholder">
        <div>
          <h1>
            {firstWord}
            {rest.length > 0 && <em>{rest.join(" ")}</em>}
          </h1>
          <p>
            The editorial home experience is on its way. Roster and schedule
            are available above.
          </p>
        </div>
      </section>
      <section className="editorial-placeholder-note">
        <p>{club.name} — official club website.</p>
      </section>
    </>
  );
}
