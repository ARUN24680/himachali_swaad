# 🚨 AI Agent Execution Mandate (Pahadi Khatki)

Jab bhi is repository me koi bhi task, feature, bug fix, ya phase execute karne ko bola jaye, agent ko **FIRST STEP** ke roop me rules aur guidelines ko padhna aur follow karna MANDATORY hai.

## 📚 1. Mandatory Reading Order
1. **`Rules/00-project-rules.md`** — Constitution (UI stack, theme tokens, raw SQL, security, verification).
2. **`architecture/08-decisions-log.md`** — Saare final decisions (D-xx). **Docs me conflict ho toh yeh file jeetegi** — conflict ko user ko report karo.
3. **`architecture/07-order-state-machine.md`** — Order/payment statuses, transitions, stock reservation, canonical transaction code.
4. **`architecture/01-database-schema-models.md`** — Schema v2 + migrations.
5. **`architecture/09-codebase-structure.md`** — Folder structure, backend Nexus module pattern, hybrid frontend rules. Koi bhi file/folder banane se pehle.
6. **Specific phase file** jo execute karna hai (`Phases/`), aur us phase me referenced architecture docs.

## 📜 2. Non-Negotiable Rules (summary — details Rules file me)
- **Responsiveness:** Mobile, Tablet, Desktop teeno par perfect; zero horizontal overflow.
- **Strict UI Stack:** Sirf **Tailwind CSS v4 + shadcn/ui + Radix UI Primitives + Lucide React**.
- **Global Theme Palette:** Color hardcode banned (`bg-yellow-500`, `#hex`). Sirf semantic tokens (`bg-primary`, `bg-card`, `text-success`, ...).
- **Zero-ORM & Pure Raw SQL:** `pg` pool + parameterized SQL, migrations `dbmate`. No Prisma, No Sequelize.
- **Transactions:** Inventory aur payments `db.transaction()` + `SELECT ... FOR UPDATE` (sorted lock order). External API calls transaction ke andar kabhi nahi.
- **Status changes:** Sirf `transitionOrder()` se.
- **Code organisation:** Backend `routes → controller → service → repository`; Frontend hybrid `@pk/ui → components/common → modules/<feature>` (D-43, D-44).
- **Money:** Integer paise.
- **Design Reference Policy (Rules §1.5):** Stitch/Figma design sirf reference hai — copy nahi, better UI/aesthetic bana sakte ho toh banao (tokens, compliance, scope ke andar). Har UI kaam **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
- **Backend / logic / API kaam:** Har business logic, API, database migration, background job, integration (Razorpay/UPI, Shiprocket, WhatsApp/SMS, S3) aur frontend ko real endpoint se jodne ka kaam **sirf `backend-developer` agent** (`.claude/agents/backend-developer.md`) se. UI kaam `ui-developer` ke paas hi rahega.

## 🗺️ 3. Phase Execution Reference
`Phases/00-phases-master.md` single source of truth hai. Phase files:
- `Phases/phase-00-prerequisites-decisions.md`
- `Phases/phase-01-monorepo-core-db.md`
- `Phases/phase-02-auth-rbac-sessions.md`
- `Phases/phase-03-product-catalog-inventory.md`
- `Phases/phase-04-customer-storefront-cart.md`
- `Phases/phase-05-checkout-payment-webhooks.md`
- `Phases/phase-06-logistics-shiprocket-automation.md`
- `Phases/phase-07-partner-mobile-packing-desk.md`
- `Phases/phase-08-tracking-notifications.md`
- `Phases/phase-09-admin-operations-settlements.md`
- `Phases/phase-10-hardening-launch.md`

## ✅ 4. Completion Rules
- Phase ki Verification Checklist validate karke hi agle phase par move karna hai.
- **Kabhi bhi checklist item bina evidence ke tick (`[x]`) mat karo** — evidence = test name, screenshot, log ya PR link.
- Agar docs aapas me conflict karein: `architecture/08-decisions-log.md` follow karo aur conflict user ko report karo (chupke se assume mat karo).
