# n8n-nodes-nokfi

This is an n8n community node for [Nokfi](https://nokfi.app): the AI for small-business documents and finance.

- **Extract invoices** from PDFs, images or text and get the same JSON every time, with **validation done by Nokfi, not by the AI**: totals (base + VAT − withholding = total), Spanish NIF/CIF/NIE check digits, dates and usual VAT rates.
- **Run financial analyses** (sales, cash, stock, purchases, profit, two-period comparison, document folders) and get a structured report: summary, key figures, priorities and an action plan.
- **Check your usage** (plan, daily quota, analyses used today).

Data is processed by AI providers that do not train on it. Invoices sent through the API are not stored.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Examples](#examples) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-nokfi`.

## Credentials

1. Sign in to Nokfi and open **Developers → Keys** (Pro and Max plans).
2. Create a key. Name it after the client or workflow: Nokfi shows the usage of each key separately.
3. In n8n, create a **Nokfi API** credential and paste the key (`nk_live_…`). Leave the base URL as `https://nokfi.app`.

The credential test calls `GET /api/v1/usage`.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Invoice | Extract | Reads up to 5 documents per request (PDF, JPG, PNG, WebP or text). Use `*` as the binary field to send every attachment of the item. Outputs one item per invoice (or one item with all of them). |
| Analysis | Create | Runs an analysis. For spreadsheets, "All Input Items as Rows" sends the whole input (e.g. a Google Sheets node) as one table. |
| Analysis | Get / Get Many | Reads reports you already have. |
| Usage | Get | Plan, daily quota and analyses used today. |

Every invoice request and every analysis uses **1 analysis from your daily quota** (the same quota as the web app). Maximum 30 requests per minute per key.

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
- **AI Agent tool**: the node can be used as a tool by n8n's AI Agent.

## Resources

- [Nokfi API documentation](https://nokfi.app/api-docs)
- [OpenAPI specification](https://nokfi.app/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Compatibility

Built with `@n8n/node-cli` and tested with n8n 1.x. No runtime dependencies.

## License

[MIT](LICENSE.md)
