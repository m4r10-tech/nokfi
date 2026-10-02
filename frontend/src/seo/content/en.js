/**
 * Public page content in English (session 12, SEO). Aimed at English
 * speakers who work or run a business in Spain: Spanish terms (autónomo,
 * modelo 303, IVA…) are kept and explained. Same shape as es.js.
 */
export default {
  ui: {
    home: 'Home',
    tools: 'Tools',
    guides: 'Guides',
    faqTitle: 'Frequently asked questions',
    relatedTools: 'More free tools',
    relatedGuides: 'Related guides',
    useTool: 'Open the calculator',
    readGuide: 'Read the guide',
    disclaimer: 'Estimate for the general regime (mainland Spain and the Balearic Islands). It does not replace professional advice.',
    privacyNote: 'Calculated in your browser: nothing is sent or stored.',
    updated: 'Updated {m}',
    ctaTitle: 'Keep your numbers without spreadsheets',
    ctaText: 'Nokfi reads your invoices with AI, tells you how much to set aside for forms 303 and 130, issues VERI*FACTU invoices and reminds you of every deadline. Try it free for 14 days.',
    ctaButton: 'Try 14 days free',
    ctaSecondary: 'What is Nokfi',
    tableBracket: 'Bracket',
    tableNet: 'Net monthly income',
    tableBase: 'Minimum base',
    tableQuota: 'Minimum quota',
    tableUpTo: 'Up to {v}',
    tableFrom: 'Over {v}',
    tableConcept: 'Item',
    tableRate: 'Employer',
    nif: {
      label: 'NIF, NIE or CIF',
      placeholder: 'For example, 12345678Z',
      check: 'Check',
      valid: 'Valid',
      invalid: 'Not valid',
      reasonFormat: 'It does not have the format of a Spanish NIF, NIE or CIF.',
      reasonDigit: 'The format is right, but the check letter or digit does not match: look for a typo.',
      type: 'Type',
      entity: 'Entity',
      vat: 'EU VAT number',
      types: { nif: 'NIF / DNI (Spanish citizens)', nie: 'NIE (foreign nationals)', cif: 'Company tax ID (CIF)' },
      person: 'Individual',
      entities: {
        A: 'Public limited company (SA)', B: 'Limited liability company (SL)', C: 'General partnership', D: 'Limited partnership',
        E: 'Joint ownership or estate', F: 'Cooperative', G: 'Association or foundation', H: 'Homeowners’ association',
        J: 'Civil partnership', N: 'Foreign entity', P: 'Local authority', Q: 'Public body', R: 'Religious institution',
        S: 'State or regional government body', U: 'Temporary business association (UTE)',
        V: 'Other entity', W: 'Permanent establishment of a non-resident entity'
      },
      note: 'It checks the format and the check character. It does not look up whether the ID is registered with the tax office or in VIES.'
    },
    calendar: {
      form: 'Legal form',
      all: 'All',
      autonomo: 'Self-employed',
      sociedad: 'Company',
      next: 'Next deadline',
      inDays: 'in {n} days',
      inDays_one: 'tomorrow',
      today: 'today',
      models: 'Forms {m}',
      ifApplies: 'If it applies',
      otherYear: 'Spain tax calendar {y}',
      kinds: {
        quarterly: 'Quarterly returns: VAT, income tax, withholdings and rent',
        withholdings: 'Withholdings on staff and freelancers (111) and on rent (115)',
        vat_annual: 'Annual VAT summary (390)',
        withholdings_annual: 'Annual withholding summaries (190 and 180)',
        third_parties: 'Transactions over €3,005.06 with the same party (347)',
        income_tax_annual: 'Personal income tax return (100)',
        corporate_annual: 'Corporate income tax (200)',
        corporate_installment: 'Corporate income tax instalment (202)'
      }
    }
  },

  guidesIndex: {
    title: 'Spain tax guides for freelancers and small businesses',
    description: 'Plain-English guides to form 303, form 130, VAT to offset, deductible expenses, invoicing rules, VERI*FACTU and chasing unpaid invoices in Spain.',
    h1: 'Guides for freelancers and small businesses in Spain',
    intro: 'What you need to know to keep your Spanish taxes and invoices in order, with examples and without jargon.'
  },

  tools: {
    autonomo: {
      title: 'Spain self-employed quota calculator 2026 (autónomo)',
      description: 'Work out your 2026 autónomo social security quota in Spain from your real net income: bracket, minimum base and monthly payment, using the official table.',
      h1: 'Spain self-employed (autónomo) quota calculator 2026',
      intro: 'Since 2023, self-employed workers in Spain pay social security based on their real net income. Enter what you invoice and what you spend each month to see your bracket and your monthly quota.',
      sections: [
        { h: 'How the autónomo quota is calculated',
          ps: [
            'First, your net income: what you invoice minus your deductible business expenses, both without VAT. Then a further 7 % is taken off for general expenses (3 % if you are a company director registered as autónomo).',
            'Your net monthly income places you in one of 15 brackets. Each bracket has a minimum contribution base, and the quota is that base times the contribution rate, which is 31.50 % in 2026: 28.30 % common contingencies, 1.30 % work accidents, 0.90 % cessation of activity, 0.10 % training and 0.90 % intergenerational equity (MEI).'
          ] },
        { h: 'Example',
          ps: ['You invoice €2,500 a month and have €500 of expenses. Your net income is €2,000, or €1,860 after the 7 % deduction. That is bracket 8 (€1,850.01 to €2,030), with a minimum base of €1,209.15, so your minimum quota is €380.88 a month.'] },
        { h: '2026 brackets', table: 'autonomo',
          ps: ['Minimum bases from Order PJC/297/2026 (Spanish Official Gazette, 31 March 2026), unchanged from 2025. The minimum quota is the minimum base times 31.50 %. You can choose a higher base, up to the maximum for your bracket.'] },
        { h: 'The year-end adjustment',
          ps: [
            'During the year you pay according to the income you expect. Once the tax office has your income tax return, Social Security compares: if you earned more, it asks for the difference; if you earned less, it refunds you.',
            'So it pays to update your bracket when your income changes. You can change it up to six times a year through the Import@ss portal.'
          ] },
        { h: 'The €80 flat rate',
          ps: ['If you register as self-employed for the first time (or have not been self-employed in the previous two years, three if you already had it), you pay €80 a month for the first 12 months, whatever your bracket. It can be extended for another 12 months if your net income in the first year is below the minimum wage.'] }
      ],
      faq: [
        { q: 'How much does an autónomo pay in Spain in 2026?', a: 'It depends on net income. The minimum quota ranges from €205.88 a month (bracket 1, up to €670 of net income) to €607.35 (bracket 15, over €6,000). With the flat rate, you pay €80 a month in your first year.' },
        { q: 'Which expenses reduce my net income?', a: 'Your deductible business expenses under Spanish income tax rules: materials, office rent, utilities, insurance, accountant, software… Then a further 7 % is deducted for general expenses.' },
        { q: 'Can I change bracket during the year?', a: 'Yes, up to six times a year through Social Security’s Import@ss portal. The change applies from the first day of the next two-month period.' },
        { q: 'Is the result exact?', a: 'It is the minimum quota for your bracket under the official 2026 table. The final amount is set in the year-end adjustment, based on your actual income.' }
      ],
      guides: ['gastos', 'apartar', 'm130']
    },

    iva: {
      title: 'Spain VAT calculator: add or remove IVA (21 %, 10 %, 4 %)',
      description: 'Calculate Spanish VAT (IVA) in seconds: add it to a net amount or remove it from a VAT-inclusive price. Spanish rates: 21 %, 10 %, 4 % and 0 %.',
      h1: 'Spain VAT (IVA) calculator',
      intro: 'Add Spanish VAT to a net amount, or find the VAT inside a price that already includes it. Choose the rate and get the net amount, the VAT and the total instantly.',
      sections: [
        { h: 'How to add VAT to a price',
          ps: ['Multiply the net amount by the VAT rate and add it. At 21 %, €1,000 net carries €210 of VAT, for a total of €1,210. Shortcut: net × 1.21.'] },
        { h: 'How to remove VAT from a price',
          ps: [
            'Divide the total by 1 plus the rate. If €1,210 includes 21 % VAT, the net amount is €1,210 ÷ 1.21 = €1,000 and the VAT is €210.',
            'A common mistake is to take 21 % off the total: €1,210 − 21 % = €955.90, which is not the net amount. VAT is calculated on the net amount, not on the total.'
          ] },
        { h: 'VAT rates in Spain',
          list: [
            '21 % (standard): most goods and services.',
            '10 % (reduced): hospitality and restaurants, passenger transport, home renovation work, some foods…',
            '4 % (super-reduced): bread, milk, eggs, fruit and vegetables, books, medicines…',
            'Exempt activities (healthcare, regulated education, insurance…): no VAT.'
          ],
          ps: ['The Canary Islands have IGIC instead of VAT (7 % standard), and Ceuta and Melilla have IPSI.'] }
      ],
      faq: [
        { q: 'How do I calculate Spanish VAT on a price?', a: 'Multiply the net amount by the rate: at 21 %, €100 × 0.21 = €21 of VAT, for a total of €121.' },
        { q: 'How do I remove VAT from a total?', a: 'Divide the total by 1.21 (or 1.10 or 1.04, depending on the rate). For example, €121 ÷ 1.21 = €100 net.' },
        { q: 'Which VAT rate goes on my invoices?', a: '21 %, unless your activity has a reduced rate (10 % or 4 %) or is exempt. If in doubt, check the VAT Act or ask an adviser.' },
        { q: 'How much VAT do I pay to the tax office?', a: 'The VAT you charge on your invoices minus the VAT you pay on business expenses. It is declared every quarter on form 303.' }
      ],
      guides: ['m303', 'compensar', 'factura']
    },

    irpf: {
      title: 'IRPF withholding calculator for invoices in Spain',
      description: 'Work out what you will be paid on a Spanish invoice with VAT and IRPF withholding: 15 % standard, 7 % for new freelancers, 19 % on commercial rent.',
      h1: 'IRPF withholding calculator for invoices',
      intro: 'If you are a professional freelancer in Spain and invoice companies or other freelancers, your invoice carries income tax withholding (retención). Enter the net amount to see the VAT, the withholding and what you will receive.',
      sections: [
        { h: 'How the total is calculated',
          ps: ['Total = net amount + VAT − withholding. With €1,000 net, 21 % VAT and 15 % withholding: €1,000 + €210 − €150 = €1,060. Both VAT and withholding are calculated on the net amount, never on the total.'] },
        { h: 'Which rate to apply',
          list: [
            '15 %: the standard rate for professional activities.',
            '7 %: in your first year as a professional and the two following, if you were not a professional the year before. You must tell your client.',
            '19 %: rent of commercial premises or offices.',
            '1 %: some business activities taxed under the modules system.',
            'No withholding: if you invoice private individuals or your activity is a business rather than a profession (a shop, a workshop…).'
          ] },
        { h: 'Withholding is not lost',
          ps: ['Your client pays the withholding to the tax office on your behalf (on their form 111). It is an advance on your income tax: it is deducted in your annual return and on your form 130. If 70 % or more of your income carries withholding, you do not need to file form 130.'] }
      ],
      faq: [
        { q: 'When do I add withholding to an invoice?', a: 'When you are a professional (designer, lawyer, consultant…) invoicing a company or another freelancer. It does not apply to private individuals.' },
        { q: 'Who can apply 7 %?', a: 'Professionals in the year they start and the two following years, provided they did not carry out a professional activity the year before.' },
        { q: 'Is withholding calculated with or without VAT?', a: 'Without VAT, on the net amount. With €1,000 net at 15 %, the withholding is €150.' },
        { q: 'What happens to the tax withheld from me?', a: 'It is deducted from what you pay on form 130 and in your annual return. Keep your invoices: the tax office cross-checks them with your clients’ form 190.' }
      ],
      guides: ['m130', 'factura', 'apartar']
    },

    empleado: {
      title: 'Spain employee cost calculator 2026: salary + social security',
      description: 'Work out what an employee really costs a company in Spain in 2026: gross salary plus employer social security (common contingencies, unemployment, MEI).',
      h1: 'Spain employee cost calculator',
      intro: 'An employee in Spain costs more than their gross salary: the employer pays around 32 % on top in social security. Enter the salary to see the real cost per year, per month and per hour.',
      sections: [
        { h: 'Employer social security rates in 2026', table: 'empleado',
          ps: ['Employer rates in the general regime (Order PJC/297/2026). The work accident and occupational disease rate (AT/EP) depends on the activity; 1.5 % is an average.'] },
        { h: 'Example',
          ps: ['A gross salary of €25,000 a year on a permanent contract with a 1.5 % AT/EP rate adds 32.15 % in contributions: €8,037.50. The total cost to the employer is €33,037.50 a year, about €2,753 a month.'] },
        { h: 'What is not included',
          ps: ['The maximum contribution base in 2026 is €5,101.20 a month: above that salary no more is paid (except the solidarity contribution, which is not included). Discounts, bonuses, allowances and collective agreement terms are not included either.'] }
      ],
      faq: [
        { q: 'How much does an employee cost a company in Spain?', a: 'Roughly the gross salary plus 31-33 % in social security, depending on the contract type and the risk of the activity.' },
        { q: 'Why does a temporary contract cost more?', a: 'Because the employer’s unemployment contribution is 6.70 % on temporary contracts, against 5.50 % on permanent ones.' },
        { q: 'What is the MEI?', a: 'The Intergenerational Equity Mechanism, a contribution to support pensions. In 2026 it is 0.90 %, of which the employer pays 0.75 %.' },
        { q: 'Does the annual gross salary include extra payments?', a: 'Yes: enter the total gross for the year, including the extra payments (pagas extra).' }
      ],
      guides: ['gastos', 'apartar']
    },

    hora: {
      title: 'Hourly rate calculator for freelancers in Spain',
      description: 'Work out what hourly rate to charge as a freelancer: add your fixed costs, the income you want and your autónomo quota, and divide by your billable hours.',
      h1: 'Freelance hourly rate calculator',
      intro: 'Many freelancers set their rate by looking at competitors and end up working for less than their business costs. This calculator starts from your costs and the income you want.',
      sections: [
        { h: 'The formula',
          ps: ['Hourly rate = (fixed costs + the income you want + autónomo quota) ÷ hours you bill per month. Then add a margin for the unexpected, slow months and holidays.'] },
        { h: 'Example',
          ps: ['You have €400 of fixed costs, want to earn €2,000 gross and pay a €300 quota: you need €2,700 a month. If you bill 100 hours, your cost is €27 an hour; with a 10 % margin, €29.70. With 21 % VAT, the client pays €35.94.'] },
        { h: 'Count only billable hours',
          ps: ['Quotes, emails, invoicing, travel and training are work too, but you cannot bill them. Billable hours are usually 60-70 % of the hours you work: about 100-110 out of 160 a month.'] }
      ],
      faq: [
        { q: 'How much should I charge per hour as a freelancer?', a: 'Enough to cover your costs, your quota and the income you want, spread over the hours you actually bill. Then compare it with the market.' },
        { q: 'Does the hourly rate include VAT?', a: 'No, the result is without VAT. If you charge VAT, add 21 % (or your rate) on the invoice.' },
        { q: 'Should I include income tax?', a: 'The income you want is gross: your income tax comes out of it. If you want a net figure, raise it to cover the tax.' }
      ],
      guides: ['apartar', 'gastos', 'factura']
    },

    calendario: {
      title: 'Spain tax calendar {y}: deadlines for freelancers and SMEs',
      description: 'Every {y} deadline in Spain for forms 303, 130, 111, 115, 390 and 347, the income tax return and corporate tax, month by month.',
      h1: 'Spain tax calendar {y}',
      intro: 'Spanish tax office (AEAT) deadlines for {y} under the general regime, month by month. If a deadline falls on a weekend, it has already been moved to the Monday.',
      sections: [
        { h: 'Quarterly returns',
          ps: ['VAT (303), the income tax instalment (130) and withholdings (111 and 115) are filed from the 1st to the 20th of April, July and October. Fourth-quarter returns are filed in January: by the 20th for 111 and 115, and by the 30th for 303 and 130.'] },
        { h: 'Annual returns',
          ps: ['In January, the annual VAT summary (390) and withholding summaries (190 and 180). In February, form 347 if you had transactions over €3,005.06 with the same client or supplier. The personal income tax return (100) is due by 30 June, and corporate tax (200) by 25 July for companies whose financial year matches the calendar year.'] },
        { h: 'Before the deadline',
          ps: ['If you pay by direct debit, the deadline is a few days earlier (the 15th for quarterly returns). Dates do not take public holidays into account: confirm them on the AEAT website.'] }
      ],
      faq: [
        { q: 'When is form 303 due in Spain?', a: 'From the 1st to the 20th of April, July and October, and from the 1st to the 30th of January for the fourth quarter.' },
        { q: 'What if I file late?', a: 'If you file before the tax office asks you to, you pay a 1 % surcharge plus 1 % per full month of delay. If they ask first, the penalty is higher.' },
        { q: 'Do companies file form 130?', a: 'No. Form 130 is only for self-employed people under direct assessment. Companies make corporate tax instalments with form 202.' },
        { q: 'Which forms does a freelancer in Spain file?', a: 'Most file 303 and 130 every quarter, 390 in January and the annual income tax return. 111, 115, 190, 180 and 347 only if you have staff or freelancers with withholding, rent premises or pass the 347 threshold.' }
      ],
      guides: ['m303', 'm130', 'apartar']
    },

    nif: {
      title: 'Spanish NIF, NIE and CIF validator: check the control letter',
      description: 'Check whether a Spanish NIF, NIE or CIF is valid for free: it verifies the check letter or digit and shows the type of entity. No sign-up needed.',
      h1: 'Spanish NIF, NIE and CIF validator',
      intro: 'Before you issue an invoice in Spain, check that your client’s tax ID is correct. A wrong NIF can stop your invoice from being valid for VAT deduction.',
      sections: [
        { h: 'How the DNI letter is calculated',
          ps: ['Divide the number by 23; the remainder picks the letter from the sequence TRWAGMYFPDXBNJZSQVHLCKE. For example, 12345678 divided by 23 leaves 14, which is Z: 12345678Z.'] },
        { h: 'NIE and CIF',
          ps: [
            'The NIE for foreign nationals starts with X, Y or Z, which are replaced by 0, 1 and 2 to calculate the letter in the same way as the DNI.',
            'The tax ID of companies (formerly CIF) starts with a letter for the type of entity (B for an SL, A for an SA…), followed by seven digits and a check digit or letter.'
          ] },
        { h: 'What it does not check',
          ps: ['A correct NIF does not mean it exists or is registered. For transactions within the EU, check the VAT number in the European Commission’s VIES database.'] }
      ],
      faq: [
        { q: 'How do I know if a Spanish NIF is valid?', a: 'Enter it in the validator: it checks the format and that the check letter or digit matches the rest of the number.' },
        { q: 'Does the CIF still exist?', a: 'Since 2008 it is called NIF for companies too, but the format is the same and many people still call it CIF.' },
        { q: 'What is the EU VAT number of a Spanish company?', a: 'Its NIF with the ES prefix (for example, ESB12345674). To use it for intra-EU transactions, the company must be in the intra-community operators register (ROI).' }
      ],
      guides: ['factura', 'verifactu']
    }
  },

  guides: {
    m303: {
      title: 'Form 303 in Spain: the quarterly VAT return explained',
      description: 'What Spain’s form 303 VAT return is, who files it, how the result is calculated with an example, and when it is due each quarter.',
      h1: 'Form 303: Spain’s quarterly VAT return',
      intro: 'Form 303 (modelo 303) is the return in which freelancers and companies in Spain settle the VAT on their invoices every quarter. Here is how it works and how to know what you will pay.',
      sections: [
        { h: 'Who files it',
          ps: ['Every freelancer and company with VAT-able activity, even with no invoices in the quarter (then it is filed as a nil return). Exempt activities such as healthcare or regulated education, and retailers under the equivalence surcharge, do not file it.'] },
        { h: 'How it is calculated',
          ps: [
            'Result = output VAT (charged on your invoices) − input VAT (paid on your business expenses).',
            'Example: in the quarter you invoice €10,000 net at 21 % (€2,100 of VAT) and have €3,000 of expenses with 21 % VAT (€630). You pay €2,100 − €630 = €1,470.'
          ] },
        { h: 'If the result is negative',
          ps: ['If you paid more VAT than you charged, you carry it forward to the following quarters and, in the last quarter of the year, you can ask for a refund.'] },
        { h: 'Deadlines',
          ps: ['Q1: 1-20 April. Q2: 1-20 July. Q3: 1-20 October. Q4: 1-30 January of the following year, together with the annual summary (form 390).'] },
        { h: 'Common mistakes',
          list: [
            'Deducting VAT on an expense without a full invoice (a till receipt is not enough, unless it is a simplified invoice with your NIF).',
            'Deducting personal or mixed-use expenses without justification.',
            'Spending the VAT you collect: it is not yours, you only hold it for the tax office.'
          ] }
      ],
      faq: [
        { q: 'Do I file form 303 if I invoiced nothing?', a: 'Yes, as long as you are registered for a VAT-able activity. It is filed with a nil result or with the VAT on your expenses to carry forward.' },
        { q: 'Which VAT can I deduct?', a: 'VAT on expenses needed for your business, with an invoice in your name, recorded in your purchase ledger.' },
        { q: 'Can I pay by direct debit?', a: 'Yes, if you file before the 15th of the filing month (25 January for the fourth quarter).' }
      ],
      tool: 'iva', guides: ['compensar', 'apartar', 'm130']
    },

    m130: {
      title: 'Form 130 in Spain: income tax instalments for autónomos',
      description: 'How Spain’s form 130 is calculated (20 % of your year-to-date net income), who must file it, when you are exempt and the quarterly deadlines.',
      h1: 'Form 130: income tax instalments',
      intro: 'With form 130 (modelo 130), self-employed people in Spain pay part of their income tax in advance every quarter, so much of it is already paid by the annual return.',
      sections: [
        { h: 'Who files it',
          ps: ['Self-employed people under direct assessment (normal or simplified). You are exempt if, the year before, at least 70 % of your business income carried withholding. Companies do not file it.'] },
        { h: 'How it is calculated',
          ps: [
            'It is cumulative: take your net income from 1 January to the end of the quarter (income minus deductible expenses), calculate 20 %, and subtract earlier instalments and any tax withheld from you.',
            'Example: by June you have earned €20,000 and spent €6,000, a net income of €14,000; 20 % is €2,800. If you paid €1,200 in Q1 and €300 was withheld, you now pay €2,800 − €1,200 − €300 = €1,300.'
          ] },
        { h: 'If the result is negative',
          ps: ['If expenses exceed income, the result is zero (there is no refund). Any overpayment is recovered in the annual income tax return.'] },
        { h: 'Deadlines',
          ps: ['Same as form 303: 1-20 April, July and October, and 1-30 January for the fourth quarter.'] }
      ],
      faq: [
        { q: 'What percentage is paid on form 130?', a: '20 % of your year-to-date net income, minus earlier instalments and tax withheld.' },
        { q: 'Do I file form 130 if my invoices carry withholding?', a: 'Not if at least 70 % of your income carried withholding the year before. In your first year, the current year is used.' },
        { q: 'Is form 130 an extra tax?', a: 'No. It is an advance on your income tax: everything you paid during the year is deducted in your annual return.' }
      ],
      tool: 'irpf', guides: ['m303', 'apartar', 'gastos']
    },

    apartar: {
      title: 'How much to set aside for taxes as a freelancer in Spain',
      description: 'Which part of each invoice is not yours in Spain: VAT, the income tax advance and your quota. How to work out what to set aside each month.',
      h1: 'How much to set aside for taxes',
      intro: 'Not all the money that lands in your account is yours. If you set aside the tax office’s share every month, the quarter will not catch you short.',
      sections: [
        { h: 'All of the VAT',
          ps: ['The VAT you charge belongs to the tax office. Set aside the VAT you charged minus the VAT on your expenses: that is what you will pay on form 303.'] },
        { h: 'Income tax: about 20 % of profit',
          ps: ['If you file form 130, set aside 20 % of income minus expenses. If your invoices carry withholding, your client is already paying it for you. Depending on your annual income, the annual return may ask for more: with a high profit, set aside 25-30 %.'] },
        { h: 'Example',
          ps: ['You invoice €3,000 + €630 VAT a month and have €800 of expenses with €168 VAT. Set aside €462 of VAT (630 − 168) and €440 of income tax (20 % of €2,200): €902 a month, not counting your autónomo quota, which is charged monthly.'] },
        { h: 'A trick that works',
          ps: ['Open a separate account just for taxes and move the money there every time you are paid. What is left in your main account is what you can spend.'] }
      ],
      faq: [
        { q: 'What percentage of my invoices should I set aside?', a: 'All the VAT charged minus the VAT paid, plus 20-30 % of profit for income tax, depending on what you earn.' },
        { q: 'What about the autónomo quota?', a: 'It is charged monthly by direct debit, so you do not need to save it up for the quarter, but count it as an expense.' },
        { q: 'What if I set nothing aside?', a: 'In April, July, October and January you will have to pay the quarter’s VAT and income tax in one go. You can ask the tax office for a deferral, but with interest.' }
      ],
      tool: 'iva', guides: ['m303', 'm130', 'gastos']
    },

    compensar: {
      title: 'VAT to offset in Spain (IVA a compensar) explained',
      description: 'What it means when your Spanish form 303 shows VAT to offset, how long you have to use it and when you can ask the tax office for a refund.',
      h1: 'VAT to offset (IVA a compensar)',
      intro: 'When you paid more VAT on expenses than you charged on invoices in a quarter, the Spanish tax office does not refund it straight away: you carry it forward to the next quarters.',
      sections: [
        { h: 'When it happens',
          ps: ['It is common when you start (you buy equipment and invoice little), in slow seasons or after a large investment.'] },
        { h: 'How it is used',
          ps: [
            'It is subtracted from the result of your next form 303. Example: you have €400 to offset in Q1 and would owe €1,000 in Q2: you pay only €600.',
            'You have four years to use it. If there is still a balance in the last quarter of the year, you can keep carrying it forward or ask for a refund.'
          ] },
        { h: 'The refund',
          ps: ['You request it on the fourth-quarter form 303. The tax office has six months to pay; after that, it owes you interest. For monthly refunds, you can join the monthly refund register (REDEME), but then you file VAT every month.'] }
      ],
      faq: [
        { q: 'How long can I carry VAT forward?', a: 'Four years from the return in which it arose.' },
        { q: 'Can I ask for a refund in any quarter?', a: 'No, only in the last quarter of the year (unless you are in REDEME).' },
        { q: 'What happens to VAT to offset if I deregister?', a: 'You can request a refund of the remaining balance in your final return.' }
      ],
      tool: 'iva', guides: ['m303', 'apartar']
    },

    gastos: {
      title: 'Tax-deductible expenses for the self-employed in Spain',
      description: 'Which expenses a Spanish autónomo can deduct for income tax and VAT, the requirements they must meet, and the fine print on home, car and meals.',
      h1: 'Tax-deductible expenses for autónomos',
      intro: 'Every deductible expense lowers your income tax and, if it carries VAT, what you pay on form 303. But it has to follow some rules.',
      sections: [
        { h: 'The three requirements',
          list: [
            'It must be related to your business.',
            'It needs a full invoice in your name with your NIF or NIE.',
            'It must be recorded in your expenses ledger.'
          ] },
        { h: 'Expenses that are almost always deductible',
          list: [
            'Office rent, office utilities and business insurance.',
            'Materials, stock, tools and software.',
            'Accountant, bank fees and advertising.',
            'Your autónomo quota and health insurance (up to €500 a year per person for income tax).',
            'Equipment such as computers or machinery, through depreciation.'
          ] },
        { h: 'The fine print',
          ps: [
            'Working from home: if you declare to the tax office the part of your home you use, you deduct that share of property tax, community fees or rent, and 30 % of that share of utilities (electricity, water, internet).',
            'Car: for income tax, only if used exclusively for work (except sales reps, taxi drivers, driving schools…). For VAT, 50 % is usually accepted.',
            'Meals: up to €26.67 a day in Spain (€53.34 with an overnight stay) and €48.08 abroad (€91.35), paid by card at a restaurant on a working day.'
          ] },
        { h: 'Hard-to-justify expenses',
          ps: ['Under simplified direct assessment, you also deduct 5 % of net income for hard-to-justify expenses, up to €2,000 a year.'] }
      ],
      faq: [
        { q: 'Can I deduct an expense with a till receipt?', a: 'For VAT you need an invoice (full, or simplified with your NIF). For income tax a receipt may do if it proves the expense, but an invoice is much safer.' },
        { q: 'Can I deduct my phone and computer?', a: 'Yes, if you use them for your business. If you also use them privately, deduct only the business share.' },
        { q: 'How long do I keep invoices?', a: 'At least four years, the period in which the tax office can review them; six if you keep commercial accounts.' }
      ],
      tool: 'autonomo', guides: ['apartar', 'm130', 'factura']
    },

    factura: {
      title: 'How to issue an invoice in Spain: mandatory details',
      description: 'What a Spanish invoice must include to be valid, when a simplified invoice is enough, and how to correct an invoice with a corrective invoice.',
      h1: 'How to issue a valid invoice in Spain',
      intro: 'An invoice missing a detail can stop your client from deducting the VAT, and it can be fined. These are the mandatory details.',
      sections: [
        { h: 'Mandatory details on a full invoice',
          list: [
            'Number and, if you use several, series. Numbers must be consecutive.',
            'Issue date (and the transaction date, if different).',
            'Name, tax ID (NIF/NIE) and address of both issuer and client.',
            'Description of the goods or services.',
            'Net amount, VAT rate and VAT amount.',
            'Income tax withholding, if any, and the total.',
            'If no VAT applies, the reason (exemption or reverse charge).'
          ] },
        { h: 'Simplified invoice',
          ps: ['It replaces the till receipt for amounts up to €400 including VAT (€3,000 in retail, hospitality and some other sectors). It has fewer details: number, date, your NIF, the VAT rate applied or “VAT included”, and the total.'] },
        { h: 'How to correct an invoice',
          ps: ['An issued invoice is never deleted or edited: you issue a corrective invoice (factura rectificativa), with its own series, stating which invoice it corrects and why.'] },
        { h: 'What is coming: VERI*FACTU and e-invoicing',
          ps: ['From 2027, invoicing software will have to create a record of each invoice and print a QR code the tax office can verify. Later, invoices between businesses will have to be electronic.'] }
      ],
      faq: [
        { q: 'Can I make invoices in Word or Excel?', a: 'Today, yes. From 2027 (companies) and July 2027 (everyone else), any invoicing software you use must comply with VERI*FACTU.' },
        { q: 'Which numbering should I use?', a: 'Consecutive, with no gaps. You can use different series (for example, one per year or one for corrective invoices).' },
        { q: 'How soon must I issue an invoice?', a: 'If the client is a business or freelancer, before the 16th of the month after the transaction. For private individuals, at the time of the sale.' }
      ],
      tool: 'nif', guides: ['verifactu', 'm303', 'reclamar']
    },

    verifactu: {
      title: 'VERI*FACTU and e-invoicing in Spain: what changes and when',
      description: 'What Spain’s VERI*FACTU is, when it becomes mandatory for companies and freelancers, and when mandatory B2B e-invoicing arrives.',
      h1: 'VERI*FACTU and e-invoicing in Spain',
      intro: 'Two different rules that are often confused: one affects the software you invoice with, the other the format of invoices between businesses.',
      sections: [
        { h: 'VERI*FACTU: invoicing software',
          ps: [
            'Royal Decree 1007/2023 requires invoicing software to create a record of each invoice, chained to the previous one so it cannot be altered, and to print a QR code on the invoice that the client can check on the AEAT website.',
            'It is mandatory from 1 January 2027 for companies and from 1 July 2027 for everyone else, including freelancers (dates set by Royal Decree-law 15/2025). If you invoice by hand or with Word and Excel, it does not apply.'
          ] },
        { h: 'The two modes',
          ps: ['In VERI*FACTU mode, the software sends each record to the tax office as it is created. In the other mode, records are signed and stored, and handed over if the tax office asks.'] },
        { h: 'B2B e-invoicing',
          ps: ['The “Crea y Crece” Act and Royal Decree 238/2026 will require structured electronic invoices between businesses and freelancers, reporting whether each invoice is accepted and when it is paid. The expected dates are 1 October 2027 for companies with over €8 million in turnover and 1 October 2028 for everyone else (one and two years after the ministerial order, which is still a draft).'] },
        { h: 'How Nokfi handles it',
          ps: ['Nokfi issues invoices with their chained record and QR code, and exports e-invoices in UBL, Facturae and Factur-X. Automatic submission to the AEAT will be switched on before it becomes mandatory.'] }
      ],
      faq: [
        { q: 'When does VERI*FACTU become mandatory?', a: 'For companies, from 1 January 2027; for freelancers and everyone else, from 1 July 2027.' },
        { q: 'Do I have to send my invoices to the tax office?', a: 'Only if your software works in VERI*FACTU mode, and it does it automatically. In the other mode, records are kept signed.' },
        { q: 'Is a PDF invoice an e-invoice?', a: 'Not for the new B2B obligation: it will have to be a structured format (UBL, Facturae, CII…) that software can read.' }
      ],
      tool: 'nif', guides: ['factura', 'reclamar']
    },

    reclamar: {
      title: 'How to chase an unpaid invoice in Spain, step by step',
      description: 'What to do when a client in Spain does not pay: reminders, formal demand, late-payment interest and the fast-track court procedure (monitorio).',
      h1: 'How to chase an unpaid invoice in Spain',
      intro: 'Most late payments are solved with a good, timely reminder. If not, there are clear steps before going to court.',
      sections: [
        { h: '1. A friendly reminder',
          ps: ['The day after the due date, send a short email with the invoice number, amount and date, and attach the invoice. It is often an oversight.'] },
        { h: '2. A firmer second notice',
          ps: ['If there is no reply within a week, call or write again asking for a specific payment date. Offering to split the payment can unblock things.'] },
        { h: '3. Formal demand',
          ps: ['By burofax or another method that leaves proof: claim the debt, set a deadline and warn that you will claim interest and go to court. Between businesses, Act 3/2004 sets a maximum payment term of 60 days and lets you claim late-payment interest (the ECB rate plus 8 points) and €40 for collection costs.'] },
        { h: '4. The monitorio procedure',
          ps: ['A fast court procedure for documented debts, with no upper limit. Up to €2,000 you need neither a lawyer nor a court agent: you file a form at the court of the debtor’s address.'] },
        { h: 'And the VAT you already paid',
          ps: ['If you declared VAT on an invoice you are not paid, in some cases you can recover it by adjusting the taxable base (bad debt). There are deadlines and requirements: check with an adviser.'] }
      ],
      faq: [
        { q: 'How long do I have to claim an invoice?', a: 'For most debts, five years (article 1964 of the Spanish Civil Code), although there are exceptions. The sooner you claim, the better.' },
        { q: 'Can I charge interest for late payment?', a: 'Between businesses, yes: Act 3/2004 lets you claim late-payment interest and €40 compensation per invoice.' },
        { q: 'Do I need a lawyer for a monitorio?', a: 'Not for debts up to €2,000. Above that, you need a lawyer and a court agent.' }
      ],
      guides: ['factura', 'apartar']
    }
  }
};
