import { CONTACT_ACTIONS, contactHref, type CinematicContactContent } from "@/lib/cinematic-contact-content";
import { isHiddenPageHref, type PublicPageVisibility } from "@/lib/public-page-visibility";
import "./contact.css";

/**
 * `pageVisibility` is the club's "Visible to visitors" map, passed by the public page only. A row whose one button leads to a page the
 * owner has hidden is dropped, so Contact never links to a 404. Editor previews pass none and always draw every row.
 */
export default function CinematicContact({ content, pageVisibility }: { content: CinematicContactContent; pageVisibility?: PublicPageVisibility | null }) {
  const club = { publicPageVisibility: pageVisibility };
  return <div className="contact-page">
    <header className="contact-heading"><div><h1>{content.title}</h1><p>{content.subtitle}</p></div></header>
    <div className="contact-actions" aria-label="Contact the club">
      {CONTACT_ACTIONS.map(id => {
        const row = content.rows[id], href = contactHref(content, id);
        if (isHiddenPageHref(href, club)) return null;
        return <div className="contact-row" key={id}>
          <span>{row.prompt}</span>
          {href ? <a href={href}>{row.action}</a> : <span className="contact-pending" aria-label="Information destination pending">{row.action}<small>Link pending</small></span>}
        </div>;
      })}
    </div>
  </div>;
}
