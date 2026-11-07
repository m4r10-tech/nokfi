# Changelog

## 0.4.0

- New **Customer** resource: Get Many (list or search your address book) and Create.
- New **Job** resource: Get the status and result of a background job (*Run in Background*).
- New **Tax › Get Quarter Summary**: VAT (303) and IRPF (130) of a quarter from your Nokfi ledger.
- Invoice › Issue: the **Idempotency Key** lasts **30 days** (the description used to say "always"; before, the API kept it 24 h).
- Nokfi Trigger: **Only Live Events** is now **on by default** (workflows that relied on the old default receive no test events; turn it off while building with a test key). A webhook created with a test key only receives test events.
- Nokfi Trigger: the saved webhook is only forgotten when Nokfi answers 404 (a 429 or a network error no longer creates a second, orphaned webhook), and a webhook disabled after too many failed deliveries, or with different events, is reactivated and updated on activation. Deleting an already deleted webhook no longer fails.
- API behaviour this release relies on: test keys no longer see live data, 429 responses carry `Retry-After`, and errors are not stored by `Idempotency-Key`.

## 0.3.0

- **Issue invoices** from n8n (Invoice › Issue): Nokfi numbers them without gaps, computes VAT per rate, IRPF withholding and the equivalence surcharge, adds them to your books and creates the VERI*FACTU record. Customer from your address book, typed in, or none (simplified invoice).
- Invoice › **Rectify**, **Cancel**, **Set Status** (rejected/accepted, paid/unpaid), **Get**, **Get Many** and **Download** (PDF, UBL 2.5, Facturae 3.2.2, Factur-X or CII as binary data).
- Optional **Idempotency Key** (e.g. the order ID) so the same order never produces two invoices, even across executions.
- With a test key (`nk_test_…`) invoices are test documents (TEST- numbering) that never reach your books or the tax agency.
- Nokfi Trigger: new events Invoice Issued, Cancelled, Paid, Unpaid, Rejected, Rejection Undone, and VERI*FACTU Record Accepted / Rejected.
- Invoice › Extract reads **e-invoices** exactly, without AI and without using quota: Facturae 3.2.x (.xml/.xsig), UBL 2.x, CII and Factur-X/ZUGFeRD PDFs (`source_format` in the output, `ai_used: false`).

## 0.2.0

- New **Nokfi Trigger** node: starts a workflow on Analysis Completed, Job Completed, Job Failed, Quota Threshold (80 % / 100 %) or Fiscal Deadline (7 days and 1 day before). Registers and deletes its webhook automatically and verifies the `Nokfi-Signature` HMAC.
- New **Tax** resource (no AI, no quota): Validate Tax ID (NIF/NIE/CIF), Calculate VAT (with equivalence surcharge), Calculate Withholding (IRPF), Estimate Modelo 130, Get Fiscal Calendar.
- **Run in Background** option for Invoice › Extract and Analysis › Create (returns a job).
- Every POST sends an `Idempotency-Key`, so *Retry On Fail* never charges twice.
- Credential accepts test keys (`nk_test_…`) on every plan.

## 0.1.2

- Node categories: Finance & Accounting and Analytics (supported by n8n).

## 0.1.1

- First release published from GitHub Actions with npm provenance.
- Smaller package: build info file excluded.

## 0.1.0

- First release: Nokfi API credential; Invoice › Extract (PDF, image or text, with deterministic checks), Analysis › Create / Get / Get Many, Usage › Get. Usable as an AI Agent tool.
