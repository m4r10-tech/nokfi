# Changelog

## Unreleased

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
