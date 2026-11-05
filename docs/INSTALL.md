# PDBull overlay — instalare în OBS

Totul rulează de pe GitHub Pages; se actualizează singur (verifică o versiune nouă la 2 minute și se reîncarcă).

## 0. O singură dată: accelerare hardware
OBS → **Settings → Advanced → Sources** → bifează **Enable Browser Source Hardware Acceleration** → OK → repornește OBS.

## 1. Dock-ul de control
1. **Docks → Custom Browser Docks…**
2. Dock Name: `PDBull` · URL: `https://pdbultoc.github.io/pdbull-overlay/panel.html` → **Apply**.
3. Sus în dock apare **Room** cu un cod. Butoanele de mai jos copiază link-urile cu codul tău.
4. La **Alerts → Streamlabs token**: lipește tokenul (Streamlabs → Settings → API Settings → API Tokens → *Your Socket API Token*). Rămâne doar în dock.
5. Șterge dock-ul și sursa de probă de la testul T1, dacă mai sunt.

## 2. Sursele (toate Browser Source, **1920 × 1080**)
| Scena | Buton în dock | Unde o pui |
|---|---|---|
| Joc | **Copy overlay link** | deasupra capturii de joc, deasupra camerei |
| Starting Soon | **Copy Starting link** | singura sursă din scenă |
| BRB | **Copy BRB link** | singura sursă din scenă |

Pentru fiecare: **+ → Browser** → lipești link-ul în **URL** → Width 1920, Height 1080 → OK.
La **Starting** și **BRB** bifează **Shutdown source when not visible** (nu consumă placa video cât joci). Dacă la trecerea pe scenă vezi o clipă un cadru gol, debifează și spune-mi.

## 3. Camera
În scena de joc, sursa camerei stă **sub** overlay, la **X 8, Y 755**, mărime **322 × 180** (rama de nuc din overlay o încadrează).

## 4. Folosire
- **Starting soon**: alegi minutele → **Start countdown**. La zero scrie „Starting now”. **Reset** oprește countdown-ul.
- **BRB → Text**: ce scrie fumul (implicit „Be right back”).
- **Alerts**: bifezi ce tipuri vrei; **sound** pornește/oprește sunetul; la *Sound follow/sub/bits/donation* poți pune un link către propriul fișier audio (gol = sunetul inclus). Butoanele de test arată fiecare alertă.
- **Intro**: pornește singur la începutul fiecărui meci (profilul tău aoe2companion, PDBull). **Test intro 1v1 / 4v4** îl arată oricând.

## 5. De știut
- Nu schimba bifele/sunetele de la Alerts **exact cât rulează o alertă**: alerta curentă se oprește.
- Dacă BRB se mișcă greu în timpul streamului, adaugă `&q=low` la sfârșitul link-ului din sursa BRB (mai puțin fum, fără blur).
- Chatul citește canalul `pdbull` fără cont (doar citire).
- Donația caritabilă Twitch, raid și Power-up nu au încă alertă proprie.
