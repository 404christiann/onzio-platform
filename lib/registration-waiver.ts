export const REGISTRATION_WAIVER_TEMPLATE = `LIABILITY WAIVER AND CONSENT

By submitting this registration, I acknowledge and agree to the following on behalf of the registrant named above:

1. Assumption of Risk. Participation in soccer training, tryouts, and related club activities carries an inherent risk of injury, including but not limited to sprains, fractures, concussions, and other physical harm. I voluntarily assume all such risks on behalf of the registrant.

2. Release of Liability. To the fullest extent permitted by law, I release [Club Name], its coaches, staff, volunteers, and affiliated organizations from any and all claims, liabilities, or damages arising from the registrant's participation, except in cases of gross negligence or willful misconduct.

3. Medical Authorization. I authorize club staff to seek and consent to emergency medical treatment for the registrant if I cannot be immediately reached, and I agree to be financially responsible for any costs not covered by insurance.

4. Photo/Media Release. I grant [Club Name] permission to photograph or video the registrant during club activities and to use those images for the club's promotional materials, website, and social media, unless I have separately notified the club in writing that I do not consent.

5. Code of Conduct. I agree that the registrant (and I, as a parent/guardian, where applicable) will follow the club's rules of conduct and respect coaches, staff, officials, and fellow participants.

I have read and understood this waiver and agree to its terms.`;

export const REGISTRATION_WAIVER_LEGAL_HINT =
  "This is a general starting template, not legal advice. Have it reviewed by your own attorney before publishing a live paid registration form.";

export function buildDefaultRegistrationWaiverText(clubName: string): string {
  const normalizedClubName = clubName.trim();
  return normalizedClubName
    ? REGISTRATION_WAIVER_TEMPLATE.replaceAll("[Club Name]", normalizedClubName)
    : REGISTRATION_WAIVER_TEMPLATE;
}
