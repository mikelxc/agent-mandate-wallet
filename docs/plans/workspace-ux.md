# Wayleave workspace flow

The primary experience is Job → Authority → Activity → Result. Account setup is
available through Accounts, and existing contract/payment tooling remains under
Developer tools. A user starts with the desired work instead of choosing an
implementation or sponsor tab.

## Design decisions

- One primary action per stage, with an editable summary before a run.
- Provider permissions and budget remain visible while reviewing authority.
- Freeze the approved terms during a run; changing settings must never rewrite
  historical payment evidence.
- Put receipts and technical configuration behind disclosure controls.
- Represent pending, rejected, revoked, paid and delivered as distinct states.
- Retain a persistent example label on local scenarios. No example item is
  represented as a chain receipt, authenticated gateway event, ENS lookup or
  hardware-device approval.
- Real operations remain available in Accounts and Developer tools. UI completion
  does not establish Circle, Arc, Ledger or passkey deployment readiness.
- Use warm white, dark ink and a restrained green accent. Text and spacing carry
  the interface. Layout must work at 320px and with keyboard navigation.

## Mobbin references

Reviewed the returned screen images for these references. Adopt the interaction
patterns, not their branding or exact layout:

- [Wise payment review](https://mobbin.com/screens/ced7c24f-5381-4d74-8c7c-313b54f94540):
  compact progress indicator, prominent amount, summary rows and one confirmation.
- [PayPal payment review](https://mobbin.com/screens/34fbf5fd-4c50-4dcf-a26b-42bdd53f00e7):
  payment detail disclosure and an explicit final total before sending.
- [Contractbook task creation](https://mobbin.com/flows/c231b486-f673-4c7b-bcf0-57f21cbf8bab):
  contextual task details and a clear confirmation without losing the workspace.
- [Height task form](https://mobbin.com/flows/186edfeb-8a25-45ca-b624-917f5439de90):
  focused form entry and task detail with adjacent activity.

## E2E boundaries

Local UI checks cover brief editing, validation, authority review, example
execution, rejection/revocation, delivery/result, reset, responsive navigation,
and graceful account-service failure. Existing wallet tests target `/advanced`
so the original live execution path remains independently testable.

The sponsor E2E gate remains a separate exercise: confirmed identity lookup,
actual bounded policy authorization, Circle Agent Stack transaction on Arc,
Ledger-backed authority or secrets boundary, and paid-service delivery evidence.
