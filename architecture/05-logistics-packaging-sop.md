# 📦 05. Physical Operations & Packaging SOP (Zero-Leakage Standard)

---

## 🛑 The Core Problem
Non-veg achaar me pure mustard oil hota hai. Interstate travel me air pressure aur vibrations ke kaaran standard dhakkan se tel nikal jata hai, jo box ko geela kar deta hai aur courier companies parcel return ya destroy kar deti hain.

---

## 🛡️ The 4-Layer Zero-Leakage Protocol

```
Layer 1: Headspace Clearance (15mm / ~1/2 inch air gap below jar rim)
   ↓
Layer 2: Pressure-Sensitive Induction/Foam Wad (Inside lug cap)
   ↓
Layer 3: Heat-Shrink PVC Band (Heat gun / hair dryer)
   ↓
Layer 4: 3-Layer Heavy Bubble Cushioning + Sturdy 3-Ply Cardboard Box (15 × 10 × 10 cm)
```

> **Upgrade recommendation:** Handheld **induction cap sealer** (approx ₹5,000–₹10,000) + induction-seal liners se mouth par foil seal lagti hai — foam wad se kaafi zyada leak-proof aur tamper-evident. Pilot batch ke baad lena worth hai.

---

## 📋 Packaging Step-by-Step SOP (Himachal Kitchen)

### Step 1: Bottling & Headspace
* Pickles ko sterilised, 100% dry glass jar me fill karein.
* Jar ke bilkul upar tak tel mat bharein. **Kam se kam 15mm (aadha inch) jagah khaali chhodein.**
* **Jar capacity note:** 250 g net pickle + covering oil + 15 mm headspace ek 250 ml jar me fit nahi bhi ho sakta — **fill trial karke** sahi jar size (e.g. 300–350 ml) finalize karein.

### Step 2: Cap Sealing
* Lug cap ke andar self-adhesive foam seal wad (ya induction liner) check karein.
* Cap ko haath se poori taaqat se tight band karein (induction sealer ho toh seal karein).

### Step 3: PVC Shrink Sleeve Application
* Jar ke dhakkan aur neck ke upar PVC transparent shrink sleeve chadhayein.
* Standard hair dryer (high heat) ya 1500W heat gun se 5-10 second charo taraf heat blow karein.
* Plastic sleeve jar ke sath airtight lock ho jayegi.

### Step 4: Weighing QC (har jar)
* Digital scale (0.1 g ya 1 g least count) par **har jar ka net weight** check karein (tare = khaali jar + cap).
* Declared net quantity se kam weight wala jar **dispatch nahi hoga** — Legal Metrology (Packaged Commodities) Rules me negative tolerance limits hain; target hamesha declared weight ya thoda upar.
* Packed parcel ka weight bhi check: **target ≤ 500 g for 250 g SKU** (D-34) — 500 g slab cross hua toh har order par next slab ka courier charge.

### Step 5: Labeling & Batch Stamping
* Clean, dry surface par vinyl sticker lagayein.
* Batch No. (system generated, e.g. `PK-2610-CHK250-01`, D-42), Mfg Date, aur Expiry / Best Before stamp karein — **system me jo batch registered hai wahi** (handheld dater stamp).

### Step 6: Box Packing & Courier Handover
* Sealed jar par 2-3 turns heavy bubble wrap lagakar tape karein.
* Standard **15 × 10 × 10 cm** 3-ply box (D-33 — system ke `products.package_*_cm` yahi values use karte hain; box change ho toh product settings bhi update karein). Box ko hilakar dekhein — **jar bilkul hilna nahi chahiye.**
* Box par printed 4×6 shipping label (Packing Desk se print) paste karein.
* **"FRAGILE - HANDLE WITH CARE"** aur **"THIS SIDE UP ⬆️"** sticker lagayein.
* Packing Desk par **MARK PACKED** karein; courier pickup daily cut-off (11 AM IST, D-36) ke hisaab se aayega. Handover par pickup boy se scan/receipt confirm karein.

---

## 🏷️ Mandatory Jar Label Contents (FSSAI Labelling & Display + Legal Metrology)
Label design finalize karne se pehle FSSAI consultant se verify karein:
1. Product name (e.g. "Himachali Chicken Pickle")
2. List of ingredients (descending order by weight)
3. Nutritional information (per 100 g)
4. **Non-veg mark** (brown circle in brown square)
5. **FSSAI logo + license number**
6. Batch / Lot number
7. Date of manufacture/packing + **Expiry / Use by / Best before**
8. Net quantity (g)
9. **MRP (incl. of all taxes)**
10. Name & complete address of manufacturer / packer (+ marketer if different)
11. Customer care details (phone/email)
12. Storage instructions ("Store in a cool, dry place. Always use a dry spoon.") + allergen declaration if applicable

---

## ↩️ Returns, RTO & Damage
* **RTO (Return-to-Origin) jars restock nahi honge** — transit me temperature abuse ho sakta hai; jar discard karein aur system me RTO receive mark ho (D-31).
* Sirf woh jars wapas stock me jaate hain jo kitchen se nikle hi nahi (pickup se pehle cancel).
* Transit damage / leakage claim policy (unboxing video required ya nahi, refund vs replacement) — **Q-04, business decide karega**; policy `legal/refund-cancellation` page par publish hogi.

---

## 🛒 Procurement Checklist & Vendors

| Item | Specification | Where to Buy | Approx Cost |
| :--- | :--- | :--- | :--- |
| **Glass Jars** | 250ml / 350ml Lug Cap Round Glass (fill trial se finalize) | IndiaMART / Local Wholesaler | ₹12–₹16 / piece |
| **Metal Caps** | 63mm Lug Cap with Plastisol liner | IndiaMART | ₹3–₹4 / cap |
| **Shrink Bands** | 63mm PVC Cut Shrink Sleeves | Amazon / IndiaMART | ₹1.50 / piece |
| **Sticker Labels** | Matte laminated waterproof Vinyl | Local Flex / Digital Print shop | ₹4–₹6 / sticker |
| **Boxes** | 3-ply Corrugated (15cm x 10cm x 10cm) | Amazon / Local Box Factory | ₹6–₹9 / box |
| **Bubble Wrap** | 50 GSM Air Bubble Roll | Amazon / Local Packaging store | ₹400 / 100m roll |
| **Date Stamp** | Trodat / Colop Handheld Dater | Amazon | ₹250 (one-time) |
| **Digital Scale** | 0–5 kg, 1 g least count (stamped/verified) | Amazon / Local | ₹800–₹1,500 (one-time) |
| **Induction Cap Sealer** *(optional upgrade)* | Handheld, 20–100 mm caps + induction liners | IndiaMART | ₹5,000–₹10,000 (one-time) |

> Packaging per-jar cost ka estimate (`settings.packaging_cost_per_jar_paise`, default ₹32) settlements me use hota hai (D-41) — actual purchase prices ke hisaab se update karte rahein.
