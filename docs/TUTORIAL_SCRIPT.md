# 🎬 MMH Inventory — Video Tutorial Script

**Video files:**
- `docs/app_tutorial.webm` — Part 1: full walkthrough (login → order → receipt → logs → admin)
- `docs/app_tutorial_part2.webm` — Part 2: admin adds a product + barcode scanning demo

**Demo login:** `demo@mmhills.com` / `demo1234`
**Narration language:** Taglish (adjust as needed)

---

## Scene 1 — Login (0:00 – 0:20)

**On screen:** Login screen. Email and password are typed, the 👁️ button is tapped to show the password, then Sign In.

**Narration:**
> "To start, each staff member signs in with the account created by the admin. You can tap the eye icon to double-check your password. Sessions persist — once you log in, you stay logged in until you sign out."

---

## Scene 2 — Home Dashboard (0:20 – 0:40)

**On screen:** Home screen — Demo Admin, check-in card (taps it → turns green "Checked In"), today's stats, low stock alert for Nails.

**Narration:**
> "This is the staff home screen. The big button is check-in / check-out — one tap to start your shift, one tap to end it. Everything is recorded in the attendance log.
>
> Below are today's stats — orders and sales update in real time. And these are low-stock alerts: the app warns you when items fall to their reorder point, like these nails — only 5 left."

---

## Scene 3 — New Order (0:40 – 1:10)

**On screen:** New Order tab → types customer name and phone → taps + Add on Cement 40kg, taps + Add twice on Paint Brush → cart shows qty steppers → selects Card payment → COMPLETE ORDER.

**Narration:**
> "Creating an order is fast: enter the customer, then tap plus on any product — or use the Scan button to add items by barcode. Quantities are adjustable with the steppers.
>
> Totals compute automatically — subtotal, delivery fee, and grand total. Choose the payment method — cash, card, or GCash — then complete the order. The stock is deducted automatically."

---

## Scene 4 — Receipt (1:10 – 1:25)

**On screen:** Receipt screen with full details, then Print / Save PDF, then Done.

**Narration:**
> "A receipt is generated instantly. Tap Print to save it as a PDF and share it to the customer through any app — Messenger, email, or a printer."

---

## Scene 5 — Stock (1:25 – 1:40)

**On screen:** Stock tab → search, sort chips (tap Stock → low stock first), product cards with low-stock badge.

**Narration:**
> "The Stock tab shows live inventory. Cement went from 145 to 144 after our order — automatic. You can search, and sort by name, price, stock level, or category. Admins can add or edit products here, and long-press to select several items for bulk changes."

---

## Scene 6 — Logs (1:40 – 1:55)

**On screen:** Logs tab → Sales tab shows the ₱490 order → Stock tab shows Cement −1, Paint Brush −2 → Attendance shows check-in history.

**Narration:**
> "Everything is logged. Sales logs show every transaction with who handled it. Stock logs track every increase and decrease — orders, manual adjustments, everything. And attendance shows every check-in and check-out, so you have a full audit trail."

---

## Scene 7 — Admin Dashboard (1:55 – 2:20)

**On screen:** Admin tab → metrics cards, recent orders (tap to expand status/payment), Daily Sales with PDF/CSV export, Top Staff, Settings, Roles with + Add Account and Delete.

**Narration:**
> "For managers and admins, the dashboard shows the big picture: today's sales, inventory value, receivables, and top staff.
>
> Tap any order to change its status or payment. Cancelling an order automatically returns the items to stock.
>
> Daily sales can be exported as PDF or CSV for Excel. And under Roles, the admin creates accounts — staff get check-in, orders, and stock only; managers get full access. Accounts can be deleted just as easily."

---

## Scene 8 — Sign Out (closing)

**On screen:** Home → Sign Out → confirmation → back to Login.

**Narration:**
> "At the end of the shift, sign out — your check-out is logged automatically. That's the whole system: one app for the warehouse, the counter, and the admin's desk."

---

---

# 🎬 PART 2 — Admin Product Setup & Barcode Scanning

## Scene A — Add Product (0:00 – 0:45)

**On screen:** Stock tab → + Add → modal fills out: Plywood 1/2 (4x8 ft), SKU PLY-12-001, category Boards, price ₱580, initial stock 35 → Save → product appears in the list.

**Narration:**
> "Before scanning works, the admin registers each product once. Stock tab, tap Add. Enter the name, SKU, category, price, and starting stock. If the item has a barcode, type or scan it into the barcode field — that's what links the physical label to the app.
>
> Tap Save — and Plywood is now live across every device instantly."

## Scene B — Barcode Scanning (0:45 – 1:20)

**On screen:** New Order → 📷 Scan → scanner modal (web shows manual entry; phones open the camera) → types PLY-12-001 → Find → Plywood auto-added to cart → complete order → receipt.

**Narration:**
> "Now the payoff: at the counter, the staff taps Scan. On a phone, the camera opens — point it at the product's barcode and it's added instantly. In this browser demo, we type the code instead — the lookup works the same.
>
> Found it — Plywood is in the cart. Complete the order, and the receipt is ready. One scan replaces searching a long list, so checkout stays fast even with hundreds of products.
>
> Tip: the code field also accepts SKUs, so staff can use whichever is printed on the label."

---

## Paano i-record ang sarili mong version na may audio

1. Windows: `Win + G` → Capture, o `Win + Alt + R` (Xbox Game Bar)
2. Buksan ang app sa browser: `npx expo start` → press `w`
3. I-set ang browser window sa ~390px wide (F12 → device toolbar → iPhone 12 Pro)
4. Basahin ang script sa itaas habang ginagawa ang mga galaw
5. I-edit gamit ang Clipchamp (built-in sa Windows 11) para magdagdag ng voiceover at subtitles
