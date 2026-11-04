import { CONTACT_ACTIONS, contactHref, type CinematicContactContent } from "@/lib/cinematic-contact-content";
import "./contact.css";

export default function CinematicContact({ content }: { content: CinematicContactContent }) {
  return <div className="contact-page">
    <header className="contact-heading"><div><h1>{content.title}</h1><p>{content.subtitle}</p></div></header>
    <div className="contact-actions" aria-label="Contact the club">
      {CONTACT_ACTIONS.map(id => {
        const row = content.rows[id], href = contactHref(content, id);
        return <div className="contact-row" key={id}>
          <span>{row.prompt}</span>
          {href ? <a href={href}>{row.action}</a> : <span className="contact-pending" aria-label="Information destination pending">{row.action}<small>Link pending</small></span>}
        </div>;
      })}
    </div>
  </div>;
}
