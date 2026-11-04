<!-- //// Neoffice — added file (no upstream equivalent). -->
# Browser tests of POS Next's guest pages

Playwright, against a real instance (osiris): the QR page of a table (`/pos/guest/<token>`) and the web takeaway
order (`/pos/order`), driven the way a diner meets them. The Python suite (`pos_next/tests`) covers the endpoints;
this covers what they cannot say: that the pages work in a browser, with the sign-in code that really comes by mail.

## Setup

```bash
cd tests/e2e
npm install                      # @playwright/test is pinned to the version whose browsers are installed
npx playwright install chromium  # only when the pinned version changes
```

The target and the way onto its server stay outside the repository, in `~/.config/pos-next-e2e.env` (chmod 600):

```
POSNEXT_E2E_URL=https://osiris.neoffice.me
POSNEXT_E2E_SSH_HOST=osiris        # `ssh <host>` reaches the bench's server with the operator key
POSNEXT_E2E_SITE=prod.local
```

```bash
npm test                           # both projects (phone, desktop); one worker, in file order
npx playwright test --project=phone specs/02-the-takeaway-order-goes-to-the-end.spec.js
```

## What it does to the instance

Nothing of a test stays. Each test makes **its own table and its own throwaway diner** (`e2e-pos-<random>@yopmail.com`:
the only kind of address the clean-up will touch), and takes them away afterwards: the table, its token, the orders on
them (a paid one is cancelled first), the Payment Intents, the mail queue rows, and the diner's User, Customer and Contact.
The clean-up takes about 90 s on osiris (each deletion wakes the search indexes of the other apps).
The instance is shared, so a deletion can wait for a row another run holds ("can not be deleted right now"): the
clean-up is played again up to four times, each step checking that its target still exists. Each test then checks that
its OWN table, user and customer are gone (not that no "E2E" table exists anywhere: one abandoned by another run made
the next tests fail for something they did not do), and a global setup sweeps the tables an earlier run abandoned
(`E2E …` tables older than 30 minutes).

- **The code** is read from the server's mail queue (`fixtures/code.js`): the mail is queued by Frappe before it leaves,
  so its row holds exactly what the mailbox would. Nothing mints or bypasses a code.
- **The payment**: the provider's hosted page is opened for the order's whole total, but the card form is the provider's.
  The settlement is simulated by the Payment Intent its webhook would make (`theProviderSettles`), which the `payments`
  app puts on the invoice by itself. Play a test card by hand once on the hosted page before claiming that part.
- **A paid order settles itself** (`04-a-paid-takeaway-order-is-settled-without-the-page`): no page is opened; the provider's settlement is simulated and the
  real workers must submit the invoice and send its lines to the kitchen (played on osiris, the money was on the invoice and the order a held draft,
  because the page had come back in another browser). It also reads the mail the customer is sent (`mailsTo`, from the Email Queue: the subject and the
  body with the pickup number, once, in the language of the page: a second test orders on a German page and reads « Abholnummer »; needs the German
  catalogue compiled on the server, `compile-po-to-mo` then `clear-cache`).
- **Identities** (`03-the-three-identities`): a visitor, a Website User and a member of the staff, with sessions minted
  the way `bench browse --user` does, with no password. The staff session passes everything by construction, which is
  why it is only the third of three.
- Screenshots of the key steps land in `test-results/` (ignored by git); read them after a run.
