/** Lets any page reopen the consent dialog.
 *
 *  GDPR Art. 7(3): withdrawing consent must be as easy as giving it. Without an
 *  entry point the banner never returns and the only way out is clearing cookies,
 *  which does not qualify. The footer link calls openConsentSettings().
 */
export const consentUi = $state({ requestedAt: 0 });

export function openConsentSettings(): void {
  consentUi.requestedAt = Date.now();
}
