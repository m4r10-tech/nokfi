# n8n-nodes-nokfi

This is an n8n community node for [Nokfi](https://nokfi.app): the AI for small-business documents and finance.

- **Issue invoices** in your name: gap-free numbering, VAT, IRPF withholding and equivalence surcharge computed by Nokfi, added to your books, with PDF, e-invoice (UBL 2.5, Facturae, Factur-X) and the VERI*FACTU record. Rectify, cancel, mark as paid or rejected, and download them.
- **Extract invoices** from PDFs, images or text and get the same JSON every time, with **validation done by Nokfi, not by the AI**: totals (base + VAT − withholding = total), Spanish NIF/CIF/NIE check digits, dates and usual VAT rates.
- **Run financial analyses** (sales, cash, stock, purchases, profit, two-period comparison, document folders) and get a structured report: summary, key figures, priorities and an action plan.
- **Spanish tax tools without AI** (no quota): validate NIF/NIE/CIF, VAT with the equivalence surcharge, IRPF withholding, Modelo 130 and the tax calendar.
- **Nokfi Trigger**: start a workflow when an analysis or a background job finishes, when your quota reaches 80 % or 100 %, or 7 days and 1 day before each tax deadline. Signed webhooks, registered automatically.
- **Check your usage** (plan, daily quota, analyses used today).

Data is processed by AI providers that do not train on it. Invoices sent through the API are not stored.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Examples](#examples) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-nokfi`.

## Credentials

1. Sign in to Nokfi and open **Developers → Keys**.
2. Create a key. Name it after the client or workflow: Nokfi shows the usage of each key separately.
   - **Live keys** (`nk_live_…`, Pro and Max plans) work with your data and use your quota.
   - **Test keys** (`nk_test_…`, every plan) validate input the same way and return realistic sample data, without using quota. Build and test with them, then switch.
3. In n8n, create a **Nokfi API** credential and paste the key. Leave the base URL as `https://nokfi.app`.

The credential test calls `GET /api/v1/usage`.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Invoice | Issue | Issues an invoice: customer from your address book (ID), typed in (saved to the address book) or none (simplified invoice, up to 400 € VAT included); one or more lines; optional withholding, equivalence surcharge, exemption, dates, series and language. Returns the invoice with its number and totals. |
| Invoice | Rectify | Corrective invoice for the difference (lines usually with a negative quantity) and a reason. |
| Invoice | Cancel | Cancels an invoice issued by mistake: kept as cancelled, out of your books, with its VERI*FACTU cancellation record. |
| Invoice | Set Status | Rejected (with reason) or accepted again; paid (with date) or unpaid. |
| Invoice | Get / Get Many | An invoice with lines, events and VERI*FACTU record; or the list, with date, status and search filters. |
| Invoice | Download | PDF or e-invoice (UBL 2.5, Facturae 3.2.2, Factur-X, CII) into a binary field, ready to attach to an email. |
| Invoice | Extract | Reads up to 5 documents per request (PDF, JPG, PNG, WebP or text). Use `*` as the binary field to send every attachment of the item. Outputs one item per invoice (or one item with all of them). |
| Analysis | Create | Runs an analysis. For spreadsheets, "All Input Items as Rows" sends the whole input (e.g. a Google Sheets node) as one table. |
| Analysis | Get / Get Many | Reads reports you already have. |
| Tax | Validate Tax ID | NIF, NIE or CIF check digit, entity type and EU VAT number. |
| Tax | Calculate VAT | VAT with or without VAT included, plus the equivalence surcharge. |
| Tax | Calculate Withholding | IRPF withholding (professional 15 %, new professional 7 %, rental 19 %…) and the invoice total. |
| Tax | Estimate Modelo 130 | From your year-to-date figures or from your Nokfi ledger. |
| Tax | Get Fiscal Calendar | Upcoming deadlines (303, 130, 111, 115, 390…) with days left, one item each. |
| Usage | Get | Plan, daily quota and analyses used today. |

Issuing and managing invoices uses no AI and no quota; your issuer details (legal name, tax ID, address) are filled in once in the Nokfi app. Issued invoices are never edited: rectify or cancel them. With a test key, invoices are test documents (`TEST-` numbering) that never reach your books or the tax agency. Every Issue and Rectify request carries an `Idempotency-Key` (set your own, e.g. the order ID, in *Additional Fields*).

Every invoice extraction and every analysis uses **1 analysis from your daily quota** (the same quota as the web app); the tax tools use none. Maximum 30 requests per minute per key. Requests carry an `Idempotency-Key`, so n8n's *Retry On Fail* never charges twice.

**Run in Background**: Invoice › Extract and Analysis › Create can return a job right away (`?async=true`). Pair it with the Nokfi Trigger (*Job Completed*) to get the result.

### Nokfi Trigger

Choose the events and activate the workflow: the trigger registers its webhook in Nokfi (you'll see it in **Developers → Webhooks**) and deletes it when you deactivate the workflow. Every request is checked against the `Nokfi-Signature` HMAC; unsigned or old requests get a 401. Your n8n instance must be reachable on a public https URL.

| Event | When |
|---|---|
| Analysis Completed | A report finished (API or web app). Includes the report. |
| Job Completed / Job Failed | A background job finished. Includes the result or the error. |
| Quota Threshold | You reached 80 % or 100 % of today's quota. |
| Fiscal Deadline | A tax deadline is 7 days or 1 day away (according to your legal form). |
| Invoice Issued / Cancelled / Paid / Unpaid / Rejected / Rejection Undone | Something happened to an invoice (from the API, the MCP or the web app). Includes a summary: id, number, totals, customer, status. |
| VERI*FACTU Record Accepted / Rejected | The Spanish tax agency answered an invoice record (with the error code when rejected). |

### Invoice output

```json
{
  "file_name": "invoice.pdf",
  "issuer_name": "Talleres Ruiz SL", "issuer_nif": "B12345674",
  "invoice_number": "F-2026-017", "invoice_date": "2026-09-14",
  "base": 1000, "vat_rate": 21, "vat_amount": 210, "irpf_amount": 0, "total": 1210,
  "checks": { "totals_ok": true, "nif_valid": true, "recipient_nif_valid": null, "date_valid": true, "vat_rate_valid": true },
  "warnings": []
}
```

Documents that cannot be read come out as items with `is_invoice: false` and an `error` code (`pdf_scanned`, `unsupported_type`, `file_too_large`…). Scanned PDFs must be sent as images.

## Examples

- **Invoices from email to a spreadsheet**: Gmail Trigger (download attachments) → Nokfi (Invoice › Extract, binary field `*`) → IF `checks.totals_ok` → Google Sheets (append row).
- **Weekly sales report**: Schedule Trigger → Google Sheets (read) → Nokfi (Analysis › Create, Sales, All Input Items as Rows) → Send Email with `{{ $json.report.summary }}`.
- **Tax deadline reminder to Slack**: Nokfi Trigger (Fiscal Deadline) → Slack with `{{ $json.data.models.join(', ') }} due on {{ $json.data.date }}`.
- **Background invoice batch**: Nokfi (Invoice › Extract, Run in Background) in one workflow, Nokfi Trigger (Job Completed) → Google Sheets in another.
- **Invoice every paid order**: Shopify/WooCommerce Trigger (order paid) → Nokfi (Invoice › Issue, Idempotency Key `{{ $json.id }}`) → Nokfi (Invoice › Download, PDF) → Gmail (send with the attachment).
- **Chase rejected invoices**: Nokfi Trigger (Invoice Rejected) → Slack with `{{ $json.data.number }}: {{ $json.data.reason }}`.
- **AI Agent tool**: the node can be used as a tool by n8n's AI Agent.

## Resources

- [Nokfi API documentation](https://nokfi.app/api-docs)
- [OpenAPI specification](https://nokfi.app/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Compatibility

Built with `@n8n/node-cli` and tested with n8n 1.x. No runtime dependencies.

## License

[MIT](LICENSE.md)
