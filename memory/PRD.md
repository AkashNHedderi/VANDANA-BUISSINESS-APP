# SteelBiz — Private Steel & Roofing Business App (PRD)

## Original Problem Statement
Private, single-user business management app for a steel/roofing trader (PPGI/PPGL coils, roofing sheets, GI sheets, MS/GI pipes, steel tubes, accessories). Must work on phone + laptop with the SAME cloud data (persistent MongoDB). Priorities: data storage + sync, sales, handwritten bill camera scanner, purchases + PDF scanner, inventory, customer/supplier outstanding, profit calc, "Ask My Business" NL analytics, reports. No public site, no multi-user.

## User & Choices
- Owner: akashhedderi@gmail.com (single user, PIN login — PIN 112233)
- Currency ₹, GST %. AI: OpenAI GPT-5.4 (Emergent LLM key). PDF invoices. CSV export.

## Architecture
- Backend: FastAPI (/app/backend/server.py), MongoDB (persistent, cloud). JWT (Bearer, 30d) from PIN. emergentintegrations LlmChat gpt-5.4 for OCR + analytics. PyMuPDF renders purchase PDFs to images for OpenAI vision. reportlab for PDF invoices. Object storage for scan images.
- Frontend: React + Tailwind + shadcn/ui. Dark "industrial forge" theme (Cabinet Grotesk / IBM Plex). Mobile bottom-nav + big quick actions; desktop sidebar. localStorage token. ONLINE/OFFLINE/SAVED status LED.

## Implemented (2026-06)
- PIN login (keypad), single-user seeding.
- Dashboard: sales/growth/profit/margin, stock value/qty, customer & supplier outstanding, low-stock, alerts, top outstanding; Today/Week/Month/Year filters.
- Sales: manual entry + handwritten bill camera scanner (editable review, NEEDS REVIEW flags) → inventory decrease + avg-cost COGS profit; downloadable PDF invoice.
- Purchases: manual + PDF/image invoice scanner → inventory increase + weighted-avg cost.
- Inventory: products (units KG/MT/PCS/FEET/SQ FT/COIL), stock adjust; Coil tracking (remaining weight).
- Customers/Suppliers: CRUD + detail with history & outstanding (matched by id OR name).
- Payments: customer receipts / supplier payments update balances.
- Reports: 6 types with range filter; CSV export (sales/purchases/inventory/customers) + full JSON backup.
- Ask My Business: NL analytics over real DB snapshot, follow-up context, date ranges; keyword + analytical.
- Settings: business details, PIN change, backup download.
- Tested: backend 28/28 pass; frontend all critical flows pass.

## Backlog / Next
- P1: rate-limit PIN attempts; negative-stock guard on sales.
- P2: clickable analytics drill-down to underlying transactions; split server.py into routers; PWA install/offline queue.
