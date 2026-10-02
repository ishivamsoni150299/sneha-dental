# Production manual QA - 2026-10-02

Target: https://mydentalplatform.com. Local reference commit: `190a260`.

Status: completed within the authorized live-data boundaries; outstanding gates are listed below. This report records visible browser interactions and explicitly labelled server checks, not a blanket production-readiness certification. User authorized labelled dummy accounts and records on the live site. No real clinical credentials were verified, no fictitious provider was approved for marketplace publication, and no real charges or bulk deletion were performed. No application source fixes were made during the live QA stage. Subsequent local remediation is recorded separately at the end of this report.

## Test boundaries

- Run label: `QA 2026-10-02 M1`.
- Account addresses use reserved `example.test` domains; delivered email and email-code claims cannot be certified without a controlled inbox.
- Fictional contact details must not be called or messaged. No SMS or WhatsApp delivery is authorized to an uncontrolled number.
- Administrator credentials must be entered directly by the user in the browser. Passwords, recovery codes and session tokens are excluded from this report.
- Real media/device, payment and verified-publication cases require separate safe test conditions.
- Permission probes used read-only requests from the synthetic accounts' normal sessions. M2 logout required an API-assisted recovery because the inactive-owner UI had no usable sign-out control; this is not a UI logout pass. The subsequent old-session read was denied.
- No data cleanup has been performed. Preserve unrelated records and use exact QA record IDs for any later authorized cleanup.

## Execution log

| ID | Case | Status | Observation |
| --- | --- | --- | --- |
| AUTH-01 | Empty sign-in | PASS | Visible alert: Enter your email and password. |
| NAV-01 | Mobile discovery link | PASS | Navigation from account to `/dentists` succeeded. |
| DIR-01 | Fresh directory reload | PASS | Latest request form rendered; directory contains zero verified locations, expected for this new project. |
| DIR-02 | Search context | PASS | Noida and QA treatment text carried into the request form. |
| REQ-01 | Incomplete request | PASS | Required-field/contact-consent alert shown; no success state. |
| REQ-02 | Invalid mobile | PASS | `12345` rejected; no success state. |
| REQ-03 | Labelled request submission | PASS | Saved-request confirmation appeared; subsequently matched in administrator inbox. Exact ID 62ecea6a-7bd5-498e-af70-9ce0081882a6. Confirmation distinguishes request from appointment. |
| AUTH-02 | Patient signup validation | PASS | Empty details, short password and mismatched confirmation rejected with distinct visible messages. |
| AUTH-03 | Patient signup | PASS | QA account created; recovery code presented; continuation opened patient appointments. |
| AUTH-04 | Session reload and refresh | PASS | QA patient identity remained visible after full reload; empty appointment state rendered. |
| AUTH-05 | Booking-reference validation | PASS | Incomplete reference rejected with visible inline text. Screen-reader announcement not verified. |
| ROLE-01 | Patient restricted navigation | PASS (UI) | Dentist workspace, clinic dashboard and platform clinic directory redirected to the patient's appointments. Shared workspace also resolved to appointments. This is not an independent server-authorization test. |
| REC-01 | Recovery-code generation and reset | PASS | Generated replacement code, signed out, reset password through visible recovery form. An initial navigation-race attempt was inconclusive and repeated after logout settled. |
| REC-02 | Recovery-code reuse | PASS | Reuse rejected with invalid/already-used error. |
| REC-03 | Old/new password and logout | PASS | Old password rejected; new password opened patient appointments; logout returned to sign-in. |
| AUTH-06 | Duplicate patient signup | PASS | Existing-email error returned; no second signup success. |
| PRO-01 | Professional entry | PASS | Header link opened dentist-specific landing and registration/workspace links. |
| PRO-02 | Dentist signup | PASS | Missing full name rejected; QA account created with recovery-code handoff and draft workspace. |
| PRO-03 | Professional detail validation | PARTIAL | Missing required fields and negative experience prevented save, but no visible field or summary explanation appeared. |
| PRO-04 | Professional save/reload | PASS | Explicitly fictional qualification, council, registration and biography persisted after reload; remained draft. |
| PRO-05 | Practice creation | PASS | Negative fee prevented submission; valid QA practice persisted. |
| PRO-06 | Immediate practice/tab switch | ISSUE | Switching to Hours immediately after creation showed no practice until reload. `NG0953` logged; persisted practice appeared after reload. |
| PRO-07 | Working-hours validation | PASS | Reversed hours rejected with visible explanation; Monday 09:00-13:00 and day off 2026-10-12 saved and survived reload. |
| PRO-08 | Break validation | PASS | Default break outside working hours rejected; 11:00-11:30 break saved. |
| PRO-09 | Appointment views | PASS (empty) | Upcoming visits, Needs confirmation, Past visits and Refresh rendered empty states. No appointment actions exercised. |
| PRO-10 | Submit verification | PASS (pending only) | Labelled fictional profile entered pending review. No approval or publication performed. |
| PRO-11 | Unverified exclusion | PASS | Public search for QA dentist still showed zero verified locations. |
| ROLE-02 | Dentist restricted navigation and logout | PASS (UI) | Clinic dashboard and platform clinic directory returned dentist to its workspace. Logout returned to professional landing. |
| CLI-01 | Clinic signup | PASS | QA account created with recovery-code handoff and resumed clinic setup. |
| CLI-02 | Clinic step-one validation | PASS | Missing name, slug and phone displayed individual explanations; labelled name, slug and reserved US test phone accepted. |
| CLI-03 | Onboarding field names | ISSUE | Name, slug and phone have no associated label, aria-label or aria-labelledby; placeholders serve as fallback names. |
| CLI-04 | Services/hours progression | ISSUE / contract check | Zero services and reversed Monday hours both advanced to plan selection without errors. Valid service and hours restored before creation. Service requirement is not established; invalid-hours handling needs remediation. |
| CLI-05 | Plan display | PASS (selection only) | Free selected; monthly prices shown; yearly choice disabled. No paid checkout performed. |
| CLI-06 | Free onboarding | PASS | Completion displayed active permanent Free plan, generated subdomain and dashboard link. Onboarding creates active but marketplace-unlisted clinic, not a verified dentist listing. |
| SITE-01 | Generated subdomain | PASS | HTTPS page loaded with correct QA clinic name. Website publication is active; it must be deactivated during targeted cleanup. |
| SITE-02 | Clinic trust content | ISSUE | New zero-patient clinic displays a 4.9 rating and unconditional two-hour confirmation claims. |
| BOOK-01 | Empty booking form | PASS | Separate service/date/time alerts and focus on first invalid control. |
| BOOK-02 | Past date | PASS | Past date rejected; time choices cleared. Future date restores choices. |
| BOOK-03 | Mobile continuation | ISSUE | Focus on a select/input hides the entire mobile booking dock. At 660px the focused state has display none/zero height; Tab away restores a 52px action. Initial breakpoint-gap hypothesis was disproved. Footer intercepted a subsequent pointer click; keyboard Enter continued successfully. Hardware keyboard/scroll behavior needs additional verification. |
| BOOK-04 | Slot hold and details | PASS | Keyboard continuation reserved slot; missing name and invalid phone rejected; valid QA details reached review. |
| BOOK-05 | Contact consent and optional fields | PASS | Missing consent produced privacy alert; optional email/notes disclosure works; SMS controls disappeared once the not-required configuration loaded. No SMS sent. |
| BOOK-06 | Guest booking | PASS | QA-KMQ4C07G requested for General Dentistry, 2026-10-05 10:00 IST. Pending-not-confirmed receipt rendered. Email omitted; QA details and explicit no-contact note subsequently verified in owner dashboard. |
| BOOK-07 | Manage Booking handoff | FAIL | Receipt link `/my-appointment` redirected from tenant to platform `/my-appointment`, then ended at `/dentists`, not appointment management. |
| OPS-01 | Owner booking persistence | PASS | QA-KMQ4C07G appeared in the clinic dashboard with the saved QA details and no-contact note. |
| OPS-02 | Confirm, refresh and filters | PASS | Confirmation persisted after reload; status filters displayed the QA appointment. |
| OPS-03 | Appointment dialogs | PARTIAL | Native modal and Tab containment verified; closing restored opener focus. Escape behavior remains unverified because browser-tool attempts were inconclusive. |
| OPS-04 | Cancellation validation | PASS (validation only) | Missing reason rejected; Keep appointment preserved the record. Actual cancellation is covered separately in OPS-09. |
| OPS-05 | Reschedule new Free clinic | BLOCKED / ISSUE | Doctor selector offered only Select doctor, no slots loaded, and Save new time stayed disabled. Doctor management is Basic-gated; saving clinic profile/contact does not provision a doctor. Wider plan behavior remains untested. |
| OPS-06 | Arrived and Completed | PASS | Both transitions succeeded; Completed persisted after reload and appeared under the Completed filter. |
| OPS-07 | Appointment contact links | FAIL (link targets) | Patient phone and tel link displayed ++919000000001. Send WhatsApp confirmation targeted clinic number 12025550123 instead of patient. No call or message sent. |
| SET-01 | Required profile validation | PASS | Saving with blank Doctor Name showed Doctor name is required. |
| SET-02 | Contact save and reload | PASS | QA address and Noida persisted after full reload; reserved phone remained +12025550123. Initial blank-address validation evidence was lost with the expired browser execution and is not counted as passed. |
| SET-03 | Hours editing | PASS | Added Sunday / Closed, received Clinic hours saved, and verified all seven saved rows after full reload. Public Contact and footer only show first four days. |
| SET-04 | Services validation and publication | PASS | Empty name rejected with Service name is required; labelled test description saved and appeared on tenant home and Services pages. |
| SET-05 | Social URL validation | FAIL | not-a-url accepted as Instagram value and persisted after reload. Subsequently cleared and saved successfully. No tracking ID or outbound link opened. |
| SET-06 | Testimonials | PASS (empty only) | No testimonials yet rendered. No fabricated review published; review CRUD remains untested. |
| SET-07 | Theme, logo and plans | PASS (Free controls) | Theme and logo show Basic gates; Free active forever and monthly pricing shown; yearly button disabled. Checkout and paid controls not exercised. |
| SITE-03 | Tenant navigation | PASS (routes/content) | Services, About Us, Gallery, Testimonials, Privacy and Terms reached their expected routes/headings. Gallery labels illustrative images; this is not an image-loading or complete layout certification. |
| SITE-04 | About trust content | ISSUE | Empty-clinician clinic displays BDS qualification and Accepting appointments with Your dentist fallback, plus 4.9/5 rating. No real credentials supplied. |
| SITE-05 | Contact phone propagation | FAIL | Visible +12025550123 is linked as tel:+9112025550123 and wa.me/9112025550123 after Contact save. No call or message sent. |
| ENQ-01 | Contact validation | PASS (required fields) | Empty name/phone/message and missing consent show visible explanations; invalid phone rejected. |
| ENQ-02 | Optional email feedback | ISSUE | With all other fields valid and consent checked, invalid-email prevents submission silently: no field explanation or alert. |
| ENQ-03 | Public enquiry and owner inbox | PASS | Message sent confirmation; QA enquiry appeared in owner inbox. UI-triggered refresh returned 200 with matching record, clinic ID and consent timestamp. |
| ENQ-04 | Send another message | PASS (reset) | Name cleared and consent reset; keyboard-focus restoration not established. |
| ENQ-05 | Read/archive persistence | PASS | Mark Read removed unread count; Read survived Refresh. Archive and subsequent Refresh showed Archived. |
| ENQ-06 | Enquiry date display | FAIL | UI shows Invalid Date despite API createdAt being valid ISO timestamp 2026-10-02T02:04:16.647347Z. |
| REV-01 | Clinic patient reviews | PASS (empty only) | No published appointment reviews yet rendered. Review creation/reply/moderation remains untested. |
| ROLE-03 | Free feature route guards | PASS (UI) | Direct doctor and patient routes redirected to Settings / Plan and showed Free active forever. Server-side plan enforcement not independently exercised. |
| ROLE-04 | Clinic owner platform restriction | PARTIAL | `/business/clinics` redirected to own clinic dashboard without exposing platform records. First redirected render remained blank until reload; recovered dashboard showed only QA clinic records. Repeatability remains open. |
| OPS-08 | CSV export | PASS (artifact) | Integrated browser did not expose a download event, but the expected local download existed. Structured Import-Csv parsing verified QA-KMQ4C07G, exact QA name, General Dentistry, 2026-10-05 10:00 and completed status. Export occurred before the later two test appointments. |
| BOOK-08 | Pending-slot conflict | PASS (server) / ISSUE (UI) | A second visible attempt at 2026-10-06 10:30 returned 409 with That time is already booked. Please choose another slot. No duplicate created, but step-one form showed no explanation or alert. |
| BOOK-09 | Closed-day choices | CONTRACT CHECK | After Sunday / Closed persisted, selecting 2026-10-04 still offered 09:00-19:00. No closed-day hold or booking submitted; establish whether Free preferred-time requests should follow display hours and verify server enforcement. |
| OPS-09 | Actual cancellation | PASS | QA-VYZQ5NQW cancelled with Other reason; Cancelled persisted after Refresh and full reload. |
| OPS-10 | No-show transition | PASS | Separate QA-VRC2XMHN requested, confirmed, then marked No Show. No Show persisted after full reload. No actual patient communication or visit. |
| ADM-01 | Administrator session | PASS | User-entered sign-in opened platform clinic directory. No administrator password handled by browser automation or recorded in this report. |
| ADM-02 | Clinic directory controls | PASS | No-match search displayed clear empty state; QA slug search found exact clinic; Live/Not live filters separated records; Clinic name sorting changed order. Older unrelated QA record left untouched. |
| ADM-03 | Patient request persistence and status | PASS | Earlier labelled request present with matching problem/contact. Closed update returned 200 and persisted after full reload. No contact made. |
| ADM-04 | Request date formatting | ISSUE | Preferred date displayed as raw 2026-10-04T18:30:00.000Z alongside 11:00:00 (India), rather than chosen local date 2026-10-05. |
| ADM-05 | Verification queue and reason validation | PASS | QA dentist credentials and practice appeared; Reject with empty reason showed Enter a rejection reason first. |
| ADM-06 | Reject fictional dentist | PASS (queue persistence) | Labelled rejection succeeded; status said rejected and queue showed No dentists awaiting verification after full reload. Dentist-side persistence is covered in PRO-12. Response listener used the wrong method and timed out; no duplicate rejection attempted. No approval/publication performed. |
| ADM-07 | Admin clinic edit validation | PASS | Existing M1 with no doctor name rejected by field message and required-field summary. No identity or billing changes saved to M1. |
| ADM-08 | Admin billing/marketplace controls | PARTIAL / BLOCKED | M1 remains Free and unlisted. Marketplace and private verification controls inspected without approval. Paid activation requires verified payment/reference; no fabricated payment or paid entitlement provisioned. |
| ADM-09 | Admin create owner validation | PASS | Missing email/password and a short temporary password rejected with visible messages before clinic creation. |
| ADM-10 | Inactive clinic and owner creation | PASS | Created M2 as inactive, Free and unlisted with explicit fictional identity and separate synthetic owner login. Client Login Ready handoff rendered; directory increased to three records. Owner authentication verified separately in CLI-07; private workspace blocked. |
| ADM-11 | Admin edit persistence | PASS | M2 Address Line 2 changed to labelled QA value, saved with owner password left blank, and persisted on reopening Edit. |
| ADM-12 | Inactive tenant public access | PASS (UI) | M2 subdomain redirected to platform `/business` rather than rendering a public fictional clinic. No provider approved or listed. |
| ADM-13 | Disable/restore website | PASS | M1 switched inactive; its public subdomain redirected to `/business`. Re-enabled successfully. Only the current run's M1 record changed. |
| ADM-14 | Coming Soon round trip | PASS | M1 showed Coming soon in directory and a branded `/coming-soon` page publicly. Restored original live state; normal home page verified after fresh navigation. |
| ADM-15 | Payment-link form | PARTIAL (selection only) | Form opened with monthly Basic/Pro prices; Pro selection and Cancel worked. Send with WhatsApp not used: it would create a live subscription and open an uncontrolled phone destination. No payment link, payment or message created. |
| LEAD-01 | Required-field validation | PASS | Empty clinic name, phone and city showed field explanations. |
| LEAD-02 | Short phone validation | FAIL | 12345 accepted; labelled lead created with normalized phone 9112345 and invalid tel:+9112345 link. Subsequently corrected through Edit; no contact attempted. |
| LEAD-03 | Overdue follow-up | PASS | Past 2026-10-01 date produced overdue indicator and work-queue count. |
| LEAD-04 | Do-not-call control | FAIL / UNAVAILABLE | Reviewed opt-out with explicit QA evidence returned 503 Service Unavailable; dialog remained open. Dismissed without retry. Do-not-call state was not applied and must not be claimed as saved. No call queued. |
| LEAD-05 | Status/edit/reload | PASS | Standard Lost transition succeeded. Corrected phone, QA notes and 2026-10-07 follow-up persisted after reload; active/overdue/AI-ready counts became zero and next action said Keep closed. |
| LEAD-06 | Search, filters and sort | PASS | Lost filter retained QA record; no-match search showed clear empty state; matching search and By follow-up sort restored it. |
| ADM-16 | Review moderation | PASS (empty only) | Zero pending reviews and zero open patient reports rendered. Refresh initiated; publishing/rejection/report resolution not exercised without genuine eligible review data. |
| ADM-17 | Analytics against QA bookings | PARTIAL / ISSUE | Totals and recent bookings match three QA records; M2 has zero. Booking Status lists only Pending/Confirmed/Cancelled/Declined/Expired, omitting Completed and No Show, so displayed counts sum to one rather than three. |
| ADM-18 | Revenue view | PASS (Free state only) | Three Free clinics, zero paying clients and zero MRR/ARR rendered; M1 booking count three, M2 zero. No global costs or payment records altered; no paid reconciliation certified. |
| ADM-19 | Cost editor Cancel | PASS (non-saving path) | Cost editor opened with four zero-value inputs and cancelled without saving. Financial validation/persistence not exercised because these are platform-wide records, not dummy tenant data. |
| ADM-20 | Clinic delete confirmation Cancel | PASS (non-destructive path) | M2 delete control displayed explicit irreversible warning; Cancel removed confirmation and retained the exact QA record. Delete permanently not used. |
| LEAD-07 | Discovery configuration state | PASS (disabled state) | Discovery explicitly reports missing Google Places API key; no provider configuration, paid search or real prospect import performed. CSV bulk import/export remains untested. |
| ADM-21 | Administrator logout | PASS (UI) | Visible Sign out ended the administrator session before signing in as the synthetic M2 owner. |
| CLI-07 | Inactive owner sign-in/workspace | ISSUE | Provisioned M2 credentials authenticate, but GET /api/clinics/current returns 404 and dashboard redirects to /business/signup?resume=true, remaining on Checking your account. No duplicate signup or activation attempted. Public home remains reachable; account entry redirects back into the loop, with no usable sign-out control on tested screens. |
| ROLE-05 | M2 server role/tenant boundaries | PASS (narrow server checks) | M2 GET of the M1 admin clinic endpoint returned 403. Supplying M1's clinicId to current-clinic appointment and contact lists returned 200 with zero records, not M1's three appointments or one enquiry. Checks used M2's normal session, with no record mutations or token disclosure. |
| SEC-01 | M2 logout/session revocation | PASS (API-assisted) | Logout returned 204; reusing the previously valid M2 session on an appointment read immediately returned 401. Fresh sign-in became available. API recovery was required by CLI-07; this does not certify every session/revocation path. |
| OWN-01 | Guest-reference ownership | PASS (negative path) | Patient entered existing no-email guest reference QA-KMQ4C07G. Linking-code request returned 200 with a neutral conditional-email message; reference alone did not link the booking. No linked appointments remained visible. Successful delivered-code ownership remains untested. |
| OWN-02 | Linking-code validation/denial | PASS (negative path) | Six-digit input showed Enter the 8-digit code without a request. One invalid eight-digit code returned 404 with Invalid or expired linking code; account remained empty after Refresh. Initial response wait timed out because the six-digit attempt was correctly blocked locally. |
| ROLE-06 | Patient server restricted reads | PASS (bounded denial) | Patient session received 403 for the admin M1 clinic read and 400 for the current-clinic appointment read. No tenant records returned. Record the distinct statuses; do not claim that both endpoints enforced a 403 role check or that authorization is comprehensively certified. |
| PRO-12 | Dentist rejection handoff | PASS | Fresh dentist sign-in showed rejected and the exact administrator QA rejection reason in the profile. No resubmission, approval or publication performed. |
| AUTH-07 | Final session exit | PASS (UI) | Patient and dentist signed out through visible controls. After dentist logout settled, visible Sign in opened the account form with email/password inputs. Immediate scripted navigation had raced the logout landing redirect; settled UI retry succeeded. Browser left signed out. |

## Confirmed findings

- P1 CLI-INACTIVE-01: Existing inactive clinic owners cannot reach their private workspace. M2 authenticates, but `ClinicQueryService.findCurrent()` filters `active = true`, so `/api/clinics/current` returns 404. The clinic guard routes to resumed signup, which routes a clinic-admin back to the dashboard, leaving Checking your account and no usable sign-out control on the tested screens. Public deployment status should not strand an already provisioned owner in onboarding; private access or an explicit recoverable inactive state needs a defined contract. Source: `backend/src/main/java/com/mydentalplatform/clinic/ClinicQueryService.java`, `src/app/core/guards/clinic-admin.guard.ts` and `src/app/features/business/signup/signup.component.ts`.
- P2 REC-UI-01: Recovery retains the previous success message after a subsequent failed reset. Reproduce by successfully resetting the QA password, then submitting the same consumed recovery code again. The invalid/already-used alert and previous password-reset success are visible together. Desktop screenshot captured in the shared browser. Owning component: `src/app/features/professional/account-recovery.component.ts`; `reset()` clears `error` but not `message`.
- P2 PRO-UI-01: Professional and practice forms silently return for invalid submissions. Empty mandatory fields, negative experience and a negative fee prevent saving without visible field explanations or an error summary. Owning component: `src/app/features/professional/professional-profile.component.ts`.
- P2 PRO-UI-02: Switching to Hours while Add practice is completing can leave the Hours view showing no practice despite successful persistence. Reload recovers it. The add button is not disabled during submission, and the destroyed embedded profile emits `NG0953`. Reproduced once; further repeatability and lifecycle analysis remain open.
- P1 BOOK-NAV-01: The clinic request receipt's Manage Booking destination fails to reach appointment management and ends at the platform directory. Reproduced using the newly submitted QA booking.
- P1 TRUST-01: Clinic signup shows hard-coded named customer feedback without a demo label or established evidence. The user describes this as a new project with no real dentists. Source: `src/app/features/business/signup/signup.component.html` around line 792.
- P1 TRUST-02: Newly onboarded zero-patient clinic shows a 4.9 rating and promises confirmation within two hours on home/booking screens. About also defaults to BDS and Accepting appointments for Your dentist despite no supplied clinician. No rating evidence, credentials or clinic confirmation SLA was established by onboarding. These conflict with safer pending/next-working-window copy elsewhere.
- P2 CLI-A11Y-01: Associate the clinic-name, website-address and phone controls with their visible labels. DOM inspection confirmed zero labels and no ARIA naming bindings.
- P2 CLI-HOURS-01: Clinic setup advances with closing time earlier than opening time. `SignupComponent.next()` does not validate step-two hours. Invalid hours were not submitted to clinic creation; server-side enforcement remains untested.
- P2 BOOK-UI-01: Mobile booking actions disappear whenever a form input/select is focused, even without establishing that the soft keyboard is open. Source: `src/design-system.css` around line 3111. Blur/Tab restores the action. Footer pointer interception also observed after restoring it; separate layout repeatability remains open.
- P1 OPS-CONTACT-01: Owner appointment detail actions have incorrect destinations: doubled plus sign in the patient telephone link and clinic number in the patient WhatsApp confirmation link. Inspected targets only; no outbound contact performed.
- P2 OPS-RESCHEDULE-01: Newly created Free clinic cannot reschedule its QA appointment through the dialog: required doctor options are empty and Save new time is disabled. Doctor management is Basic-gated and settings updates do not create a doctor. Establish intended Free-plan scheduling behavior before treating this as a universal entitlement defect.
- P2 SET-PHONE-01: Saving an accepted international clinic phone prepends 91 to non-91 digits, producing incorrect public call/WhatsApp destinations. Reserved +12025550123 became +9112025550123. Source: `AdminSettingsComponent.saveContact()` in `src/app/features/admin/admin-settings/admin-settings.component.ts`.
- P2 SET-URL-01: Social settings accept and persist not-a-url as Instagram URL. Reproduced with success confirmation and full reload; restored to blank after the test.
- P2 ENQ-UI-01: Invalid optional contact email silently blocks submission when all other inputs and consent are valid. No inline explanation or alert appears.
- P2 ENQ-DATE-01: Owner enquiry timestamp renders Invalid Date while its API createdAt value is a valid ISO timestamp. Reproduced before and after refresh.
- P2 BOOK-ERROR-01: Slot-conflict 409 is not rendered on step one. Reproduced twice against a pending QA appointment; server says the time is already booked, while the UI simply returns to Continue to details without an alert. `acquireSlotHold()` stores the error, but the generic error panel is in the confirmation step of `src/app/features/appointment/appointment.component.html`.
- P2 ADM-DATE-01: Patient request inbox interpolates the raw preferred-date timestamp instead of formatting its India-local date. The submitted 2026-10-05 date appears as 2026-10-04T18:30:00.000Z next to 11:00:00 (India). Owning template: `src/app/features/business/patient-requests.component.ts`.
- P2 LEAD-PHONE-01: Lead creation validates phone presence but accepts a five-digit subscriber number. Runtime creation and subsequent Edit confirmed persisted 9112345; generated telephone link was invalid. Corrected after testing. Owning form: `src/app/features/business/leads/lead-form/lead-form.component.ts`.
- P2 LEAD-OPTOUT-01: The visible reviewed do-not-call action returns 503 and does not persist opt-out. Treat automated outreach as unavailable; standard Lost status is not an equivalent audited opt-out. No real calls or messages attempted.
- P2 ADM-STATS-01: Analytics Booking Status omits Completed and No Show (and offers no Arrived category). Three known QA bookings are counted in totals/recent bookings, while visible status counts sum to one. Status summaries should cover the same records as their total.

## Open observations

- Platform-route denial reached the correct clinic URL but initially rendered blank; reload recovered. Repeat before attributing this to an application navigation defect.
- Closed-day and after-hours choices do not reflect the saved clinic display schedule. Free-plan request semantics and server enforcement need a discriminating booking test.
- Public Contact and footer list only Monday-Thursday although seven rows are saved. Review intended condensed-hours presentation; no complete-week control was visible.
- Integrated-browser download events were unavailable, but the clinic CSV artifact was subsequently found and parsed successfully. Do not infer a download failure from that tool limitation alone.

## Cleanup ledger

| Type | Identifier | Label | State |
| --- | --- | --- | --- |
| Dentist request | 62ecea6a-7bd5-498e-af70-9ce0081882a6 | QA 2026-10-02 Request M1 | Verified in admin inbox; Closed after QA status test. Problem explicitly says fictional contact, do not call or send messages. |
| Patient account | qa.patient.20261002.m1@example.test | QA 2026-10-02 M1 | Created and signed out. Password recovery exercised; consumed recovery codes and passwords are not recorded. |
| Dentist account | qa.dentist.20261002.m1@example.test | QA 2026-10-02 Dentist M1 | Rejected by administrator with explicit fictional-credentials reason. Do not approve or publish. |
| Practice location | b1c210b6-8d35-43a9-a188-cb08fa539ce3 | QA 2026-10-02 Practice M1 - DO NOT PUBLISH | Active location under unverified QA provider; Monday schedule and break saved. Not publicly listed. |
| Clinic owner account | qa.clinic.20261002.m1@example.test | QA 2026-10-02 M1 | Free onboarding completed. Password/recovery code excluded. |
| Clinic | 742f4e10-09d7-4aee-b45a-455aeceb2180; slug qa20261002m1 | QA 2026-10-02 Clinic M1 | Active website at qa20261002m1.mydentalplatform.com; marketplace-unlisted. QA address/service description saved; Sunday Closed added. Invalid social URL cleared. Targeted deactivation needed after tests. |
| Guest appointment | QA-KMQ4C07G; 8fe586ca-f48e-40c0-bb0f-1d9e0cf24ea5 | QA 2026-10-02 Visit M1 - DO NOT CONTACT | 2026-10-05 10:00 IST; currently Completed after QA transitions. No email; no-contact note. No real patient or visit. |
| Guest appointment | QA-VYZQ5NQW; 9a907398-b666-43af-ad3b-d2031d3ac49e | QA 2026-10-02 Cancel M1 - DO NOT CONTACT | 2026-10-06 10:30 IST; currently Cancelled with Other reason. No email; no-contact note. |
| Guest appointment | QA-VRC2XMHN; e8351c32-89d3-440b-860f-08f5099a964c | QA 2026-10-02 No Show M1 - DO NOT CONTACT | 2026-10-06 11:00 IST; currently No Show after QA confirmation. No email; no-contact note. |
| Clinic enquiry | f6e26014-eb90-47da-8638-e3ae95cc4601 | QA 2026-10-02 Enquiry M1 - DO NOT CONTACT | Archived after read/archive tests. No email; explicitly forbids calls and messages. |
| Clinic owner account | qa.clinic.20261002.m2@example.test | QA 2026-10-02 M2 | Provisioned through administrator create-clinic flow; authentication verified, private workspace blocked by inactive flag. API-assisted logout completed and old session denied. Synthetic password excluded; no paid plan provisioned. |
| Clinic | 1c5455e2-895d-4f1b-aab3-0b1a669330bf; slug qa20261002m2 | QA 2026-10-02 Clinic M2 - DO NOT PUBLISH | Inactive, Free and marketplace-unlisted. Explicit fictional clinician label; not publicly deployed. Address Line 2 edit persisted. |
| Lead | 33420dbd-5bbd-43d9-b80b-b8f053f33ced | QA 2026-10-02 Lead M1 - DO NOT CONTACT | Lost; phone corrected to the fictional QA number; follow-up 2026-10-07 and no-contact notes saved. Do-not-call service returned 503, so no persisted opt-out is asserted. No call/message consent granted or contact attempted. |

## Completion and outstanding gates

Covered journeys include public requests, patient signup/recovery, dentist draft setup and rejection, Free clinic onboarding/settings, guest booking and owner status transitions, enquiries, clinic CSV artifact, administrator clinic controls, lead maintenance, and bounded permission/session checks. Empty, disabled and cancelled paths are distinguished from completed transactions in the log. These results do not establish that all end-to-end functionality works or that the first clinic is ready to launch.

Outstanding coverage: successful patient booking ownership/claims with a controlled inbox; genuine approved-provider booking/video and review creation/reply/moderation; paid checkout, activation, reconciliation and gated doctor/patient/branding controls; actual notification delivery and two-device media; successful rescheduling, closed-day server enforcement, hardware Escape and remaining desktop/mobile/keyboard states; actual permanent deletion and lead bulk import/export; exhaustive role, tenant and session authorization tests. Do not approve the fictional QA dentist or fabricate payments to unlock coverage.

No application code fixes or data cleanup were performed during live QA. Administrator and synthetic sessions were ended, with the browser left on signed-out account entry. M1 remains active/public but marketplace-unlisted; M2 remains inactive/unlisted. The ledger identifies exact records for separately authorized cleanup. Lead opt-out did not persist; explicit no-contact notes and Lost status must not be mistaken for a saved do-not-call flag.

## Local remediation - 2026-10-02

The original 110-case execution log above remains a record of the pre-fix production behavior. All 21 confirmed findings have local implementation changes; none is retrospectively marked as a production pass. This stage did not alter production QA records or deliver outbound messages. Deployment and production retesting remain required.

| Finding | Implementation | Focused evidence |
| --- | --- | --- |
| CLI-INACTIVE-01 | Private current-clinic lookup includes inactive tenant-owned clinics; public lookup remains active-only. Config failures lead to a recoverable workspace state with Retry and Sign out, not resumed signup. Unrelated password controls are hidden in that state. | `ClinicQueryServiceTest`, guard/recovery regressions, isolated HTTP/database inactive-owner check; mocked browser Settings and workspace-error checks. |
| REC-UI-01 | Reset clears previous success before validating or issuing another request. | Account-recovery regression. |
| PRO-UI-01 | Invalid profile/practice submissions mark controls and show explanations; experience range is enforced by the form. | Professional profile regressions. |
| PRO-UI-02 | Pending practice saves disable duplicate submission and workspace tabs; destroyed editors do not emit or reload. | Deferred-save/destroyed-editor regression. |
| BOOK-NAV-01 | Legacy Manage Booking resolves to `/appointments`; cross-host navigation uses the router destination rather than the old pathname. Ownership verification is unchanged. | 35 guard tests; local browser `/my-appointment` to `/appointments`. Live cross-host retest pending. |
| TRUST-01 | Removed the unsupported named clinic-signup testimonial. | Template compilation and manual source check. |
| TRUST-02 | Removed fabricated rating/qualification/patient-count fallbacks, default 4.9 on new clinics, same-day and two-hour promises. Rating requires a real aggregate; illustrative imagery is labelled. | Rating-service regressions, booking checks and browser About check with missing clinician/rating; illustration loaded. |
| CLI-A11Y-01 | Clinic name, website address and phone have linked visible labels and invalid-state bindings. | Browser `getByLabel` reaches all three controls. |
| CLI-HOURS-01 | Step progression and submission reject invalid/equal/reversed hours; closed days are exempt. | Signup regressions; reversed Monday hours stay on the hours step with a visible explanation at 320/390/1440px. Server-side onboarding-hours validation is not certified. |
| BOOK-UI-01 | Focus no longer hides the dock; booking-only mobile isolation is removed so the footer cannot cover the fixed action. | Browser focus/scroll hit-testing and pointer continuation at 320/390/660px; 52px action remains clickable. Hardware soft keyboard remains untested. |
| OPS-CONTACT-01 | Telephone links normalize once; WhatsApp confirmation targets the patient rather than the clinic. | Dashboard contact-target regression; no outbound contact. |
| OPS-RESCHEDULE-01 | Existing unassigned appointments can use preferred times without a doctor when the clinic has no doctors. Backend resolves a doctor where available and refuses to remove an existing assignment. | Dashboard/scheduling regressions and isolated HTTP/database reschedule with no doctor; foreign tenant denied. |
| SET-PHONE-01 | Shared normalization preserves explicit international country codes rather than prepending 91. | Phone utility tests and intercepted browser save body: `12025550123` retained for telephone/WhatsApp fields. |
| SET-URL-01 | Optional social links require credential-free http/https URLs with a host, on both client and server. | Backend rejection/no-write tests; accessible browser error at 320/390/1440px. |
| ENQ-UI-01 | Optional invalid email shows inline text, alert and invalid-state binding. | Contact regression and browser submission blocked with visible email explanation. |
| ENQ-DATE-01 | Enquiry timestamps use the shared India-timezone date formatter without appending another timestamp. | ISO/microsecond timestamp regression. |
| BOOK-ERROR-01 | Slot-hold errors render on the active first booking step. | Mocked 409 browser check at 320/390/768/1440px, with pointer continuation. |
| ADM-DATE-01 | Preferred date formats in Asia/Kolkata; preferred time remains separate. | UTC-to-India calendar-date regression. |
| LEAD-PHONE-01 | Frontend normalized-length validation and backend 10-15-digit validation reject short phones. | Lead-form/controller regressions; isolated API returns 400 for short phone. |
| LEAD-OPTOUT-01 | Admin-only local opt-out endpoint transactionally persists revoked consent/lost state and an actor audit; ordinary edits cannot clear it. Optional AI calling remains unavailable. Response does not claim provider cancellation. | Controller regressions and isolated real HTTP/database persistence, admin/owner permission, blank-reason and ordinary-edit checks. |
| ADM-STATS-01 | One shared status definition drives rows and bars for all eight appointment lifecycle states. | Analytics regression verifies displayed counts equal the monthly total, including Arrived/Completed/No Show. |

Public Contact and footer now render the complete saved hours list instead of truncating to four rows. Operational dates and phone normalization reuse small tested utilities; analytics rows/bars share one definition. Existing Angular/Spring/JDBC architecture, role boundaries, clinic scoping, session revocation, monthly-only billing and unavailable optional AI providers are retained.

### Validation

- Full Angular suite: 219 passing tests; final focused reruns: 35 guards, 10 booking and 3 analytics/recovery tests passing.
- Full backend suite: 144 tests, zero failures/errors, one explicitly disabled production-startup smoke test. The extended `MarketplaceLaunchTest` passed again afterward against isolated embedded PostgreSQL, including inactive access, audited opt-out and unassigned rescheduling.
- Final `npm run lint`, `npm run build` and `npm run test:artifacts`: passed. Build prerendered 30 routes; artifact smoke is not browser end-to-end testing.
- Final editor diagnostics: none in frontend/backend source.
- Local browser checks used `http://127.0.0.1:4300` and mocked API responses, not live identity or persistence. They covered focused/mobile booking actions, footer hit-testing, visible 409/email/social/hours errors, legacy management routing, inactive-owner Settings, recoverable workspace errors, accessible signup names, international phone save payload and removal of fake About content. Selected surfaces had no positive horizontal overflow at 320/390/1440px; booking additionally checked 660/768px. Mobile screenshots were inspected for action/error layout. These are UI evidence, not API integration certification.

### Remaining gates

- Deploy and re-execute the affected production journeys, especially the actual tenant-to-platform Manage Booking redirect and existing inactive-owner session. Saved custom marketing copy needs separate review; removing defaults does not rewrite persisted clinic content.
- Decide whether Free/no-doctor preferred-time requests must obey public display hours. Current server enforcement checks future time and the 30-minute grid, not public closed-day hours. This contract question is not fixed or certified by the rescheduling change.
- Repeat the previously transient blank platform-denial render; verify hardware soft-keyboard behavior, modal Escape and remaining desktop/mobile/keyboard states, including professional save/tab behavior.
- Complete controlled-inbox ownership/notification delivery, genuine verified-provider booking/reviews, paid monthly checkout/reconciliation and real two-device video. The one disabled startup test and full isolated Playwright end-to-end suite were not run in this stage.
- Existing live cleanup remains separately authorized. The production lead is still not asserted to have persisted opt-out until the new endpoint is deployed and successfully exercised; Lost and no-contact notes are not equivalent consent evidence.